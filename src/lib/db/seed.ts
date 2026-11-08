/**
 * Seed Data
 * Pre-populates realistic workspaces, plans, connectors, accounts, sync configs, runs, errors, conflicts, and audit logs.
 */

import {
  UserRow,
  WorkspaceRow,
  WorkspaceMemberRow,
  PlanRow,
  ConnectedAccountRow,
  DataEndpointRow,
  SyncConfigRow,
  FieldMappingRow,
  RecordLinkRow,
  SyncRunRow,
  SyncEventRow,
  SyncErrorRow,
  DeadLetterRow,
  ConflictRow,
  SubscriptionRow,
  UsageCounterRow,
  ApiKeyRow,
  AuditLogRow
} from './schema';

export const SEED_PLANS: PlanRow[] = [
  {
    id: 'plan_free',
    key: 'free',
    name: 'Free (testing)',
    priceMonthlyCents: 0,
    priceAnnualMonthlyCents: 0,
    limits: {
      maxRecords: 1000,
      maxActiveSyncs: 3,
      minIntervalMinutes: 15,
      premiumConnectors: true,
      teamSeats: 5,
      logRetentionDays: 30,
      realtime: true
    },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'plan_starter',
    key: 'starter',
    name: 'Starter',
    priceMonthlyCents: 1900,
    priceAnnualMonthlyCents: 1500,
    limits: {
      maxRecords: 5000,
      maxActiveSyncs: 5,
      minIntervalMinutes: 15,
      premiumConnectors: true,
      teamSeats: 2,
      logRetentionDays: 30,
      realtime: false
    },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'plan_pro',
    key: 'pro',
    name: 'Pro',
    priceMonthlyCents: 4900,
    priceAnnualMonthlyCents: 3900,
    limits: {
      maxRecords: 25000,
      maxActiveSyncs: 20,
      minIntervalMinutes: 5,
      premiumConnectors: true,
      teamSeats: 5,
      logRetentionDays: 90,
      realtime: true
    },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'plan_business',
    key: 'business',
    name: 'Business',
    priceMonthlyCents: 12900,
    priceAnnualMonthlyCents: 9900,
    limits: {
      maxRecords: 100000,
      maxActiveSyncs: 75,
      minIntervalMinutes: 1,
      premiumConnectors: true,
      teamSeats: 15,
      logRetentionDays: 180,
      realtime: true
    },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  }
];

export const SEED_USERS: UserRow[] = [
  {
    id: 'usr_owner_01',
    email: 'nekiqq124@gmail.com',
    name: 'Demo Owner',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z'
  },
  {
    id: 'usr_admin_02',
    email: 'marcus.ops@acmeagency.com',
    name: 'Marcus Ops',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80',
    createdAt: '2026-10-05T00:00:00Z',
    updatedAt: '2026-10-05T00:00:00Z'
  }
];

export const SEED_WORKSPACES: WorkspaceRow[] = [
  {
    id: 'ws_acme_agency',
    name: 'Acme Growth Agency',
    slug: 'acme-growth-agency',
    ownerId: 'usr_owner_01',
    planId: 'plan_free',
    trialEndsAt: undefined,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z'
  },
  {
    id: 'ws_solo_studio',
    name: 'Solo Studio Works',
    slug: 'solo-studio',
    ownerId: 'usr_owner_01',
    planId: 'plan_free',
    trialEndsAt: undefined,
    createdAt: '2026-09-15T00:00:00Z',
    updatedAt: '2026-09-15T00:00:00Z'
  }
];

export const SEED_MEMBERS: WorkspaceMemberRow[] = [
  {
    id: 'mem_01',
    workspaceId: 'ws_acme_agency',
    userId: 'usr_owner_01',
    role: 'owner',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z'
  },
  {
    id: 'mem_02',
    workspaceId: 'ws_acme_agency',
    userId: 'usr_admin_02',
    role: 'admin',
    invitedBy: 'usr_owner_01',
    createdAt: '2026-10-05T00:00:00Z',
    updatedAt: '2026-10-05T00:00:00Z'
  },
  {
    id: 'mem_03',
    workspaceId: 'ws_solo_studio',
    userId: 'usr_owner_01',
    role: 'owner',
    createdAt: '2026-09-15T00:00:00Z',
    updatedAt: '2026-09-15T00:00:00Z'
  }
];

export const SEED_ACCOUNTS: ConnectedAccountRow[] = [
  {
    id: 'conn_gsheets_01',
    workspaceId: 'ws_acme_agency',
    connectorKey: 'google_sheets',
    displayName: 'Google Sheets (Agency Drive)',
    externalAccountId: 'alex.rivera@agency.com',
    encryptedAccessToken: 'v1:mock_encrypted_google_token',
    keyVersion: 'v1',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    status: 'active',
    createdBy: 'usr_owner_01',
    createdAt: '2026-10-02T10:00:00Z',
    updatedAt: '2026-10-02T10:00:00Z'
  },
  {
    id: 'conn_airtable_01',
    workspaceId: 'ws_acme_agency',
    connectorKey: 'airtable',
    displayName: 'Airtable (Client CRM Base)',
    externalAccountId: 'usr_airtable_8921',
    encryptedAccessToken: 'v1:mock_encrypted_airtable_token',
    keyVersion: 'v1',
    scopes: ['data.records:read', 'data.records:write', 'schema.bases:read'],
    status: 'active',
    createdBy: 'usr_owner_01',
    createdAt: '2026-10-02T10:30:00Z',
    updatedAt: '2026-10-02T10:30:00Z'
  },
  {
    id: 'conn_notion_01',
    workspaceId: 'ws_acme_agency',
    connectorKey: 'notion',
    displayName: 'Notion (Agency Workspace)',
    externalAccountId: 'ws_notion_3391',
    encryptedAccessToken: 'v1:mock_encrypted_notion_token',
    keyVersion: 'v1',
    scopes: ['read_content', 'update_content', 'insert_content'],
    status: 'needs_reconnect',
    createdBy: 'usr_owner_01',
    createdAt: '2026-10-03T11:00:00Z',
    updatedAt: '2026-10-23T14:00:00Z'
  },
  {
    id: 'conn_hubspot_01',
    workspaceId: 'ws_acme_agency',
    connectorKey: 'hubspot',
    displayName: 'HubSpot (Production Portal)',
    externalAccountId: 'hub_portal_98124',
    encryptedAccessToken: 'v1:mock_encrypted_hubspot_token',
    keyVersion: 'v1',
    scopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write'],
    status: 'active',
    createdBy: 'usr_owner_01',
    createdAt: '2026-10-04T09:00:00Z',
    updatedAt: '2026-10-04T09:00:00Z'
  },
  {
    id: 'conn_mock_01',
    workspaceId: 'ws_acme_agency',
    connectorKey: 'mock_db',
    displayName: 'Mock CRM & Database (Testing)',
    externalAccountId: 'mock_account_demo',
    encryptedAccessToken: 'v1:mock_demo',
    keyVersion: 'v1',
    scopes: ['records:read', 'records:write'],
    status: 'active',
    createdBy: 'usr_owner_01',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z'
  }
];

export const SEED_ENDPOINTS: DataEndpointRow[] = [
  {
    id: 'ep_sheets_pipeline',
    workspaceId: 'ws_acme_agency',
    connectedAccountId: 'conn_gsheets_01',
    connectorId: 'google_sheets',
    objectRef: {
      id: 'sheet_sales_pipeline_tab1',
      name: 'Sales Pipeline (Tab: 2026 Leads)',
      type: 'spreadsheet',
      recordCount: 42
    },
    role: 'both',
    createdAt: '2026-10-05T00:00:00Z',
    updatedAt: '2026-10-05T00:00:00Z'
  },
  {
    id: 'ep_airtable_crm',
    workspaceId: 'ws_acme_agency',
    connectedAccountId: 'conn_airtable_01',
    connectorId: 'airtable',
    objectRef: {
      id: 'tbl_client_crm_master',
      name: 'Client CRM Base (Table: Clients)',
      type: 'table',
      recordCount: 42
    },
    role: 'both',
    createdAt: '2026-10-05T00:00:00Z',
    updatedAt: '2026-10-05T00:00:00Z'
  },
  {
    id: 'ep_hubspot_contacts',
    workspaceId: 'ws_acme_agency',
    connectedAccountId: 'conn_hubspot_01',
    connectorId: 'hubspot',
    objectRef: {
      id: 'contacts',
      name: 'Contacts (CRM Object)',
      type: 'crm_object',
      recordCount: 118
    },
    role: 'destination',
    createdAt: '2026-10-06T00:00:00Z',
    updatedAt: '2026-10-06T00:00:00Z'
  },
  {
    id: 'ep_csv_leads',
    workspaceId: 'ws_acme_agency',
    connectorId: 'csv',
    objectRef: {
      id: 'sample_marketing_leads',
      name: 'Marketing Leads (CSV Dataset)',
      type: 'csv',
      recordCount: 5
    },
    role: 'source',
    createdAt: '2026-10-07T00:00:00Z',
    updatedAt: '2026-10-07T00:00:00Z'
  }
];

export const SEED_SYNCS: SyncConfigRow[] = [
  {
    id: 'sync_sheets_airtable_twoway',
    workspaceId: 'ws_acme_agency',
    name: 'Airtable Clients ↔ Google Sheets Pipeline',
    endpointAId: 'ep_airtable_crm',
    endpointBId: 'ep_sheets_pipeline',
    direction: 'two_way',
    conflictRule: 'manual',
    triggerMode: 'scheduled',
    intervalMinutes: 15,
    deleteBehavior: 'soft_delete',
    status: 'active',
    lastRunAt: '2026-10-24T09:45:00Z',
    nextRunAt: '2026-10-24T10:00:00Z',
    createdBy: 'usr_owner_01',
    createdAt: '2026-10-05T12:00:00Z',
    updatedAt: '2026-10-24T09:45:00Z'
  },
  {
    id: 'sync_csv_to_airtable',
    workspaceId: 'ws_acme_agency',
    name: 'Marketing Leads CSV → Airtable CRM',
    endpointAId: 'ep_csv_leads',
    endpointBId: 'ep_airtable_crm',
    direction: 'a_to_b',
    conflictRule: 'source_wins',
    triggerMode: 'manual',
    intervalMinutes: 60,
    deleteBehavior: 'ignore',
    status: 'active',
    lastRunAt: '2026-10-23T18:20:00Z',
    createdBy: 'usr_owner_01',
    createdAt: '2026-10-07T14:00:00Z',
    updatedAt: '2026-10-23T18:20:00Z'
  },
  {
    id: 'sync_hubspot_pipeline',
    workspaceId: 'ws_acme_agency',
    name: 'Google Sheets Leads → HubSpot Contacts',
    endpointAId: 'ep_sheets_pipeline',
    endpointBId: 'ep_hubspot_contacts',
    direction: 'a_to_b',
    conflictRule: 'source_wins',
    triggerMode: 'webhook',
    intervalMinutes: 5,
    deleteBehavior: 'ignore',
    status: 'error',
    lastRunAt: '2026-10-24T08:15:00Z',
    createdBy: 'usr_owner_01',
    createdAt: '2026-10-08T09:30:00Z',
    updatedAt: '2026-10-24T08:15:00Z'
  }
];

export const SEED_MAPPINGS: FieldMappingRow[] = [
  // Mappings for sync_sheets_airtable_twoway
  {
    id: 'map_01',
    syncConfigId: 'sync_sheets_airtable_twoway',
    sourceFieldKey: 'email_address',
    destinationFieldKey: 'email',
    isKey: true,
    required: true,
    createdAt: '2026-10-05T12:00:00Z',
    updatedAt: '2026-10-05T12:00:00Z'
  },
  {
    id: 'map_02',
    syncConfigId: 'sync_sheets_airtable_twoway',
    sourceFieldKey: 'full_name',
    destinationFieldKey: 'client_name',
    transform: { type: 'trim_whitespace' },
    isKey: false,
    required: true,
    createdAt: '2026-10-05T12:00:00Z',
    updatedAt: '2026-10-05T12:00:00Z'
  },
  {
    id: 'map_03',
    syncConfigId: 'sync_sheets_airtable_twoway',
    sourceFieldKey: 'deal_value',
    destinationFieldKey: 'deal_size',
    transform: { type: 'number_to_currency', params: { currencySymbol: '$' } },
    isKey: false,
    required: false,
    createdAt: '2026-10-05T12:00:00Z',
    updatedAt: '2026-10-05T12:00:00Z'
  },
  {
    id: 'map_04',
    syncConfigId: 'sync_sheets_airtable_twoway',
    sourceFieldKey: 'status',
    destinationFieldKey: 'stage',
    transform: {
      type: 'map_select_values',
      params: {
        valueMap: {
          Todo: 'Lead',
          Doing: 'Active',
          Done: 'Closed Won'
        },
        fallbackValue: 'Lead'
      }
    },
    isKey: false,
    required: true,
    createdAt: '2026-10-05T12:00:00Z',
    updatedAt: '2026-10-05T12:00:00Z'
  }
];

export const SEED_RECORD_LINKS: RecordLinkRow[] = [
  {
    id: 'link_001',
    syncConfigId: 'sync_sheets_airtable_twoway',
    aExternalId: 'recAirtable001',
    bExternalId: 'row-2',
    lastSyncedHashA: 'hash_a_001',
    lastSyncedHashB: 'hash_b_001',
    lastSyncedAt: '2026-10-24T09:45:00Z',
    createdAt: '2026-10-05T12:00:00Z',
    updatedAt: '2026-10-24T09:45:00Z'
  },
  {
    id: 'link_002',
    syncConfigId: 'sync_sheets_airtable_twoway',
    aExternalId: 'recAirtable002',
    bExternalId: 'row-3',
    lastSyncedHashA: 'hash_a_002_stale',
    lastSyncedHashB: 'hash_b_002_stale',
    lastSyncedAt: '2026-10-20T14:30:00Z',
    createdAt: '2026-10-05T12:00:00Z',
    updatedAt: '2026-10-20T14:30:00Z'
  }
];

export const SEED_CONFLICTS: ConflictRow[] = [
  {
    id: 'conf_001',
    syncConfigId: 'sync_sheets_airtable_twoway',
    recordLinkId: 'link_002',
    aValue: {
      airtable_id: 'recAirtable002',
      full_name: 'David Chen',
      email_address: 'd.chen@apexsoftware.io',
      company: 'Apex Software',
      deal_value: 14000,
      status: 'Doing'
    },
    bValue: {
      row_index: 3,
      client_name: 'David Chen Jr.',
      email: 'd.chen@apexsoftware.io',
      company: 'Apex Software Inc.',
      deal_size: '$9,200.00',
      stage: 'Closed Won'
    },
    status: 'open',
    createdAt: '2026-10-24T09:45:00Z',
    updatedAt: '2026-10-24T09:45:00Z'
  }
];

export const SEED_RUNS: SyncRunRow[] = [
  {
    id: 'run_101',
    syncConfigId: 'sync_sheets_airtable_twoway',
    trigger: 'schedule',
    status: 'succeeded',
    startedAt: '2026-10-24T09:44:50Z',
    finishedAt: '2026-10-24T09:45:02Z',
    recordsRead: 42,
    created: 0,
    updated: 3,
    deleted: 0,
    skipped: 38,
    conflicts: 1,
    failed: 0,
    isDryRun: false,
    createdAt: '2026-10-24T09:44:50Z',
    updatedAt: '2026-10-24T09:45:02Z'
  },
  {
    id: 'run_102',
    syncConfigId: 'sync_hubspot_pipeline',
    trigger: 'webhook',
    status: 'failed',
    startedAt: '2026-10-24T08:14:40Z',
    finishedAt: '2026-10-24T08:15:00Z',
    recordsRead: 12,
    created: 4,
    updated: 0,
    deleted: 0,
    skipped: 0,
    conflicts: 0,
    failed: 8,
    isDryRun: false,
    createdAt: '2026-10-24T08:14:40Z',
    updatedAt: '2026-10-24T08:15:00Z'
  }
];

export const SEED_ERRORS: SyncErrorRow[] = [
  {
    id: 'err_hubspot_missing_email',
    syncRunId: 'run_102',
    category: 'validation',
    code: 'HUBSPOT_MISSING_REQUIRED_EMAIL',
    userMessage: "HubSpot needs 'Email' to be set for Contacts. 8 records have it empty.",
    fixHint: "Set a default value in Field Mapping or add a filter condition 'Email is not empty'.",
    isResolved: false,
    createdAt: '2026-10-24T08:15:00Z',
    updatedAt: '2026-10-24T08:15:00Z'
  },
  {
    id: 'err_notion_expired',
    syncRunId: 'run_101',
    category: 'auth',
    code: 'NOTION_AUTH_EXPIRED',
    userMessage: 'Your Notion connection expired. Please reconnect.',
    fixHint: 'Go to Connections and click Reconnect on your Notion account.',
    isResolved: false,
    createdAt: '2026-10-23T14:00:00Z',
    updatedAt: '2026-10-23T14:00:00Z'
  },
  {
    id: 'err_airtable_select_mismatch',
    syncRunId: 'run_101',
    category: 'mapping',
    code: 'AIRTABLE_INVALID_SELECT_OPTION',
    userMessage: "Your Airtable field 'Status' only accepts: Todo, Doing, Done. We received 'In progress' on 12 records.",
    fixHint: 'Add a value mapping in Field Mappings to map "In progress" to "Doing".',
    isResolved: false,
    createdAt: '2026-10-24T09:44:55Z',
    updatedAt: '2026-10-24T09:44:55Z'
  },
  {
    id: 'err_google_rate_limit',
    syncRunId: 'run_101',
    category: 'rate_limit',
    code: 'GOOGLE_SHEETS_RATE_LIMIT',
    userMessage: "Google Sheets is rate-limiting us. We'll retry automatically in 2 minutes.",
    fixHint: 'Automatic exponential backoff with jitter is actively retrying in the queue.',
    isResolved: true,
    createdAt: '2026-10-24T09:44:52Z',
    updatedAt: '2026-10-24T09:44:58Z'
  }
];

export const SEED_DEAD_LETTERS: DeadLetterRow[] = [
  {
    id: 'dl_001',
    syncConfigId: 'sync_hubspot_pipeline',
    payload: {
      firstname: 'Taylor',
      lastname: 'Rowe',
      email: '',
      company: 'Rowe Consulting'
    },
    lastError: "HubSpot API Error: Contact property 'email' cannot be blank.",
    status: 'open',
    attempts: 6,
    createdAt: '2026-10-24T08:15:00Z',
    updatedAt: '2026-10-24T08:15:00Z'
  },
  {
    id: 'dl_002',
    syncConfigId: 'sync_hubspot_pipeline',
    payload: {
      firstname: 'Morgan',
      lastname: 'Li',
      email: '',
      company: 'Pinnacle Systems'
    },
    lastError: "HubSpot API Error: Contact property 'email' cannot be blank.",
    status: 'open',
    attempts: 6,
    createdAt: '2026-10-24T08:15:01Z',
    updatedAt: '2026-10-24T08:15:01Z'
  }
];

export const SEED_API_KEYS: ApiKeyRow[] = [
  {
    id: 'key_prod_01',
    workspaceId: 'ws_acme_agency',
    name: 'Zapier / Webhook Dispatch Key',
    keyPrefix: 'sync_live_9a4f',
    keyHash: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
    lastUsedAt: '2026-10-24T07:20:00Z',
    createdBy: 'usr_owner_01',
    createdAt: '2026-10-10T12:00:00Z',
    updatedAt: '2026-10-10T12:00:00Z'
  }
];

export const SEED_AUDIT_LOGS: AuditLogRow[] = [
  {
    id: 'aud_001',
    workspaceId: 'ws_acme_agency',
    actorUserId: 'usr_owner_01',
    actorEmail: 'alex.rivera@agency.com',
    action: 'sync.created',
    targetType: 'sync_config',
    targetId: 'sync_sheets_airtable_twoway',
    metadata: { direction: 'two_way', endpoints: ['airtable', 'google_sheets'] },
    ip: '198.51.100.14',
    createdAt: '2026-10-05T12:00:00Z'
  },
  {
    id: 'aud_002',
    workspaceId: 'ws_acme_agency',
    actorUserId: 'usr_owner_01',
    actorEmail: 'alex.rivera@agency.com',
    action: 'sync.activated',
    targetType: 'sync_config',
    targetId: 'sync_sheets_airtable_twoway',
    ip: '198.51.100.14',
    createdAt: '2026-10-05T12:05:00Z'
  },
  {
    id: 'aud_003',
    workspaceId: 'ws_acme_agency',
    actorUserId: 'usr_owner_01',
    actorEmail: 'alex.rivera@agency.com',
    action: 'connection.added',
    targetType: 'connected_account',
    targetId: 'conn_hubspot_01',
    metadata: { connector: 'hubspot', scopes: ['crm.objects.contacts.read'] },
    ip: '198.51.100.14',
    createdAt: '2026-10-04T09:00:00Z'
  },
  {
    id: 'aud_004',
    workspaceId: 'ws_acme_agency',
    actorUserId: 'usr_owner_01',
    actorEmail: 'alex.rivera@agency.com',
    action: 'api_key.created',
    targetType: 'api_key',
    targetId: 'key_prod_01',
    ip: '198.51.100.14',
    createdAt: '2026-10-10T12:00:00Z'
  }
];

/**
 * Optional demo seed function.
 * Must NEVER be executed automatically on application startup.
 * Can be run manually by developers/testers via `npm run seed`.
 */
export function seedDemoData(targetStore?: any): void {
  // If targetStore is provided, populate it; otherwise import dynamic store
  if (targetStore) {
    targetStore.workspaces = [...SEED_WORKSPACES];
    targetStore.users = [...SEED_USERS];
    targetStore.members = [...SEED_MEMBERS];
    targetStore.accounts = [...SEED_ACCOUNTS];
    targetStore.endpoints = [...SEED_ENDPOINTS];
    targetStore.syncConfigs = [...SEED_SYNCS];
    targetStore.mappings = [...SEED_MAPPINGS];
    targetStore.recordLinks = [...SEED_RECORD_LINKS];
    targetStore.conflicts = [...SEED_CONFLICTS];
    targetStore.runs = [...SEED_RUNS];
    targetStore.errors = [...SEED_ERRORS];
    targetStore.deadLetters = [...SEED_DEAD_LETTERS];
    targetStore.apiKeys = [...SEED_API_KEYS];
    targetStore.auditLogs = [...SEED_AUDIT_LOGS];
    targetStore.currentUserId = 'usr_owner_01';
    targetStore.currentWorkspaceId = 'ws_acme_agency';
    if (typeof targetStore.saveToStorage === 'function') {
      targetStore.saveToStorage();
    }
  }
}
