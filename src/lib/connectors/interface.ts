/**
 * Universal Connector Interface
 * Follows Section 4.2 of the Build Brief
 */

import {
  UniversalSchema,
  UniversalRecord,
  ObjectRef,
  TokenSet,
  WriteResult,
  WebhookRegistration,
  WebhookEvent,
  RateLimitPolicy,
  NormalizedError,
  FilterGroup
} from '../sync-engine/types';

export interface ConnectorAccount {
  id: string;
  workspaceId: string;
  connectorKey: string;
  displayName: string;
  accessToken: string;
  refreshToken?: string;
  encryptedAccessToken?: string;
  encryptedRefreshToken?: string;
  keyVersion?: string;
  expiresAt?: string;
  scopes: string[];
}

export interface ReadRecordsOptions {
  cursor?: string;
  since?: Date;
  filter?: FilterGroup;
  pageSize?: number;
}

export interface Connector {
  id: string; // "google_sheets" | "notion" | "airtable" | "hubspot" | "csv" | "mock_db"
  displayName: string;
  capabilities: {
    read: boolean;
    write: boolean;
    delete: boolean;
    webhooks: boolean;
    incrementalSync: boolean;
    schemaDiscovery: boolean;
  };
  auth: {
    type: 'oauth2' | 'none';
    getAuthUrl(ctx: { redirectUri: string; state: string }): string;
    exchangeCode(ctx: { redirectUri: string }, code: string): Promise<TokenSet>;
    refresh?(ctx: { redirectUri: string }, tokens: TokenSet): Promise<TokenSet>;
    requiredScopes: string[]; // least-privilege
  };
  listObjects(account: ConnectorAccount): Promise<ObjectRef[]>;
  getSchema(account: ConnectorAccount, object: ObjectRef): Promise<UniversalSchema>;
  readRecords(
    account: ConnectorAccount,
    object: ObjectRef,
    opts: ReadRecordsOptions
  ): Promise<{ records: UniversalRecord[]; nextCursor?: string }>;
  createRecord(
    account: ConnectorAccount,
    object: ObjectRef,
    rec: Omit<UniversalRecord, 'externalId'>,
    idempotencyKey: string
  ): Promise<WriteResult>;
  updateRecord(
    account: ConnectorAccount,
    object: ObjectRef,
    externalId: string,
    rec: Partial<UniversalRecord>,
    idempotencyKey: string
  ): Promise<WriteResult>;
  deleteRecord?(
    account: ConnectorAccount,
    object: ObjectRef,
    externalId: string,
    idempotencyKey: string
  ): Promise<WriteResult>;
  registerWebhook?(
    account: ConnectorAccount,
    object: ObjectRef,
    callbackUrl: string
  ): Promise<WebhookRegistration>;
  verifyWebhook?(req: { headers: Record<string, string>; body: unknown }): Promise<WebhookEvent[]>;
  rateLimitPolicy: RateLimitPolicy;
  mapError(err: unknown): NormalizedError;
}
