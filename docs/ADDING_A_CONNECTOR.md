# ADDING A CONNECTOR GUIDE

To add a new data connector to Dataloop (e.g. Linear, Asana, or Shopify), you only need to create a folder in `/src/lib/connectors/<connector_name>` that implements the `Connector` interface, and add one line to the registry in `/src/lib/connectors/registry.ts`.

## 1. Implement the Connector Interface
Create `/src/lib/connectors/<name>/index.ts`:

```typescript
import { Connector, ConnectorAccount, ReadRecordsOptions } from '../interface';
import { UniversalSchema, UniversalRecord, ObjectRef, WriteResult, NormalizedError } from '../../sync-engine/types';

export const MyNewConnector: Connector = {
  id: 'my_new_connector',
  displayName: 'My New Connector',
  capabilities: {
    read: true,
    write: true,
    delete: false,
    webhooks: true,
    incrementalSync: true,
    schemaDiscovery: true
  },
  auth: {
    type: 'oauth2',
    getAuthUrl: ({ redirectUri, state }) => {
      return `https://provider.com/oauth/authorize?client_id=...&redirect_uri=${redirectUri}&state=${state}`;
    },
    exchangeCode: async (ctx, code) => ({
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      scopes: ['read', 'write']
    }),
    requiredScopes: ['records:read', 'records:write']
  },
  listObjects: async (account) => [
    { id: 'projects', name: 'Projects', type: 'object' }
  ],
  getSchema: async (account, object) => ({
    objectId: object.id,
    fields: [
      { key: 'id', label: 'ID', type: 'text', required: true, readOnly: true },
      { key: 'title', label: 'Title', type: 'text', required: true, readOnly: false }
    ]
  }),
  readRecords: async (account, object, opts) => {
    // Return records converted to UniversalRecord shape
    return { records: [] };
  },
  createRecord: async (account, object, rec, idempotencyKey) => {
    return { success: true, externalId: 'new_id' };
  },
  updateRecord: async (account, object, externalId, rec, idempotencyKey) => {
    return { success: true, externalId };
  },
  rateLimitPolicy: {
    requestsPerSecond: 5,
    burst: 10,
    respectRetryAfter: true
  },
  mapError: (err: unknown): NormalizedError => {
    return {
      category: 'retryable',
      code: 'PROVIDER_ERROR',
      userMessage: String(err)
    };
  }
};
```

## 2. Register in Registry
Add to `/src/lib/connectors/registry.ts`:
```typescript
import { MyNewConnector } from './my_new_connector';

export const connectorRegistry: Record<string, Connector> = {
  // ... existing connectors
  my_new_connector: MyNewConnector
};
```

The new connector will instantly appear in the New Sync Wizard, Connections manager, and REST API.
