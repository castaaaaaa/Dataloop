/**
 * Mock CRM & Database Connector
 * Provides full in-memory CRUD operations with realistic schema & records
 * Allows the entire app to be demoed, tested, and QA'd without external vendor credentials.
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

// In-memory data store for mock objects
const mockStore = new Map<string, UniversalRecord[]>();

function initMockStore(objectId: string): UniversalRecord[] {
  if (mockStore.has(objectId)) {
    return mockStore.get(objectId)!;
  }

  let records: UniversalRecord[] = [];
  if (objectId === 'clients_and_leads') {
    records = [
      {
        externalId: 'mock-rec-001',
        values: {
          id: 'mock-rec-001',
          name: 'Sarah Jenkins',
          email: 'sarah.j@acme-corp.com',
          company: 'Acme Corp',
          status: 'Active',
          deal_value: 12500,
          created_at: '2026-03-15'
        },
        updatedAt: '2026-10-18T10:00:00Z',
        hash: ''
      },
      {
        externalId: 'mock-rec-002',
        values: {
          id: 'mock-rec-002',
          name: 'David Chen',
          email: 'd.chen@apexsoftware.io',
          company: 'Apex Software',
          status: 'Lead',
          deal_value: 8400,
          created_at: '2026-04-02'
        },
        updatedAt: '2026-10-19T14:30:00Z',
        hash: ''
      },
      {
        externalId: 'mock-rec-003',
        values: {
          id: 'mock-rec-003',
          name: 'Elena Rostova',
          email: 'elena@novadesign.co',
          company: 'Nova Design Studio',
          status: 'Active',
          deal_value: 24000,
          created_at: '2026-05-11'
        },
        updatedAt: '2026-10-21T09:15:00Z',
        hash: ''
      },
      {
        externalId: 'mock-rec-004',
        values: {
          id: 'mock-rec-004',
          name: 'Marcus Brody',
          email: 'mbrody@vortexlogistics.net',
          company: 'Vortex Logistics',
          status: 'Churned',
          deal_value: 5200,
          created_at: '2026-06-20'
        },
        updatedAt: '2026-10-22T16:00:00Z',
        hash: ''
      },
      {
        externalId: 'mock-rec-005',
        values: {
          id: 'mock-rec-005',
          name: 'Rachel Vance',
          email: 'rvance@catalystlabs.org',
          company: 'Catalyst Labs',
          status: 'Lead',
          deal_value: 19800,
          created_at: '2026-07-08'
        },
        updatedAt: '2026-10-23T11:45:00Z',
        hash: ''
      }
    ];
  } else if (objectId === 'crm_contacts') {
    records = [
      {
        externalId: 'crm-rec-101',
        values: {
          contact_id: 'crm-rec-101',
          full_name: 'Sarah Jenkins',
          work_email: 'sarah.j@acme-corp.com',
          organization: 'Acme Corp',
          lifecycle_stage: 'Customer',
          annual_revenue: 12500,
          last_contacted: '2026-10-15'
        },
        updatedAt: '2026-10-18T10:00:00Z',
        hash: ''
      },
      {
        externalId: 'crm-rec-102',
        values: {
          contact_id: 'crm-rec-102',
          full_name: 'David Chen',
          work_email: 'd.chen@apexsoftware.io',
          organization: 'Apex Software',
          lifecycle_stage: 'Opportunity',
          annual_revenue: 8400,
          last_contacted: '2026-10-19'
        },
        updatedAt: '2026-10-19T14:30:00Z',
        hash: ''
      }
    ];
  } else {
    records = [];
  }

  // Calculate stable hash for each record
  for (const r of records) {
    r.hash = computeStableHash(r.values);
  }

  mockStore.set(objectId, records);
  return records;
}

export const MockConnector: Connector = {
  id: 'mock_db',
  displayName: 'Mock CRM & Database',
  capabilities: {
    read: true,
    write: true,
    delete: true,
    webhooks: true,
    incrementalSync: true,
    schemaDiscovery: true
  },
  auth: {
    type: 'none',
    getAuthUrl: () => '/mock/auth/callback',
    exchangeCode: async () => ({
      accessToken: 'mock_access_token_demo',
      scopes: ['read', 'write']
    }),
    requiredScopes: ['records:read', 'records:write']
  },
  listObjects: async () => {
    return [
      {
        id: 'clients_and_leads',
        name: 'Clients & Leads (Table)',
        type: 'table',
        recordCount: 5
      },
      {
        id: 'crm_contacts',
        name: 'CRM Contacts (Object)',
        type: 'object',
        recordCount: 2
      },
      {
        id: 'sales_pipeline',
        name: 'Sales Pipeline (Database)',
        type: 'database',
        recordCount: 4
      }
    ];
  },
  getSchema: async (_account, object) => {
    if (object.id === 'crm_contacts') {
      return {
        objectId: object.id,
        name: object.name,
        fields: [
          { key: 'contact_id', label: 'Contact ID', type: 'text', required: true, readOnly: true },
          { key: 'full_name', label: 'Full Name', type: 'text', required: true, readOnly: false },
          { key: 'work_email', label: 'Work Email', type: 'email', required: true, readOnly: false },
          { key: 'organization', label: 'Organization', type: 'text', required: false, readOnly: false },
          {
            key: 'lifecycle_stage',
            label: 'Lifecycle Stage',
            type: 'select',
            required: true,
            readOnly: false,
            options: ['Lead', 'Opportunity', 'Customer', 'Evangelist']
          },
          { key: 'annual_revenue', label: 'Annual Revenue', type: 'currency', required: false, readOnly: false },
          { key: 'last_contacted', label: 'Last Contacted', type: 'date', required: false, readOnly: false }
        ]
      };
    }

    // Default: clients_and_leads
    return {
      objectId: object.id,
      name: object.name,
      fields: [
        { key: 'id', label: 'Record ID', type: 'text', required: true, readOnly: true },
        { key: 'name', label: 'Client Name', type: 'text', required: true, readOnly: false },
        { key: 'email', label: 'Email Address', type: 'email', required: true, readOnly: false },
        { key: 'company', label: 'Company', type: 'text', required: false, readOnly: false },
        {
          key: 'status',
          label: 'Client Status',
          type: 'select',
          required: true,
          readOnly: false,
          options: ['Lead', 'Active', 'Churned', 'On Hold']
        },
        { key: 'deal_value', label: 'Deal Value ($)', type: 'currency', required: false, readOnly: false },
        { key: 'created_at', label: 'Created Date', type: 'date', required: false, readOnly: false }
      ]
    };
  },
  readRecords: async (_account, object, _opts: ReadRecordsOptions) => {
    const records = initMockStore(object.id);
    return {
      records: JSON.parse(JSON.stringify(records))
    };
  },
  createRecord: async (_account, object, rec, _idempotencyKey: string): Promise<WriteResult> => {
    const records = initMockStore(object.id);
    const newId = `mock-rec-${Date.now()}`;
    const newRec: UniversalRecord = {
      externalId: newId,
      values: { ...rec.values, id: newId },
      updatedAt: new Date().toISOString(),
      hash: computeStableHash({ ...rec.values, id: newId })
    };
    records.push(newRec);
    return {
      success: true,
      externalId: newId,
      updatedAt: newRec.updatedAt
    };
  },
  updateRecord: async (_account, object, externalId, rec, _idempotencyKey: string): Promise<WriteResult> => {
    const records = initMockStore(object.id);
    const idx = records.findIndex((r) => r.externalId === externalId);
    const now = new Date().toISOString();
    if (idx >= 0) {
      records[idx].values = { ...records[idx].values, ...rec.values };
      records[idx].updatedAt = now;
      records[idx].hash = computeStableHash(records[idx].values);
      return { success: true, externalId, updatedAt: now };
    }
    // If not found, create it
    const newRec: UniversalRecord = {
      externalId,
      values: { ...rec.values, id: externalId },
      updatedAt: now,
      hash: computeStableHash({ ...rec.values, id: externalId })
    };
    records.push(newRec);
    return { success: true, externalId, updatedAt: now };
  },
  deleteRecord: async (_account, object, externalId, _idempotencyKey: string): Promise<WriteResult> => {
    const records = initMockStore(object.id);
    const idx = records.findIndex((r) => r.externalId === externalId);
    if (idx >= 0) {
      records.splice(idx, 1);
    }
    return { success: true, externalId };
  },
  rateLimitPolicy: {
    requestsPerSecond: 100,
    burst: 200,
    respectRetryAfter: true
  },
  mapError: (err: unknown): NormalizedError => {
    return {
      category: 'unknown',
      code: 'MOCK_ERROR',
      userMessage: String(err)
    };
  }
};
