# ARCHITECTURE DOCUMENTATION

## 1. System Overview
Dataloop is a multi-tenant, no-code data synchronization platform purpose-built for Notion, Airtable, Google Sheets, HubSpot, and CSV datasets. It delivers bi-directional synchronization, reliable conflict resolution, type-safe field transformations, and automated error recovery.

```
┌────────────────────────────────────────────────────────┐
│                   Web & UI Layer                       │
│        React SPA + Tailwind CSS + Lucide Icons         │
└───────────────────────────┬────────────────────────────┘
                            │ REST / API Actions
┌───────────────────────────▼────────────────────────────┐
│                    API & Route Layer                   │
│       Express Server + Bearer API Key Auth + RLS       │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                   Sync Engine Core                     │
│  Diffing · Record Links · Conflict Resolution · Loops  │
│          Idempotency Keys · 10 Transformations         │
└─────────────┬───────────────────────────┬──────────────┘
              │                           │
┌─────────────▼─────────────┐   ┌─────────▼──────────────┐
│      Connector Layer      │   │       Data Layer       │
│ Google Sheets · Airtable  │   │ Drizzle Postgres / RLS │
│ Notion · HubSpot · CSV    │   │ AES-256-GCM Encryption │
│     Rate Limiter Bucket   │   │  Audit & Error Queues  │
└───────────────────────────┘   └────────────────────────┘
```

## 2. Key Architectural Guarantees
- **Eventually Consistent**: Record-level synchronization with automatic change hashing.
- **Infinite Loop Prevention**: Writes generate a stable SHA-256 hash stored in `record_links`. Incoming reads that match our own last write are discarded.
- **Idempotency**: All writes carry `{syncId}:{runId}:{recordLinkId}:{action}` idempotency keys, eliminating duplicate writes on retries.
- **Envelope Encryption**: Access tokens and webhook secrets are encrypted at rest with AES-256-GCM using `v1:<iv>:<authTag>:<ciphertext>`.
- **Tenant Isolation**: Row-Level Security checks verify that `workspace_id` matches the authenticated context before reading or writing rows.
