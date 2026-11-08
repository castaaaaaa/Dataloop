/**
 * Universal Data Sync Engine Types
 * Follows Section 4.2 & 4.3 of Build Brief
 */

export type UniversalFieldType =
  | 'text'
  | 'longtext'
  | 'number'
  | 'currency'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'email'
  | 'phone'
  | 'url'
  | 'select'
  | 'multiselect'
  | 'user'
  | 'json'
  | 'unsupported';

export interface UniversalField {
  key: string;
  label: string;
  type: UniversalFieldType;
  required: boolean;
  readOnly: boolean;
  options?: string[]; // for select/multiselect
  vendorType?: string;
  description?: string;
}

export interface UniversalSchema {
  objectId: string;
  name?: string;
  fields: UniversalField[];
}

export interface UniversalRecord {
  externalId: string;
  values: Record<string, unknown>;
  updatedAt?: string; // ISO 8601 string
  deleted?: boolean;
  hash: string; // stable SHA-256 hash of normalized values
}

export type ConnectorId =
  | 'google_sheets'
  | 'notion'
  | 'airtable'
  | 'hubspot'
  | 'csv'
  | 'mock_db';

export interface ObjectRef {
  id: string;
  name: string;
  type?: string;
  description?: string;
  recordCount?: number;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes: string[];
  tokenType?: string;
}

export interface WriteResult {
  success: boolean;
  externalId: string;
  updatedAt?: string;
  error?: NormalizedError;
}

export interface WebhookRegistration {
  id: string;
  vendorWebhookId: string;
  status: 'active' | 'pending' | 'failed';
  secret?: string;
}

export interface WebhookEvent {
  id: string;
  eventType: 'create' | 'update' | 'delete';
  objectId: string;
  externalId: string;
  timestamp: string;
  payload?: unknown;
}

export type ErrorCategory =
  | 'retryable'
  | 'auth'
  | 'mapping'
  | 'permission'
  | 'validation'
  | 'unsupported'
  | 'rate_limit'
  | 'unknown';

export interface NormalizedError {
  category: ErrorCategory;
  code: string;
  userMessage: string;
  fixHint?: string;
  retryAfterSeconds?: number;
  raw?: unknown;
}

export interface RateLimitPolicy {
  requestsPerSecond: number;
  burst: number;
  respectRetryAfter: true;
}

export interface FilterCondition {
  id: string;
  field: string;
  operator:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'not_contains'
    | 'greater_than'
    | 'less_than'
    | 'is_empty'
    | 'is_not_empty';
  value: string | number | boolean;
}

export interface FilterGroup {
  logic: 'AND' | 'OR';
  conditions: FilterCondition[];
}

export type TransformType =
  | 'date_format'
  | 'text_to_number'
  | 'number_to_currency'
  | 'lowercase'
  | 'uppercase'
  | 'trim_whitespace'
  | 'split_name'
  | 'combine_fields'
  | 'default_value'
  | 'map_select_values';

export interface TransformConfig {
  type: TransformType;
  params?: {
    fromFormat?: string;
    toFormat?: string; // e.g. "YYYY-MM-DD", "MM/DD/YYYY", "ISO"
    currencySymbol?: string;
    delimiter?: string;
    targetPart?: 'first' | 'last';
    secondaryField?: string;
    separator?: string;
    defaultValue?: unknown;
    valueMap?: Record<string, string>;
    fallbackValue?: string;
  };
}

export interface FieldMapping {
  id: string;
  sourceFieldKey: string;
  destinationFieldKey: string;
  transform?: TransformConfig;
  defaultValue?: unknown;
  isKey: boolean;
  required: boolean;
}

export type SyncDirection = 'a_to_b' | 'b_to_a' | 'two_way';

export type ConflictRule =
  | 'source_wins'
  | 'destination_wins'
  | 'newest_wins'
  | 'manual';

export type DeleteBehavior = 'ignore' | 'soft_delete' | 'hard_delete';

export type TriggerMode = 'manual' | 'scheduled' | 'webhook';

export type SyncStatus = 'draft' | 'active' | 'paused' | 'error';

export type RunTrigger = 'manual' | 'schedule' | 'webhook' | 'api' | 'dry_run';

export type RunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'cancelled';

export type ActionType = 'create' | 'update' | 'delete' | 'skip' | 'conflict';

export interface SyncConfig {
  id: string;
  workspaceId: string;
  name: string;
  endpointAId: string;
  endpointBId: string;
  direction: SyncDirection;
  conflictRule: ConflictRule;
  triggerMode: TriggerMode;
  intervalMinutes: number;
  deleteBehavior: DeleteBehavior;
  filters?: FilterGroup;
  status: SyncStatus;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecordLink {
  id: string;
  syncConfigId: string;
  aExternalId: string;
  bExternalId: string;
  lastSyncedHashA: string;
  lastSyncedHashB: string;
  lastSyncedAt: string;
  aDeleted?: boolean;
  bDeleted?: boolean;
}

export interface SyncRun {
  id: string;
  syncConfigId: string;
  trigger: RunTrigger;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  recordsRead: number;
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  conflicts: number;
  failed: number;
  isDryRun: boolean;
  errorMessage?: string;
}

export interface SyncEvent {
  id: string;
  syncRunId: string;
  recordLinkId?: string;
  action: ActionType;
  side: 'A' | 'B';
  status: 'succeeded' | 'failed' | 'pending';
  idempotencyKey: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  message?: string;
  timestamp: string;
}

export interface SyncError {
  id: string;
  syncRunId: string;
  syncEventId?: string;
  category: ErrorCategory;
  code: string;
  userMessage: string;
  fixHint?: string;
  raw?: unknown;
  isResolved: boolean;
  createdAt: string;
}

export interface DeadLetter {
  id: string;
  syncConfigId: string;
  syncEventId?: string;
  payload: Record<string, unknown>;
  lastError: string;
  status: 'open' | 'replayed' | 'dismissed';
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConflictItem {
  id: string;
  syncConfigId: string;
  recordLinkId: string;
  aValue: Record<string, unknown>;
  bValue: Record<string, unknown>;
  status: 'open' | 'resolved';
  resolution?: 'use_a' | 'use_b' | 'custom';
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface PlanLimits {
  maxRecords: number;
  maxActiveSyncs: number;
  minIntervalMinutes: number;
  premiumConnectors: boolean;
  teamSeats: number;
  logRetentionDays: number;
  realtime: boolean;
}

export interface Plan {
  key: 'free' | 'starter' | 'pro' | 'business';
  name: string;
  priceMonthlyCents: number;
  priceAnnualMonthlyCents: number;
  limits: PlanLimits;
}

export interface DataEndpoint {
  id: string;
  workspaceId: string;
  connectedAccountId?: string;
  connectorId: ConnectorId;
  role: 'source' | 'destination' | 'both';
  objectRef: ObjectRef;
  schemaSnapshot?: UniversalSchema;
  schemaFetchedAt?: string;
}
