# QUALITY ASSURANCE (QA) CHECKLIST

This checklist covers manual and automated verification for all 18 Acceptance Criteria in Section 16 of the Build Brief.

| # | Acceptance Criterion | Verification Method | Pass/Fail Criteria |
|---|----------------------|---------------------|--------------------|
| 1 | Onboarding & Auth | UI Flow Test | User can sign in, switch workspaces, and access 7-step wizard. |
| 2 | Connect Sheets & Airtable | Wizard Step 1–4 | Auto-suggest matches fields with confidence badges, types are detected, preview renders 5 rows. |
| 3 | Notion & HubSpot Endpoints | Wizard & Schema Discovery | Database properties and CRM contact fields load correctly into schema selector. |
| 4 | CSV Upload & Export | Dataset Manager | CSV uploaded, types inferred (email, currency, date), formulas sanitized with `'`. |
| 5 | Two-Way Sync Conflict Rules | Unit Test & UI Review Queue | Tests prove `source_wins`, `destination_wins`, `newest_wins`, and `manual` review. |
| 6 | Loop Prevention | Unit Test & Live Sync | After sync stabilizes, re-running produces zero writes (`writesA.length === 0 && writesB.length === 0`). |
| 7 | Idempotency on Crash | Unit Test | Idempotency keys format `{syncId}:{runId}:{recordLinkId}:{action}` verified; re-runs prevent duplicate records. |
| 8 | Rate Limiting & Backoff | Rate Limiter Test | Token bucket enforces requests per second; 429 returns backoff with jitter up to 5 min. |
| 9 | Expired OAuth Tokens | Error Center & Connections | Expired tokens show "Needs Reconnect" badge and pause dependent syncs. |
| 10 | Error Center Fix Links | UI Click Test | Deep-links correctly navigate to Field Mappings or Connections screen with fix hints. |
| 11 | Stripe Billing & Limits | Billing Page & Plan Checks | 14-day Pro trial banner visible; usage meters warn at 80% and block at 100%. |
| 12 | Tenant Isolation (RLS) | Store Unit Check | Workspace A users cannot query or execute syncs belonging to Workspace B. |
| 13 | Token Encryption | Crypto Unit Check | Inspected tokens in DB are encrypted (`v1:<iv>:<authTag>:<cipher>`). |
| 14 | Audit Logging | Security Tab | Security actions (sync created, activated, key generated, export) logged with timestamp and user. |
| 15 | Data Export & Deletion | Settings Tab | JSON/ZIP export generated and downloaded; workspace soft-deleted with 7-day grace period. |
| 16 | REST API Keys | cURL / Postman | Bearer token authorization accesses `/api/v1/syncs` and triggers runs. |
| 17 | Code Quality & Tests | `npm run lint` & `npm test` | Passes lint (`npm run lint`), typecheck (`npm run typecheck`), and Vitest test suite (`npm test`) with zero errors (Lighthouse requirement removed per specification). |
| 18 | Local Setup < 30min | README Instructions | `.env.example`, mock connector, and `npm run dev` allow instant local operation. |
