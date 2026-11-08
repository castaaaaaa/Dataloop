/**
 * CSV Connector & Dataset Processor
 * Implements CSV parsing, column & type detection, formula injection protection,
 * and universal record generation scoped strictly to workspaces.
 * Follows Stage 2 specifications: Max 10MB, max 50,000 rows, zero mock data.
 */

import { Connector, ReadRecordsOptions } from '../interface';
import {
  UniversalSchema,
  UniversalRecord,
  UniversalFieldType,
  ObjectRef,
  WriteResult,
  NormalizedError
} from '../../sync-engine/types';
import { computeStableHash } from '../../sync-engine/hasher';
import { db } from '../../db/store';
import { CsvDatasetRow } from '../../db/schema';

export const MAX_CSV_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_CSV_ROWS = 50000;

/**
 * Sanitize cell values against CSV Formula Injection (CWE-1236)
 * Prefix cells starting with =, +, -, @ with an apostrophe '
 */
export function sanitizeForCsvExport(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Infer field type from sample values
 */
export function inferFieldType(sampleValues: unknown[]): UniversalFieldType {
  const nonNull = sampleValues.filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
  if (nonNull.length === 0) return 'text';

  // Check email
  const isAllEmail = nonNull.every((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim()));
  if (isAllEmail) return 'email';

  // Check currency
  const isCurrency = nonNull.every((v) => /^\$?\s?\d+(\.\d{2})?$/.test(String(v).trim()));
  if (isCurrency) return 'currency';

  // Check number
  const isNumber = nonNull.every((v) => {
    const clean = String(v).replace(/,/g, '').trim();
    return clean !== '' && !isNaN(Number(clean));
  });
  if (isNumber) return 'number';

  // Check boolean
  const isBoolean = nonNull.every((v) => /^(true|false|yes|no|1|0)$/i.test(String(v).trim()));
  if (isBoolean) return 'boolean';

  // Check date
  const isDate = nonNull.every((v) => {
    const s = String(v).trim();
    if (s.length < 8 || !/\d/.test(s)) return false;
    const d = new Date(s);
    return !isNaN(d.getTime());
  });
  if (isDate) return 'date';

  return 'text';
}

/**
 * Robust RFC 4180 compliant CSV Parser
 * Handles escaped quotes, newlines inside quoted values, commas, and trims.
 */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const byteLength = typeof Buffer !== 'undefined' ? Buffer.byteLength(text, 'utf8') : new Blob([text]).size;
  if (byteLength > MAX_CSV_SIZE_BYTES) {
    throw new Error(`CSV file exceeds maximum size limit of 10 MB (size: ${(byteLength / (1024 * 1024)).toFixed(2)} MB).`);
  }

  // Parse lines considering quotes that span multiple lines
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentLine += '""';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
        currentLine += '"';
      }
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip crlf
      }
      if (currentLine.trim().length > 0) {
        lines.push(currentLine);
      }
      currentLine = '';
    } else {
      currentLine += char;
    }
  }

  if (currentLine.trim().length > 0) {
    lines.push(currentLine);
  }

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const parseLine = (line: string): string[] => {
    const cols: string[] = [];
    let cur = '';
    let inQ = false;

    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (c === ',' && !inQ) {
        cols.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    cols.push(cur.trim());
    return cols;
  };

  const rawHeaders = parseLine(lines[0]).map((h) => h.replace(/^"|"$/g, '').trim());
  // Ensure non-empty unique header names
  const seenHeaders = new Set<string>();
  const headers = rawHeaders.map((h, i) => {
    const base = h || `column_${i + 1}`;
    let name = base;
    let counter = 1;
    while (seenHeaders.has(name.toLowerCase())) {
      counter++;
      name = `${base}_${counter}`;
    }
    seenHeaders.add(name.toLowerCase());
    return name;
  });

  const rowCount = lines.length - 1;
  if (rowCount > MAX_CSV_ROWS) {
    throw new Error(`CSV exceeds maximum limit of 50,000 rows (found ${rowCount.toLocaleString()} rows).`);
  }

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const colValues = parseLine(lines[i]);
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      let val = colValues[idx] !== undefined ? colValues[idx].replace(/^"|"$/g, '') : '';
      // Strip leading apostrophe if added for CSV formula protection
      if (val.startsWith("'") && /^[=+\-@]/.test(val.slice(1))) {
        val = val.slice(1);
      }
      rowObj[h] = val;
    });
    rows.push(rowObj);
  }

  return { headers, rows };
}

/**
 * Parses and registers a real CSV dataset into the workspace database store.
 */
export function registerCsvDataset(
  workspaceId: string,
  name: string,
  filename: string,
  csvContent: string,
  uploadedBy: string = 'usr_current'
): CsvDatasetRow {
  const byteLength = typeof Buffer !== 'undefined' ? Buffer.byteLength(csvContent, 'utf8') : new Blob([csvContent]).size;
  const { headers, rows } = parseCsv(csvContent);

  if (headers.length === 0) {
    throw new Error('CSV file has no headers.');
  }

  // Detect column types
  const columns = headers.map((h) => {
    const sampleValues = rows.slice(0, 50).map((r) => r[h]);
    return {
      key: h.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      label: h,
      type: inferFieldType(sampleValues)
    };
  });

  // Build normalized universal records
  const records: UniversalRecord[] = rows.map((row, idx) => {
    const normValues: Record<string, unknown> = {};
    headers.forEach((h, hIdx) => {
      const col = columns[hIdx];
      normValues[col.key] = row[h];
    });
    const extId = `row_${idx + 1}`;
    return {
      externalId: extId,
      values: normValues,
      updatedAt: new Date().toISOString(),
      hash: computeStableHash(normValues)
    };
  });

  const datasetId = `csv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const dataset: CsvDatasetRow = {
    id: datasetId,
    workspaceId,
    name: name.trim() || filename.replace(/\.[^/.]+$/, ''),
    filename,
    fileSize: byteLength,
    rowCount: records.length,
    columns,
    records,
    uploadedBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.addCsvDataset(dataset);
  return dataset;
}

export const CsvConnector: Connector = {
  id: 'csv',
  displayName: 'CSV Upload & Files',
  capabilities: {
    read: true,
    write: true,
    delete: false,
    webhooks: false,
    incrementalSync: false,
    schemaDiscovery: true
  },
  auth: {
    type: 'none',
    getAuthUrl: () => '',
    exchangeCode: async () => ({
      accessToken: 'csv_workspace_token',
      scopes: []
    }),
    requiredScopes: []
  },
  listObjects: async (account) => {
    const wsId = account?.workspaceId || db.currentWorkspaceId;
    const datasets = db.getCsvDatasets(wsId);
    return datasets.map((d) => ({
      id: d.id,
      name: `${d.name} (${d.rowCount.toLocaleString()} rows)`,
      type: 'csv',
      recordCount: d.rowCount
    }));
  },
  getSchema: async (_account, object) => {
    const dataset = db.getCsvDatasetById(object.id);
    if (!dataset) {
      throw new Error(`CSV Dataset with ID '${object.id}' not found.`);
    }

    return {
      objectId: dataset.id,
      name: dataset.name,
      fields: dataset.columns.map((c) => ({
        key: c.key,
        label: c.label,
        type: c.type as UniversalFieldType,
        required: false,
        readOnly: false
      }))
    };
  },
  readRecords: async (_account, object, opts: ReadRecordsOptions) => {
    let dataset = db.getCsvDatasetById(object.id);
    if (!dataset && typeof window === 'undefined') {
      try {
        const { supabaseRepo } = await import('../../db/supabase-repo');
        const ds = await supabaseRepo.getCsvDatasetById(object.id);
        if (ds) {
          db.addCsvDataset(ds);
          dataset = ds;
        }
      } catch (err) {
        console.warn('[CsvConnector.readRecords] Failed to load dataset from Supabase:', err);
      }
    }
    if (!dataset) {
      return { records: [] };
    }

    const pageSize = opts.pageSize || 100;
    const offset = opts.cursor ? parseInt(opts.cursor, 10) : 0;
    const pageRecords = dataset.records.slice(offset, offset + pageSize);
    const nextOffset = offset + pageSize;
    const nextCursor = nextOffset < dataset.records.length ? String(nextOffset) : undefined;

    return {
      records: JSON.parse(JSON.stringify(pageRecords)),
      nextCursor
    };
  },
  createRecord: async (_account, object, rec): Promise<WriteResult> => {
    const dataset = db.getCsvDatasetById(object.id);
    if (!dataset) {
      throw new Error(`CSV Dataset '${object.id}' not found.`);
    }
    const extId = `row_${dataset.records.length + 1}`;
    const newRecord: UniversalRecord = {
      externalId: extId,
      values: rec.values,
      updatedAt: new Date().toISOString(),
      hash: computeStableHash(rec.values)
    };
    dataset.records.push(newRecord);
    dataset.rowCount = dataset.records.length;
    dataset.updatedAt = new Date().toISOString();
    db.saveToStorage();
    return { success: true, externalId: extId, updatedAt: newRecord.updatedAt };
  },
  updateRecord: async (_account, object, externalId, rec): Promise<WriteResult> => {
    const dataset = db.getCsvDatasetById(object.id);
    if (!dataset) {
      throw new Error(`CSV Dataset '${object.id}' not found.`);
    }
    const targetIdx = dataset.records.findIndex((r) => r.externalId === externalId);
    const now = new Date().toISOString();
    const vals = rec.values || {};
    if (targetIdx >= 0) {
      dataset.records[targetIdx] = {
        externalId,
        values: vals
      };
    } else {
      dataset.records.push({
        externalId,
        values: vals
      });
      dataset.rowCount = dataset.records.length;
    }
    dataset.updatedAt = now;
    db.saveToStorage();
    return { success: true, externalId, updatedAt: now };
  },
  rateLimitPolicy: {
    requestsPerSecond: 1000,
    burst: 1000,
    respectRetryAfter: true
  },
  mapError: (err: unknown): NormalizedError => {
    return {
      category: 'validation',
      code: 'CSV_ERROR',
      userMessage: `CSV parsing or validation error: ${String(err)}`,
      fixHint: 'Verify the CSV file does not exceed 10 MB or 50,000 rows and contains valid comma-separated text.'
    };
  }
};
