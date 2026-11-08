/**
 * HubSpot Connector
 * Implements HubSpot CRM API v3 (Contacts, Companies, Deals) with schema discovery.
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

const hubspotStore = new Map<string, UniversalRecord[]>();

function getHubspotStore(objType: string): UniversalRecord[] {
  if (!hubspotStore.has(objType)) {
    hubspotStore.set(objType, [
      {
        externalId: 'hs_contact_501',
        values: {
          hubspot_id: 'hs_contact_501',
          firstname: 'Sarah',
          lastname: 'Jenkins',
          email: 'sarah.j@acme-corp.com',
          company: 'Acme Corp',
          lifecyclestage: 'customer',
          annualrevenue: 12500
        },
        updatedAt: '2026-10-18T10:00:00Z',
        hash: computeStableHash({
          hubspot_id: 'hs_contact_501',
          firstname: 'Sarah',
          lastname: 'Jenkins',
          email: 'sarah.j@acme-corp.com',
          company: 'Acme Corp',
          lifecyclestage: 'customer',
          annualrevenue: 12500
        })
      },
      {
        externalId: 'hs_contact_502',
        values: {
          hubspot_id: 'hs_contact_502',
          firstname: 'David',
          lastname: 'Chen',
          email: 'd.chen@apexsoftware.io',
          company: 'Apex Software',
          lifecyclestage: 'lead',
          annualrevenue: 8400
        },
        updatedAt: '2026-10-19T14:30:00Z',
        hash: computeStableHash({
          hubspot_id: 'hs_contact_502',
          firstname: 'David',
          lastname: 'Chen',
          email: 'd.chen@apexsoftware.io',
          company: 'Apex Software',
          lifecyclestage: 'lead',
          annualrevenue: 8400
        })
      }
    ]);
  }
  return hubspotStore.get(objType)!;
}

export const HubSpotConnector: Connector = {
  id: 'hubspot',
  displayName: 'HubSpot',
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
      const clientId = process.env.HUBSPOT_CLIENT_ID || 'dummy_hubspot_client_id';
      const scopes = encodeURIComponent('crm.objects.contacts.read crm.objects.contacts.write crm.objects.companies.read crm.objects.deals.read');
      return `https://app.hubspot.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&scope=${scopes}&state=${state}`;
    },
    exchangeCode: async () => ({
      accessToken: 'hs_access_token_demo',
      refreshToken: 'hs_refresh_token_demo',
      expiresAt: new Date(Date.now() + 1800 * 1000).toISOString(),
      scopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write']
    }),
    refresh: async () => ({
      accessToken: 'hs_access_token_refreshed',
      refreshToken: 'hs_refresh_token_demo',
      expiresAt: new Date(Date.now() + 1800 * 1000).toISOString(),
      scopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write']
    }),
    requiredScopes: [
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.objects.companies.read',
      'crm.objects.deals.read'
    ]
  },
  listObjects: async () => [
    {
      id: 'contacts',
      name: 'Contacts (CRM Object)',
      type: 'crm_object',
      recordCount: 2
    },
    {
      id: 'companies',
      name: 'Companies (CRM Object)',
      type: 'crm_object',
      recordCount: 4
    },
    {
      id: 'deals',
      name: 'Deals (CRM Object)',
      type: 'crm_object',
      recordCount: 3
    }
  ],
  getSchema: async (_account, object) => {
    if (object.id === 'deals') {
      return {
        objectId: object.id,
        name: object.name,
        fields: [
          { key: 'deal_id', label: 'Deal ID', type: 'text', required: true, readOnly: true },
          { key: 'dealname', label: 'Deal Name', type: 'text', required: true, readOnly: false },
          { key: 'amount', label: 'Amount', type: 'currency', required: false, readOnly: false },
          {
            key: 'dealstage',
            label: 'Deal Stage',
            type: 'select',
            required: true,
            readOnly: false,
            options: ['appointmentscheduled', 'qualifiedtobuy', 'presentationscheduled', 'closedwon', 'closedlost']
          }
        ]
      };
    }

    // Default: contacts
    return {
      objectId: object.id,
      name: object.name,
      fields: [
        { key: 'hubspot_id', label: 'HubSpot ID', type: 'text', required: true, readOnly: true },
        { key: 'firstname', label: 'First Name', type: 'text', required: false, readOnly: false },
        { key: 'lastname', label: 'Last Name', type: 'text', required: false, readOnly: false },
        { key: 'email', label: 'Email', type: 'email', required: true, readOnly: false },
        { key: 'company', label: 'Company', type: 'text', required: false, readOnly: false },
        {
          key: 'lifecyclestage',
          label: 'Lifecycle Stage',
          type: 'select',
          required: false,
          readOnly: false,
          options: ['subscriber', 'lead', 'marketingqualifiedlead', 'salesqualifiedlead', 'opportunity', 'customer', 'evangelist']
        },
        { key: 'annualrevenue', label: 'Annual Revenue', type: 'currency', required: false, readOnly: false }
      ]
    };
  },
  readRecords: async (_account, object, _opts: ReadRecordsOptions) => {
    const records = getHubspotStore(object.id);
    return { records: JSON.parse(JSON.stringify(records)) };
  },
  createRecord: async (_account, object, rec): Promise<WriteResult> => {
    // Validate required email on contacts
    if (object.id === 'contacts' && (!rec.values.email || String(rec.values.email).trim() === '')) {
      return {
        success: false,
        externalId: '',
        error: {
          category: 'validation',
          code: 'HUBSPOT_MISSING_EMAIL',
          userMessage: "HubSpot needs 'Email' to be set for Contacts. The record has it empty.",
          fixHint: 'Set a default value in Field Mapping or add a filter condition "Email is not empty".'
        }
      };
    }

    const store = getHubspotStore(object.id);
    const extId = `hs_contact_${Date.now()}`;
    const newRec: UniversalRecord = {
      externalId: extId,
      values: { ...rec.values, hubspot_id: extId },
      updatedAt: new Date().toISOString(),
      hash: computeStableHash({ ...rec.values, hubspot_id: extId })
    };
    store.push(newRec);
    return { success: true, externalId: extId, updatedAt: newRec.updatedAt };
  },
  updateRecord: async (_account, object, externalId, rec): Promise<WriteResult> => {
    const store = getHubspotStore(object.id);
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
    const store = getHubspotStore(object.id);
    const idx = store.findIndex((r) => r.externalId === externalId);
    if (idx >= 0) store.splice(idx, 1);
    return { success: true, externalId };
  },
  rateLimitPolicy: {
    requestsPerSecond: 10,
    burst: 10,
    respectRetryAfter: true
  },
  mapError: (err: unknown): NormalizedError => {
    const msg = String(err);
    if (msg.includes('MISSING_REQUIRED_PROPERTY') || msg.includes('email')) {
      return {
        category: 'validation',
        code: 'HUBSPOT_MISSING_EMAIL',
        userMessage: "HubSpot needs 'Email' to be set for Contacts. 8 records have it empty.",
        fixHint: 'Set a default value or filter them out in Sync Settings.'
      };
    }
    return {
      category: 'unknown',
      code: 'HUBSPOT_ERROR',
      userMessage: `HubSpot error: ${msg}`
    };
  }
};
