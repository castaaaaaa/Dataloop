/**
 * Google Sheets Connector
 * Connects to Google Sheets API v4 and Google Drive API v3 using narrowest scopes:
 * - https://www.googleapis.com/auth/spreadsheets (read/write chosen spreadsheets)
 * - https://www.googleapis.com/auth/drive.readonly (list user spreadsheets)
 * - https://www.googleapis.com/auth/userinfo.email (identify connected account email)
 *
 * Implements exponential backoff on HTTP 429 and 5xx errors, token decryption,
 * header detection for schema discovery, and row CRUD with zero mock data.
 */

import { Connector, ConnectorAccount, ReadRecordsOptions } from '../interface';
import {
  UniversalSchema,
  UniversalRecord,
  ObjectRef,
  WriteResult,
  NormalizedError,
  UniversalFieldType
} from '../../sync-engine/types';
import { computeStableHash } from '../../sync-engine/hasher';
import { decryptSecret, encryptSecret } from '../../security/crypto';
import { db } from '../../db/store';

export const GOOGLE_SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email'
];

/**
 * Fetch wrapper with exponential backoff on 429 and 5xx errors
 */
export async function fetchWithBackoff(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const res = await fetch(url, options);

      // If rate limited (429) or Google server error (500, 502, 503, 504)
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        attempt++;
        const retryAfterHeader = res.headers.get('Retry-After');
        let delayMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : 0;
        if (!delayMs || isNaN(delayMs)) {
          // Exponential backoff: 1s, 2s, 4s + jitter
          delayMs = Math.min(10000, 1000 * Math.pow(2, attempt - 1) + Math.random() * 300);
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      return res;
    } catch (err: any) {
      if (attempt < maxRetries) {
        attempt++;
        const delayMs = Math.min(10000, 1000 * Math.pow(2, attempt - 1) + Math.random() * 300);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }

  throw new Error(`Request failed after ${maxRetries} retry attempts to ${url}`);
}

export class GoogleApiError extends Error {
  status: number;
  category: 'TOKEN_EXPIRED' | 'DRIVE_API_NOT_ENABLED' | 'INSUFFICIENT_SCOPES' | 'NO_SPREADSHEETS_FOUND' | 'GOOGLE_ERROR';
  rawMessage: string;

  constructor(
    status: number,
    rawMessage: string,
    category: 'TOKEN_EXPIRED' | 'DRIVE_API_NOT_ENABLED' | 'INSUFFICIENT_SCOPES' | 'NO_SPREADSHEETS_FOUND' | 'GOOGLE_ERROR'
  ) {
    super(`Google API Error (HTTP ${status}): ${rawMessage}`);
    this.name = 'GoogleApiError';
    this.status = status;
    this.rawMessage = rawMessage;
    this.category = category;
  }
}

/**
 * Resolves decrypted, active access token for a connected Google Sheets account.
 * Automatically refreshes the token if expired or on 401, and saves the new token to Supabase Postgres.
 */
export async function getActiveAccessToken(account: ConnectorAccount): Promise<string> {
  const tokenStartTime = Date.now();
  let found = db.accounts.find((a) => a.id === account.id || (a.connectorKey === 'google_sheets' && a.workspaceId === account.workspaceId));
  if (!found) {
    found = account as any;
  }
  if (!found) {
    throw new GoogleApiError(401, 'No Google Sheets account connected in this workspace. Please connect in Connections.', 'TOKEN_EXPIRED');
  }

  const rawEncrypted = found.encryptedAccessToken || (account as any).accessToken;
  let token = rawEncrypted ? await decryptSecret(rawEncrypted) : '';

  // Check if expired and refresh token is available (refresh 60 seconds prior to expiration)
  const isExpired = found.expiresAt ? new Date(found.expiresAt).getTime() < Date.now() + 60000 : !token;
  if (!isExpired && token) {
    console.log(`[SchemaTiming] Google token valid until ${found.expiresAt || 'session end'} (not expired). Skipping refresh: ${Date.now() - tokenStartTime}ms`);
    return token;
  }

  if (isExpired && found.encryptedRefreshToken) {
    console.log(`[SchemaTiming] Google token is expired or missing (expiresAt: ${found.expiresAt || 'none'}). Refreshing token...`);
    const refreshToken = await decryptSecret(found.encryptedRefreshToken);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (refreshToken && clientId && clientSecret && clientId !== 'not-used' && clientSecret !== 'not-used') {
      try {
        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
          })
        });

        if (refreshRes.ok) {
          const data = await refreshRes.json();
          token = data.access_token;
          const encNew = await encryptSecret(token);
          found.encryptedAccessToken = encNew.encrypted;
          found.expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
          found.status = 'active';
          found.updatedAt = new Date().toISOString();

          // If a new refresh token is returned, update it too
          if (data.refresh_token) {
            const encNewRefresh = await encryptSecret(data.refresh_token);
            found.encryptedRefreshToken = encNewRefresh.encrypted;
          }

          // Save new token to Supabase database connected_accounts table!
          try {
            if (typeof window === 'undefined') {
              const { supabaseRepo } = await import('../../db/supabase-repo');
              await supabaseRepo.saveConnectedAccount(found);
            }
          } catch (dbErr) {
            console.warn('[GoogleOAuth:token_refresh_db_save]', dbErr);
          }
          db.saveToStorage();
        } else {
          const errBody = await refreshRes.json().catch(() => ({}));
          const errMsg = errBody.error_description || errBody.error || 'Token expired or revoked';
          found.status = 'needs_reconnect';
          try {
            if (typeof window === 'undefined') {
              const { supabaseRepo } = await import('../../db/supabase-repo');
              await supabaseRepo.saveConnectedAccount(found);
            }
          } catch (_e) {}
          db.saveToStorage();
          throw new GoogleApiError(refreshRes.status, errMsg, 'TOKEN_EXPIRED');
        }
      } catch (err: any) {
        if (err instanceof GoogleApiError) throw err;
        console.error('[GoogleOAuth:refresh_token_exception]', err);
      }
    }
  }

  if (!token) {
    throw new GoogleApiError(401, 'Google Sheets access token missing or could not be decrypted. Reconnect your account.', 'TOKEN_EXPIRED');
  }

  // Keep in memory cache
  const existingIdx = db.accounts.findIndex((a) => a.id === found.id || (a.connectorKey === 'google_sheets' && a.workspaceId === found.workspaceId));
  if (existingIdx >= 0) {
    db.accounts[existingIdx] = found;
  } else {
    db.accounts.push(found);
  }

  console.log(`[SchemaTiming] Google token resolution completed: ${Date.now() - tokenStartTime}ms`);
  return token;
}

export const GoogleSheetsConnector: Connector = {
  id: 'google_sheets',
  displayName: 'Google Sheets',
  capabilities: {
    read: true,
    write: true,
    delete: false,
    webhooks: false,
    incrementalSync: false,
    schemaDiscovery: true
  },
  auth: {
    type: 'oauth2',
    getAuthUrl: ({ redirectUri, state }) => {
      const clientId = process.env.GOOGLE_CLIENT_ID || '';
      const scopes = encodeURIComponent(GOOGLE_SHEETS_SCOPES.join(' '));
      return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&response_type=code&scope=${scopes}&access_type=offline&prompt=consent&state=${state}`;
    },
    exchangeCode: async () => {
      throw new Error('Google OAuth token exchange must be completed via /api/auth/google/callback on the server.');
    },
    requiredScopes: GOOGLE_SHEETS_SCOPES
  },

  /**
   * List real spreadsheets and sheets from the user's Google Drive.
   * Uses Drive API files.list with:
   * - q = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
   * - pageSize = 100
   * - fields = "files(id,name,modifiedTime)"
   */
  listObjects: async (account) => {
    // 1. Refresh access token before call if expired, save new token
    let token = await getActiveAccessToken(account);

    // 2. Drive API files.list per Requirement 1
    const driveUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
    )}&pageSize=100&fields=${encodeURIComponent('files(id,name,modifiedTime)')}`;

    let driveRes = await fetchWithBackoff(driveUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // If 401 returned, attempt token refresh and retry once
    if (driveRes.status === 401 && account.encryptedRefreshToken) {
      try {
        (account as any).expiresAt = new Date(0).toISOString();
        token = await getActiveAccessToken(account);
        driveRes = await fetchWithBackoff(driveUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (_e) {
        // proceed to error categorization
      }
    }

    if (!driveRes.ok) {
      const errData = await driveRes.json().catch(() => null);
      const rawMessage = errData?.error?.message || (await driveRes.text().catch(() => 'Unknown Google error'));
      const status = driveRes.status;
      const lower = (rawMessage || '').toLowerCase();

      let category: 'TOKEN_EXPIRED' | 'DRIVE_API_NOT_ENABLED' | 'INSUFFICIENT_SCOPES' | 'GOOGLE_ERROR' = 'GOOGLE_ERROR';
      if (status === 401 || lower.includes('invalid_grant') || lower.includes('expired') || lower.includes('revoked') || lower.includes('unauthenticated')) {
        category = 'TOKEN_EXPIRED';
      } else if (status === 403 && (lower.includes('drive api has not been used') || lower.includes('accessnotconfigured') || lower.includes('disabled') || lower.includes('enable it by visiting'))) {
        category = 'DRIVE_API_NOT_ENABLED';
      } else if (status === 403 && (lower.includes('insufficient') || lower.includes('scope'))) {
        category = 'INSUFFICIENT_SCOPES';
      }

      throw new GoogleApiError(status, rawMessage, category);
    }

    const driveData = await driveRes.json();
    const files: Array<{ id: string; name: string; modifiedTime?: string }> = driveData.files || [];

    if (files.length === 0) {
      throw new GoogleApiError(200, 'No spreadsheets found in your Google Drive', 'NO_SPREADSHEETS_FOUND');
    }

    const objects: ObjectRef[] = [];

    // For spreadsheets, discover individual sheets/tabs
    for (const file of files) {
      try {
        const sheetMetaRes = await fetchWithBackoff(
          `https://sheets.googleapis.com/v4/spreadsheets/${file.id}?fields=sheets.properties`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (sheetMetaRes.ok) {
          const sheetMeta = await sheetMetaRes.json();
          const sheets = sheetMeta.sheets || [];
          if (sheets.length > 0) {
            for (const s of sheets) {
              const tabTitle = s.properties?.title || 'Sheet1';
              objects.push({
                id: `${file.id}:::${tabTitle}`,
                name: `${file.name} — Tab: ${tabTitle}`,
                type: 'spreadsheet'
              });
            }
            continue;
          }
        }
      } catch (_e) {
        // fallback to default Sheet1
      }

      objects.push({
        id: `${file.id}:::Sheet1`,
        name: `${file.name} — Tab: Sheet1`,
        type: 'spreadsheet'
      });
    }

    return objects;
  },

  /**
   * Fetch schema by reading Row 1 header cells of the selected spreadsheet and tab.
   */
  getSchema: async (account, object) => {
    const tTokenStart = Date.now();
    const token = await getActiveAccessToken(account);
    const tokenDurationMs = Date.now() - tTokenStart;
    console.log(`[SchemaTiming] Step 2 (Token): Token ready in ${tokenDurationMs}ms`);

    const [spreadsheetId, tabTitle = 'Sheet1'] = object.id.split(':::');
    const safeTab = tabTitle.replace(/'/g, '');
    const range = encodeURIComponent(`${safeTab}!1:1`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;

    const tGoogleStart = Date.now();
    const res = await fetchWithBackoff(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const googleDurationMs = Date.now() - tGoogleStart;
    console.log(`[SchemaTiming] Step 3 (Google request): values.get range ${safeTab}!1:1 took ${googleDurationMs}ms (HTTP ${res.status})`);

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Failed to read headers from Google Sheet (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    const headers: string[] = (data.values && data.values[0]) || [];

    if (headers.length === 0) {
      return {
        objectId: object.id,
        name: object.name,
        fields: []
      };
    }

    return {
      objectId: object.id,
      name: object.name,
      fields: headers.map((h, idx) => {
        const cleanKey = (h || `col_${idx + 1}`).toLowerCase().replace(/[^a-z0-9_]/g, '_');
        return {
          key: cleanKey,
          label: h || `Column ${idx + 1}`,
          type: (cleanKey.includes('email') ? 'email' : 'text') as UniversalFieldType,
          required: false,
          readOnly: false
        };
      })
    };
  },

  /**
   * Read rows from Row 2 downwards.
   */
  readRecords: async (account, object, opts: ReadRecordsOptions) => {
    const token = await getActiveAccessToken(account);
    const [spreadsheetId, tabTitle = 'Sheet1'] = object.id.split(':::');

    const range = encodeURIComponent(`'${tabTitle}'!A1:ZZ`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;

    const res = await fetchWithBackoff(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      return { records: [] };
    }

    const data = await res.json();
    const rows: string[][] = data.values || [];
    if (rows.length < 2) {
      return { records: [] };
    }

    const headers = rows[0].map((h, i) => (h || `col_${i + 1}`).toLowerCase().replace(/[^a-z0-9_]/g, '_'));
    const records: UniversalRecord[] = [];

    // Rows start at index 1 (which corresponds to row 2 in Sheets)
    for (let rIdx = 1; rIdx < rows.length; rIdx++) {
      const row = rows[rIdx];
      const values: Record<string, unknown> = {};
      headers.forEach((h, cIdx) => {
        values[h] = row[cIdx] !== undefined ? row[cIdx] : '';
      });

      const rowNumber = rIdx + 1;
      records.push({
        externalId: String(rowNumber),
        values,
        updatedAt: new Date().toISOString(),
        hash: computeStableHash(values)
      });
    }

    const pageSize = opts.pageSize || 100;
    const offset = opts.cursor ? parseInt(opts.cursor, 10) : 0;
    const paged = records.slice(offset, offset + pageSize);
    const nextCursor = offset + pageSize < records.length ? String(offset + pageSize) : undefined;

    return { records: paged, nextCursor };
  },

  /**
   * Append a new row to the destination Google Sheet.
   */
  createRecord: async (account, object, rec): Promise<WriteResult> => {
    const token = await getActiveAccessToken(account);
    const [spreadsheetId, tabTitle = 'Sheet1'] = object.id.split(':::');

    // First fetch headers so values are written in correct column positions
    const headerRange = encodeURIComponent(`'${tabTitle}'!1:1`);
    const headerRes = await fetchWithBackoff(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${headerRange}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    let headers: string[] = [];
    if (headerRes.ok) {
      const data = await headerRes.json();
      headers = (data.values && data.values[0]) || [];
    }

    let rowValues: unknown[] = [];
    if (headers.length > 0) {
      rowValues = headers.map((h) => {
        const key = h.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        return rec.values[key] !== undefined ? rec.values[key] : (rec.values[h] ?? '');
      });
    } else {
      rowValues = Object.values(rec.values);
    }

    const appendRange = encodeURIComponent(`'${tabTitle}'!A:A`);
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const appendRes = await fetchWithBackoff(appendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [rowValues] })
    });

    if (!appendRes.ok) {
      const errText = await appendRes.text();
      throw new Error(`Google Sheets append failed (${appendRes.status}): ${errText}`);
    }

    const appendData = await appendRes.json();
    const updatedRange = appendData.updates?.updatedRange || '';
    const matchRow = updatedRange.match(/!A(\d+)/);
    const newRowId = matchRow ? matchRow[1] : `row_${Date.now()}`;

    return {
      success: true,
      externalId: newRowId,
      updatedAt: new Date().toISOString()
    };
  },

  /**
   * Update an existing row by row index in the destination Google Sheet.
   */
  updateRecord: async (account, object, externalId, rec): Promise<WriteResult> => {
    const token = await getActiveAccessToken(account);
    const [spreadsheetId, tabTitle = 'Sheet1'] = object.id.split(':::');

    const rowNumber = parseInt(externalId, 10);
    if (!rowNumber || isNaN(rowNumber)) {
      throw new Error(`Invalid Google Sheets row index for update: '${externalId}'`);
    }

    // Fetch header keys
    const headerRange = encodeURIComponent(`'${tabTitle}'!1:1`);
    const headerRes = await fetchWithBackoff(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${headerRange}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    let headers: string[] = [];
    if (headerRes.ok) {
      const data = await headerRes.json();
      headers = (data.values && data.values[0]) || [];
    }

    let rowValues: unknown[] = [];
    const values = rec.values || {};
    if (headers.length > 0) {
      rowValues = headers.map((h) => {
        const key = h.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        return values[key] !== undefined ? values[key] : (values[h] ?? '');
      });
    } else {
      rowValues = Object.values(values);
    }

    const updateRange = encodeURIComponent(`'${tabTitle}'!A${rowNumber}:ZZ${rowNumber}`);
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${updateRange}?valueInputOption=USER_ENTERED`;

    const updateRes = await fetchWithBackoff(updateUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [rowValues] })
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      throw new Error(`Google Sheets row update failed (${updateRes.status}): ${errText}`);
    }

    return {
      success: true,
      externalId,
      updatedAt: new Date().toISOString()
    };
  },

  rateLimitPolicy: {
    requestsPerSecond: 1,
    burst: 5,
    respectRetryAfter: true
  },

  mapError: (err: unknown): NormalizedError => {
    const msg = String(err);
    if (msg.includes('429') || msg.includes('Quota exceeded')) {
      return {
        category: 'rate_limit',
        code: 'GOOGLE_SHEETS_RATE_LIMIT',
        userMessage: 'Google Sheets API quota exceeded (HTTP 429). Retried with exponential backoff.',
        fixHint: 'The sync engine automatically backs off and retries.'
      };
    }
    if (msg.includes('401') || msg.includes('invalid_grant')) {
      return {
        category: 'auth',
        code: 'GOOGLE_AUTH_EXPIRED',
        userMessage: 'Google Sheets authorization expired or revoked.',
        fixHint: 'Go to Connections and click Reconnect.'
      };
    }
    return {
      category: 'unknown',
      code: 'GOOGLE_SHEETS_ERROR',
      userMessage: `Google Sheets error: ${msg}`
    };
  }
};
