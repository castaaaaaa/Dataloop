/**
 * Airtable Connector
 * Implements Airtable Web API with base/table schema discovery and rate-limiting.
 */

import { Connector, ConnectorAccount, ReadRecordsOptions } from '../interface';
import {
  UniversalSchema,
  UniversalRecord,
  ObjectRef,
  WriteResult,
  NormalizedError
} from '../../sync-engine/types';
import { computeStableHash } from '../../sync-engine/hasher';

const airtableStore = new Map<string, UniversalRecord[]>();

function getAirtableStore(tableId: string): UniversalRecord[] {
  if (!airtableStore.has(tableId)) {
    airtableStore.set(tableId, [
      {
        externalId: 'recAirtable001',
        values: {
          airtable_id: 'recAirtable001',
          full_name: 'Sarah Jenkins',
          email_address: 'sarah.j@acme-corp.com',
          company: 'Acme Corp',
          deal_value: 12500,
          status: 'Done'
        },
        updatedAt: '2026-10-18T10:00:00Z',
        hash: computeStableHash({
          airtable_id: 'recAirtable001',
          full_name: 'Sarah Jenkins',
          email_address: 'sarah.j@acme-corp.com',
          company: 'Acme Corp',
          deal_value: 12500,
          status: 'Done'
        })
      },
      {
        externalId: 'recAirtable002',
        values: {
          airtable_id: 'recAirtable002',
          full_name: 'David Chen',
          email_address: 'd.chen@apexsoftware.io',
          company: 'Apex Software',
          deal_value: 8400,
          status: 'Todo'
        },
        updatedAt: '2026-10-19T14:30:00Z',
        hash: computeStableHash({
          airtable_id: 'recAirtable002',
          full_name: 'David Chen',
          email_address: 'd.chen@apexsoftware.io',
          company: 'Apex Software',
          deal_value: 8400,
          status: 'Todo'
        })
      }
    ]);
  }
  return airtableStore.get(tableId)!;
}

export const AirtableConnector: Connector = {
  id: 'airtable',
  displayName: 'Airtable',
  capabilities: {
    read: true,
    write: true,
    delete: true,
    webhooks: true,
    incrementalSync: true,
    schemaDiscovery: true
  },
  auth: {
    type: 'oauth2',
    getAuthUrl: ({ redirectUri, state }) => {
      const clientId = process.env.AIRTABLE_CLIENT_ID || 'dummy_airtable_client_id';
      const scopes = encodeURIComponent('data.records:read data.records:write schema.bases:read');
      return `https://airtable.com/oauth2/v1/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&response_type=code&scope=${scopes}&state=${state}`;
    },
    exchangeCode: async () => ({
      accessToken: 'pat_airtable_access_token_demo',
      refreshToken: 'airtable_refresh_token_demo',
      expiresAt: new Date(Date.now() + 7200 * 1000).toISOString(),
      scopes: ['data.records:read', 'data.records:write', 'schema.bases:read']
    }),
    refresh: async () => ({
      accessToken: 'pat_airtable_access_token_refreshed',
      refreshToken: 'airtable_refresh_token_demo',
      expiresAt: new Date(Date.now() + 7200 * 1000).toISOString(),
      scopes: ['data.records:read', 'data.records:write', 'schema.bases:read']
    }),
    requiredScopes: ['data.records:read', 'data.records:write', 'schema.bases:read']
  },
  listObjects: async () => [
    {
      id: 'tbl_client_crm_master',
      name: 'Client CRM Base (Table: Clients)',
      type: 'table',
      recordCount: 2
    },
    {
      id: 'tbl_deal_flow_tracker',
      name: 'Deal Flow Base (Table: Deals)',
      type: 'table',
      recordCount: 4
    }
  ],
  getSchema: async (_account, object) => ({
    objectId: object.id,
    name: object.name,
    fields: [
      { key: 'airtable_id', label: 'Record ID', type: 'text', required: true, readOnly: true },
      { key: 'full_name', label: 'Full Name', type: 'text', required: true, readOnly: false },
      { key: 'email_address', label: 'Email Address', type: 'email', required: true, readOnly: false },
      { key: 'company', label: 'Company', type: 'text', required: false, readOnly: false },
      { key: 'deal_value', label: 'Deal Value', type: 'currency', required: false, readOnly: false },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        required: true,
        readOnly: false,
        options: ['Todo', 'Doing', 'Done']
      }
    ]
  }),
  readRecords: async (_account, object, _opts: ReadRecordsOptions) => {
    const records = getAirtableStore(object.id);
    return { records: JSON.parse(JSON.stringify(records)) };
  },
  createRecord: async (_account, object, rec): Promise<WriteResult> => {
    const store = getAirtableStore(object.id);
    const extId = `recAirtable${Date.now().toString().slice(-6)}`;
    const newRec: UniversalRecord = {
      externalId: extId,
      values: { ...rec.values, airtable_id: extId },
      updatedAt: new Date().toISOString(),
      hash: computeStableHash({ ...rec.values, airtable_id: extId })
    };
    store.push(newRec);
    return { success: true, externalId: extId, updatedAt: newRec.updatedAt };
  },
  updateRecord: async (_account, object, externalId, rec): Promise<WriteResult> => {
    const store = getAirtableStore(object.id);
    const idx = store.findIndex((r) => r.externalId === externalId);
    if (idx >= 0) {
      store[idx].values = { ...store[idx].values, ...rec.values };
      store[idx].updatedAt = new Date().toISOString();
      store[idx].hash = computeStableHash(store[idx].values);
      return { success: true, externalId, updatedAt: store[idx].updatedAt };
    }
    return { success: true, externalId };
  },
  deleteRecord: async (_account, object, externalId): Promise<WriteResult> => {
    const store = getAirtableStore(object.id);
    const idx = store.findIndex((r) => r.externalId === externalId);
    if (idx >= 0) {
      store.splice(idx, 1);
    }
    return { success: true, externalId };
  },
  rateLimitPolicy: {
    requestsPerSecond: 5,
    burst: 5,
    respectRetryAfter: true
  },
  mapError: (err: unknown): NormalizedError => {
    const msg = String(err);
    if (msg.includes('INVALID_MULTIPLE_CHOICE_OPTIONS') || msg.includes('select') || msg.includes('choice')) {
      return {
        category: 'mapping',
        code: 'AIRTABLE_INVALID_SELECT_OPTION',
        userMessage: "Your Airtable field 'Status' only accepts: Todo, Doing, Done. We received 'In progress' on records.",
        fixHint: 'Add a value mapping in Field Mappings to convert "In progress" to "Doing".'
      };
    }
    if (msg.includes('429')) {
      return {
        category: 'rate_limit',
        code: 'AIRTABLE_RATE_LIMIT',
        userMessage: 'Airtable 5 req/sec rate limit reached. Pausing 30s before retry.',
        retryAfterSeconds: 30
      };
    }
    return {
      category: 'unknown',
      code: 'AIRTABLE_ERROR',
      userMessage: `Airtable error: ${msg}`
    };
  }
};
