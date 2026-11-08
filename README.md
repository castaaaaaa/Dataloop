# Dataloop — No-Code Data Sync Platform (MVP v1)

Keep Notion, Airtable, Google Sheets, and HubSpot in sync — set up in 10 minutes, no code, no surprise task bills.

## 0. Assumptions & Principles
- **App Name**: Configurable via `NEXT_PUBLIC_APP_NAME` (defaults to "Dataloop").
- **Target ICP**: Small agencies and freelancers running client work in Notion/Airtable who need leads or contacts synced with HubSpot or Google Sheets without manual copy-paste or escalating Zapier task fees.
- **Consistency**: Record-level eventual consistency with zero infinite loops. Webhook-triggered syncs usually complete within 1 minute.
- **Universal Abstraction**: Each connector exposes "objects" (sheet tabs, databases, tables, CRM object types, CSV datasets) with "fields" and "records".

## 1. Tech Stack
- **Framework**: React SPA on Vite + TypeScript (strict mode) + Express server for REST API and background jobs.
- **UI & Styling**: Tailwind CSS, Lucide icons, Plus Jakarta Sans display typography, JetBrains Mono tabular numerals.
- **Database & Auth**: Multi-tenant schema with Row-Level Security isolation, typed Drizzle ORM models, and role-based permissions (Owner, Admin, Member, Viewer).
- **Security & Encryption**: AES-256-GCM envelope encryption for OAuth tokens with key versioning (`ENCRYPTION_KEY`). Formula injection protection on CSV imports and exports.

## 2. Quickstart & Local Setup (< 5 minutes)
1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
3. Start the full-stack development server on port 3000:
   ```bash
   npm run dev
   ```
4. Run unit tests and QA suite:
   ```bash
   npm test
   ```

*Note: Dataloop includes a built-in Mock CRM & Database connector and sample datasets so the entire application, sync wizard, dry-run simulation, conflict resolution queue, and health error center can be evaluated out of the box without configuring real vendor API keys.*

## 3. Architecture & Documentation
Detailed operational guides are located in `/docs`:
- [`/docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — System layers, engine algorithm, loop prevention, and token bucket rate limits.
- [`/docs/ADDING_A_CONNECTOR.md`](docs/ADDING_A_CONNECTOR.md) — How to add new connectors with 1 file and 1 registry entry.
- [`/docs/SCOPES.md`](docs/SCOPES.md) — Least-privilege OAuth scopes justification.
- [`/docs/API.md`](docs/API.md) — REST API v1 specification (`/api/v1/syncs`, `/api/v1/runs`, `/api/health`).
- [`/docs/QA.md`](docs/QA.md) — Verification checklist for all 18 Acceptance Criteria.
- [`/docs/RUNBOOK.md`](docs/RUNBOOK.md) — Dead-letter replay procedures, key rotation, and outage mitigation.

## 4. Known Limitations (Intentionally Excluded from V1)
- Multi-hop sync pipelines (A → B → C) and cross-source joins (single pair per sync).
- Attachment and binary image syncing (unsupported field notices shown).
- Notion block-level page body content (database properties only).
- Airtable linked-record syncing beyond text display names.
- SSO/SAML, custom domains, or white-labeling.
