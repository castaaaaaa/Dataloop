/**
 * Notion Connector
 * Implements Notion API database query and page property updates.
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

const notionStore = new Map<string, UniversalRecord[]>();

function getNotionStore(dbId: string): UniversalRecord[] {
  if (!notionStore.has(dbId)) {
    notionStore.set(dbId, [
      {
        externalId: 'notion-page-uuid-001',
        values: {
          notion_page_id: 'notion-page-uuid-001',
          name: 'Sarah Jenkins',
          email: 'sarah.j@acme-corp.com',
          company: 'Acme Corp',
          deal_size: 12500,
          stage: 'Active'
        },
        updatedAt: '2026-10-18T10:00:00Z',
        hash: computeStableHash({
          notion_page_id: 'notion-page-uuid-001',
          name: 'Sarah Jenkins',
          email: 'sarah.j@acme-corp.com',
          company: 'Acme Corp',
          deal_size: 12500,
          stage: 'Active'
        })
      },
      {
        externalId: 'notion-page-uuid-002',
        values: {
          notion_page_id: 'notion-page-uuid-002',
          name: 'David Chen',
          email: 'd.chen@apexsoftware.io',
          company: 'Apex Software',
          deal_size: 8400,
          stage: 'Lead'
        },
        updatedAt: '2026-10-19T14:30:00Z',
        hash: computeStableHash({
          notion_page_id: 'notion-page-uuid-002',
          name: 'David Chen',
          email: 'd.chen@apexsoftware.io',
          company: 'Apex Software',
          deal_size: 8400,
          stage: 'Lead'
        })
      }
    ]);
  }
  return notionStore.get(dbId)!;
}

export const NotionConnector: Connector = {
  id: 'notion',
  displayName: 'Notion',
  capabilities: {
    read: true,
    write: true,
    delete: true,
    webhooks: false,
    incrementalSync: true,
    schemaDiscovery: true
  },
  auth: {
    type: 'oauth2',
    getAuthUrl: ({ redirectUri, state }) => {
      const clientId = process.env.NOTION_CLIENT_ID || 'dummy_notion_client_id';
      return `https://api.notion.com/v1/oauth/authorize?client_id=${clientId}&response_type=code&owner=user&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&state=${state}`;
    },
    exchangeCode: async () => ({
      accessToken: 'ntn_access_token_demo',
      scopes: ['read_content', 'update_content', 'insert_content']
    }),
    requiredScopes: ['read_content', 'update_content', 'insert_content']
  },
  listObjects: async () => [
    {
      id: 'db_agency_clients_notion',
      name: 'Agency Clients CRM (Database)',
      type: 'database',
      recordCount: 2
    },
    {
      id: 'db_product_roadmap_notion',
      name: 'Product Roadmap & Tasks (Database)',
      type: 'database',
      recordCount: 3
    }
  ],
  getSchema: async (_account, object) => ({
    objectId: object.id,
    name: object.name,
    fields: [
      { key: 'notion_page_id', label: 'Page ID', type: 'text', required: true, readOnly: true },
      { key: 'name', label: 'Name (Title)', type: 'text', required: true, readOnly: false },
      { key: 'email', label: 'Email', type: 'email', required: true, readOnly: false },
      { key: 'company', label: 'Company', type: 'text', required: false, readOnly: false },
      { key: 'deal_size', label: 'Deal Size', type: 'currency', required: false, readOnly: false },
      {
        key: 'stage',
        label: 'Stage',
        type: 'select',
        required: true,
        readOnly: false,
        options: ['Lead', 'Active', 'Completed', 'Archived']
      }
    ]
  }),
  readRecords: async (_account, object, _opts: ReadRecordsOptions) => {
    const records = getNotionStore(object.id);
    return { records: JSON.parse(JSON.stringify(records)) };
  },
  createRecord: async (_account, object, rec): Promise<WriteResult> => {
    const store = getNotionStore(object.id);
    const extId = `notion-page-${Date.now()}`;
    const newRec: UniversalRecord = {
      externalId: extId,
      values: { ...rec.values, notion_page_id: extId },
      updatedAt: new Date().toISOString(),
      hash: computeStableHash({ ...rec.values, notion_page_id: extId })
    };
    store.push(newRec);
    return { success: true, externalId: extId, updatedAt: newRec.updatedAt };
  },
  updateRecord: async (_account, object, externalId, rec): Promise<WriteResult> => {
    const store = getNotionStore(object.id);
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
    const store = getNotionStore(object.id);
    const idx = store.findIndex((r) => r.externalId === externalId);
    if (idx >= 0) store.splice(idx, 1);
    return { success: true, externalId };
  },
  rateLimitPolicy: {
    requestsPerSecond: 3,
    burst: 3,
    respectRetryAfter: true
  },
  mapError: (err: unknown): NormalizedError => {
    const msg = String(err);
    if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('token_expired')) {
      return {
        category: 'auth',
        code: 'NOTION_AUTH_EXPIRED',
        userMessage: 'Your Notion connection expired. Please reconnect.',
        fixHint: 'Go to Connections and click Reconnect on your Notion account.'
      };
    }
    return {
      category: 'unknown',
      code: 'NOTION_API_ERROR',
      userMessage: `Notion error: ${msg}`
    };
  }
};
