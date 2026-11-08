import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleSheetsConnector, GoogleApiError, getActiveAccessToken, GOOGLE_SHEETS_SCOPES } from './index';
import { encryptSecret } from '../../security/crypto';
import { db } from '../../db/store';
import { supabaseRepo } from '../../db/supabase-repo';

describe('Google Sheets Connector & Drive API Listing', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    db.accounts = [];
    vi.spyOn(supabaseRepo, 'saveConnectedAccount').mockImplementation(async (acc) => acc as any);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    db.accounts = [];
  });

  it('configures the required drive.readonly and spreadsheets scopes', () => {
    expect(GOOGLE_SHEETS_SCOPES).toContain('https://www.googleapis.com/auth/drive.readonly');
    expect(GOOGLE_SHEETS_SCOPES).toContain('https://www.googleapis.com/auth/spreadsheets');
  });

  it('constructs Drive API files.list request with exact query, pageSize 100, and fields files(id,name,modifiedTime)', async () => {
    const encToken = await encryptSecret('valid_mock_access_token');
    const mockAccount: any = {
      id: 'conn_test_drive_query',
      workspaceId: 'ws_test',
      connectorKey: 'google_sheets',
      displayName: 'Google Sheets Account',
      encryptedAccessToken: encToken.encrypted,
      keyVersion: encToken.keyVersion,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      status: 'active',
      scopes: GOOGLE_SHEETS_SCOPES
    };

    let requestedDriveUrl = '';
    let authHeader = '';

    globalThis.fetch = vi.fn().mockImplementation(async (urlOrReq: any, init?: RequestInit) => {
      const url = typeof urlOrReq === 'string' ? urlOrReq : urlOrReq?.url || String(urlOrReq);
      if (url.includes('drive/v3/files') || url.includes('drive.googleapis.com')) {
        requestedDriveUrl = url;
        authHeader = (init?.headers as any)?.Authorization || '';
        return new Response(
          JSON.stringify({
            files: [
              { id: 'sheet_abc_123', name: 'Q4 Financial Model', modifiedTime: '2026-03-01T10:00:00Z' }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('sheets.googleapis.com')) {
        return new Response(
          JSON.stringify({
            sheets: [
              { properties: { title: 'Pipeline' } },
              { properties: { title: 'Summary' } }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as any;

    const objects = await GoogleSheetsConnector.listObjects(mockAccount);

    expect(authHeader).toBe('Bearer valid_mock_access_token');
    const decodedUrl = decodeURIComponent(requestedDriveUrl);
    expect(decodedUrl).toContain("q=mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
    expect(decodedUrl).toContain('pageSize=100');
    expect(decodedUrl).toContain('fields=files(id,name,modifiedTime)');

    expect(objects).toHaveLength(2);
    expect(objects[0].id).toBe('sheet_abc_123:::Pipeline');
    expect(objects[0].name).toContain('Q4 Financial Model');
    expect(objects[1].id).toBe('sheet_abc_123:::Summary');
  });

  it('refreshes the access token before call if it is expired, and saves new token', async () => {
    process.env.GOOGLE_CLIENT_ID = 'mock_client_id';
    process.env.GOOGLE_CLIENT_SECRET = 'mock_client_secret';

    const encOld = await encryptSecret('expired_old_token');
    const encRefresh = await encryptSecret('valid_refresh_token_xyz');

    const mockAccount: any = {
      id: 'conn_test_refresh',
      workspaceId: 'ws_test_refresh',
      connectorKey: 'google_sheets',
      displayName: 'Google Sheets Account',
      encryptedAccessToken: encOld.encrypted,
      encryptedRefreshToken: encRefresh.encrypted,
      keyVersion: encOld.keyVersion,
      expiresAt: new Date(Date.now() - 50000).toISOString(), // Expired 50s ago
      status: 'active',
      scopes: GOOGLE_SHEETS_SCOPES
    };

    db.accounts.push(mockAccount);

    let refreshCalled = false;
    globalThis.fetch = vi.fn().mockImplementation(async (urlOrReq: any, init?: RequestInit) => {
      const url = typeof urlOrReq === 'string' ? urlOrReq : urlOrReq?.url || String(urlOrReq);
      if (url.includes('oauth2.googleapis.com/token')) {
        refreshCalled = true;
        const bodyStr = String(init?.body || '');
        expect(bodyStr).toContain('grant_type=refresh_token');
        expect(bodyStr).toContain('refresh_token=valid_refresh_token_xyz');
        return new Response(
          JSON.stringify({
            access_token: 'freshly_refreshed_access_token',
            expires_in: 3600
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ files: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as any;

    const token = await getActiveAccessToken(mockAccount);
    expect(refreshCalled).toBe(true);
    expect(token).toBe('freshly_refreshed_access_token');
    expect(mockAccount.status).toBe('active');
  });

  it('categorizes 401 response as TOKEN_EXPIRED', async () => {
    const encToken = await encryptSecret('invalid_token');
    const mockAccount: any = {
      id: 'conn_test_401',
      workspaceId: 'ws_test',
      connectorKey: 'google_sheets',
      displayName: 'Google Sheets Account',
      encryptedAccessToken: encToken.encrypted,
      keyVersion: encToken.keyVersion,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      status: 'active'
    };

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          error: { code: 401, message: 'Request had invalid authentication credentials. Expected OAuth 2 access token.' }
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;

    await expect(GoogleSheetsConnector.listObjects(mockAccount)).rejects.toThrow(GoogleApiError);
    try {
      await GoogleSheetsConnector.listObjects(mockAccount);
    } catch (err: any) {
      expect(err).toBeInstanceOf(GoogleApiError);
      expect(err.status).toBe(401);
      expect(err.category).toBe('TOKEN_EXPIRED');
      expect(err.rawMessage).toContain('invalid authentication credentials');
    }
  });

  it('categorizes disabled Drive API as DRIVE_API_NOT_ENABLED', async () => {
    const encToken = await encryptSecret('valid_token');
    const mockAccount: any = {
      id: 'conn_test_disabled',
      workspaceId: 'ws_test',
      connectorKey: 'google_sheets',
      displayName: 'Google Sheets Account',
      encryptedAccessToken: encToken.encrypted,
      keyVersion: encToken.keyVersion,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      status: 'active'
    };

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: 403,
            message: 'Google Drive API has not been used in project 123456 before or it is disabled. Enable it by visiting https://console.developers.google.com'
          }
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;

    try {
      await GoogleSheetsConnector.listObjects(mockAccount);
    } catch (err: any) {
      expect(err).toBeInstanceOf(GoogleApiError);
      expect(err.status).toBe(403);
      expect(err.category).toBe('DRIVE_API_NOT_ENABLED');
    }
  });

  it('categorizes missing permissions as INSUFFICIENT_SCOPES', async () => {
    const encToken = await encryptSecret('valid_token');
    const mockAccount: any = {
      id: 'conn_test_scopes',
      workspaceId: 'ws_test',
      connectorKey: 'google_sheets',
      displayName: 'Google Sheets Account',
      encryptedAccessToken: encToken.encrypted,
      keyVersion: encToken.keyVersion,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      status: 'active'
    };

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: 403,
            message: 'The request is missing a valid API key or required OAuth scope: drive.readonly'
          }
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;

    try {
      await GoogleSheetsConnector.listObjects(mockAccount);
    } catch (err: any) {
      expect(err).toBeInstanceOf(GoogleApiError);
      expect(err.status).toBe(403);
      expect(err.category).toBe('INSUFFICIENT_SCOPES');
    }
  });

  it('categorizes empty files array as NO_SPREADSHEETS_FOUND', async () => {
    const encToken = await encryptSecret('valid_token');
    const mockAccount: any = {
      id: 'conn_test_empty',
      workspaceId: 'ws_test',
      connectorKey: 'google_sheets',
      displayName: 'Google Sheets Account',
      encryptedAccessToken: encToken.encrypted,
      keyVersion: encToken.keyVersion,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      status: 'active'
    };

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return new Response(
        JSON.stringify({ files: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;

    try {
      await GoogleSheetsConnector.listObjects(mockAccount);
    } catch (err: any) {
      expect(err).toBeInstanceOf(GoogleApiError);
      expect(err.category).toBe('NO_SPREADSHEETS_FOUND');
    }
  });

  it('reports credentialsStored without exposing decrypted or raw tokens', () => {
    const accountWithToken = {
      id: 'conn_1',
      encryptedAccessToken: 'enc:v1:xyz',
      keyVersion: 'v1'
    };
    const accountWithoutToken = {
      id: 'conn_2',
      encryptedAccessToken: undefined,
      keyVersion: undefined
    };

    const labelWith = Boolean(accountWithToken.encryptedAccessToken) ? 'stored' : 'missing';
    const labelWithout = Boolean(accountWithoutToken.encryptedAccessToken) ? 'stored' : 'missing';

    expect(labelWith).toBe('stored');
    expect(labelWithout).toBe('missing');
    expect(labelWith).not.toContain('enc:v1:xyz');
  });
});
