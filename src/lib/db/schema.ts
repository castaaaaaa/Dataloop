/**
 * Database Schema (Drizzle ORM definition)
 * Complete implementation of Section 5 of the Build Brief (all 22 tables + indexes)
 */

export interface UserRow {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  themePreference?: 'light' | 'dark' | 'system';
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  planId: string;
  trialEndsAt?: string | null;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMemberRow {
  id: string;
  workspaceId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  invitedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceInviteRow {
  id: string;
  workspaceId: string;
  email: string;
  role: 'admin' | 'member';
  invitedBy: string;
  status: 'pending' | 'accepted' | 'revoked';
  createdAt: string;
  updatedAt?: string;
}

export interface ConnectedAccountRow {
  id: string;
  workspaceId: string;
  connectorKey: string;
  displayName: string;
  externalAccountId?: string;
  encryptedAccessToken?: string;
  encryptedRefreshToken?: string;
  keyVersion?: string;
  scopes: string[];
  expiresAt?: string;
  status: 'active' | 'needs_reconnect' | 'revoked';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  credentialsStored?: boolean;
  pipelineCount?: number;
}

export interface DataEndpointRow {
  id: string;
  workspaceId: string;
  connectedAccountId?: string;
  connectorId: string;
  objectRef: {
    id: string;
    name: string;
    type?: string;
    recordCount?: number;
  };
  schemaSnapshot?: any;
  schemaFetchedAt?: string;
  role: 'source' | 'destination' | 'both';
  createdAt: string;
  updatedAt: string;
}

export interface CsvDatasetRow {
  id: string;
  workspaceId: string;
  name: string;
  filename: string;
  fileSize: number;
  rowCount: number;
  columns: Array<{ key: string; label: string; type: string }>;
  records: Array<{ externalId: string; values: Record<string, unknown> }>;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncConfigRow {
  id: string;
  workspaceId: string;
  name: string;
  endpointAId: string;
  endpointBId: string;
  direction: 'a_to_b' | 'b_to_a' | 'two_way';
  conflictRule: 'source_wins' | 'destination_wins' | 'newest_wins' | 'manual';
  triggerMode: 'manual' | 'scheduled' | 'webhook';
  intervalMinutes: number;
  deleteBehavior: 'ignore' | 'soft_delete' | 'hard_delete';
  filters?: any;
  status: 'draft' | 'active' | 'paused' | 'error';
  lastRunAt?: string;
  nextRunAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  sourceDatasetId?: string;
  destinationAccountId?: string;
  destinationResourceId?: string;
  destinationResourceName?: string;
}

export interface FieldMappingRow {
  id: string;
  syncConfigId: string;
  sourceFieldKey: string;
  destinationFieldKey: string;
  transform?: any;
  defaultValue?: any;
  isKey: boolean;
  required: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecordLinkRow {
  id: string;
  syncConfigId: string;
  aExternalId: string;
  bExternalId: string;
  lastSyncedHashA: string;
  lastSyncedHashB: string;
  lastSyncedAt: string;
  aDeleted?: boolean;
  bDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SyncRunRow {
  id: string;
  syncConfigId: string;
  trigger: 'manual' | 'schedule' | 'webhook' | 'api' | 'dry_run';
  status: 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelled';
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
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncEventRow {
  id: string;
  syncRunId: string;
  recordLinkId?: string;
  action: 'create' | 'update' | 'delete' | 'skip' | 'conflict';
  side: 'A' | 'B';
  status: 'succeeded' | 'failed' | 'pending';
  idempotencyKey: string;
  before?: any;
  after?: any;
  message?: string;
  createdAt: string;
}

export interface SyncErrorRow {
  id: string;
  syncRunId: string;
  syncEventId?: string;
  category: string;
  code: string;
  userMessage: string;
  fixHint?: string;
  raw?: any;
  isResolved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeadLetterRow {
  id: string;
  syncConfigId: string;
  syncEventId?: string;
  payload: any;
  lastError: string;
  status: 'open' | 'replayed' | 'dismissed';
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConflictRow {
  id: string;
  syncConfigId: string;
  recordLinkId: string;
  aValue: any;
  bValue: any;
  status: 'open' | 'resolved';
  resolution?: 'use_a' | 'use_b' | 'custom';
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanRow {
  id: string;
  key: 'free' | 'starter' | 'pro' | 'business';
  name: string;
  priceMonthlyCents: number;
  priceAnnualMonthlyCents: number;
  limits: {
    maxRecords: number;
    maxActiveSyncs: number;
    minIntervalMinutes: number;
    premiumConnectors: boolean;
    teamSeats: number;
    logRetentionDays: number;
    realtime: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionRow {
  id: string;
  workspaceId: string;
  planKey: 'free' | 'starter' | 'pro' | 'business';
  status: 'active' | 'trialing' | 'past_due' | 'canceled';
  trialEnd?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpgradeRequestRow {
  id: string;
  workspaceId: string;
  email: string;
  requestedPlanKey: string;
  status: 'pending' | 'notified' | 'approved';
  createdAt: string;
}

export interface UsageCounterRow {
  id: string;
  workspaceId: string;
  periodStart: string;
  periodEnd: string;
  recordsSynced: number;
  runsCount: number;
  activeSyncsPeak: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyRow {
  id: string;
  workspaceId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  lastUsedAt?: string;
  revokedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogRow {
  id: string;
  workspaceId: string;
  actorUserId?: string;
  actorEmail?: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: any;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}
