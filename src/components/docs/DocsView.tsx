import React, { useState } from 'react';
import { BookOpen, FileCode, Shield, Terminal, CheckSquare, Wrench } from 'lucide-react';

export const DocsView: React.FC = () => {
  const [activeDoc, setActiveDoc] = useState<'architecture' | 'adding_connector' | 'scopes' | 'api' | 'qa' | 'runbook'>('architecture');

  const docs = [
    { id: 'architecture', title: 'Architecture & engine', icon: BookOpen },
    { id: 'adding_connector', title: 'Adding a connector', icon: FileCode },
    { id: 'scopes', title: 'OAuth scopes', icon: Shield },
    { id: 'api', title: 'REST API v1', icon: Terminal },
    { id: 'qa', title: 'QA checklist', icon: CheckSquare },
    { id: 'runbook', title: 'Operations runbook', icon: Wrench }
  ];

  return (
    <div className="max-w-[1100px] mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold text-[var(--text-primary)] tracking-tight">
          Documentation & runbooks
        </h1>
        <p className="text-[14px] text-[var(--text-muted)] mt-1">
          Engineering specifications, connector development guidelines, and operational runbooks.
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-[var(--border-main)] pb-2 overflow-x-auto">
        {docs.map((d) => {
          const Icon = d.icon;
          return (
            <button
              key={d.id}
              onClick={() => setActiveDoc(d.id as any)}
              className={`h-8 px-3 text-[12px] font-medium rounded-[6px] flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activeDoc === d.id
                  ? 'bg-[var(--bg-raised)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{d.title}</span>
            </button>
          );
        })}
      </div>

      <div className="bg-[var(--bg-card)] p-6 rounded-[6px] border border-[var(--border-main)] text-[14px] text-[var(--text-secondary)] leading-relaxed space-y-4">
        {activeDoc === 'architecture' && (
          <div className="space-y-4">
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">System architecture & sync engine</h2>
            <p>
              Dataloop is engineered with a strict separation of concerns across 6 core layers:
            </p>
            <ol className="list-decimal pl-5 space-y-1.5 text-[14px]">
              <li><strong className="text-[var(--text-primary)]">Web/UI Layer</strong>: React SPA with design tokens, responsive typography, and state synchronization.</li>
              <li><strong className="text-[var(--text-primary)]">API & Auth Layer</strong>: Express server with Supabase Bearer token authentication, input validation, and workspace isolation.</li>
              <li><strong className="text-[var(--text-primary)]">Sync Engine</strong>: Pure TypeScript engine with zero framework dependencies, fully unit tested.</li>
              <li><strong className="text-[var(--text-primary)]">Connector Layer</strong>: Plug-and-play connector interface implementing schema discovery, token refresh, and normalized error mapping.</li>
              <li><strong className="text-[var(--text-primary)]">Jobs Layer</strong>: Inngest durable step functions supporting backoff with jitter and concurrency locking.</li>
              <li><strong className="text-[var(--text-primary)]">Data Layer</strong>: Drizzle ORM schema with AES-256-GCM envelope encryption.</li>
            </ol>
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)] pt-2">Loop prevention & change detection</h3>
            <p>
              To eliminate infinite echo loops in bi-directional syncs, Dataloop records the deterministic SHA-256 hash of every value write in the <code className="px-1.5 py-0.5 rounded-[4px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-[12px] font-mono text-[var(--text-primary)]">record_links</code> table. During subsequent read cycles, any incoming record whose hash equals our own last write is skipped.
            </p>
          </div>
        )}

        {activeDoc === 'adding_connector' && (
          <div className="space-y-4">
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Adding a new connector</h2>
            <p>
              Dataloop was designed so adding a new integration requires only two files:
            </p>
            <ol className="list-decimal pl-5 space-y-1 text-[14px]">
              <li>Create <code className="px-1.5 py-0.5 rounded-[4px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-[12px] font-mono text-[var(--text-primary)]">/src/lib/connectors/&lt;name&gt;/index.ts</code> implementing the <code className="px-1.5 py-0.5 rounded-[4px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-[12px] font-mono text-[var(--text-primary)]">Connector</code> interface.</li>
              <li>Export and register it in <code className="px-1.5 py-0.5 rounded-[4px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-[12px] font-mono text-[var(--text-primary)]">/src/lib/connectors/registry.ts</code>.</li>
            </ol>
            <pre className="p-4 bg-[var(--bg-raised)] text-[var(--text-primary)] rounded-[6px] border border-[var(--border-main)] text-[12px] font-mono overflow-x-auto leading-normal">
{`export interface Connector {
  id: string;
  displayName: string;
  capabilities: { read: boolean; write: boolean; delete: boolean; ... };
  auth: { type: 'oauth2' | 'none'; getAuthUrl; exchangeCode; requiredScopes; };
  listObjects(account): Promise<ObjectRef[]>;
  getSchema(account, object): Promise<UniversalSchema>;
  readRecords(account, object, opts): Promise<{ records; nextCursor }>;
  createRecord(account, object, rec, idempotencyKey): Promise<WriteResult>;
  updateRecord(account, object, externalId, rec, idempotencyKey): Promise<WriteResult>;
  rateLimitPolicy: RateLimitPolicy;
  mapError(err: unknown): NormalizedError;
}`}
            </pre>
          </div>
        )}

        {activeDoc === 'scopes' && (
          <div className="space-y-4">
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">OAuth scopes & least-privilege policy</h2>
            <p>
              Dataloop never asks for wide admin or account-wide permissions. Scopes are restricted to specific tables or databases:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-[14px]">
              <li><strong className="text-[var(--text-primary)]">Google Sheets</strong>: <code className="text-[12px] font-mono text-[var(--text-secondary)]">https://www.googleapis.com/auth/spreadsheets</code> (only spreadsheets, no Google Drive or Gmail).</li>
              <li><strong className="text-[var(--text-primary)]">Airtable</strong>: <code className="text-[12px] font-mono text-[var(--text-secondary)]">data.records:read</code>, <code className="text-[12px] font-mono text-[var(--text-secondary)]">data.records:write</code>, <code className="text-[12px] font-mono text-[var(--text-secondary)]">schema.bases:read</code>.</li>
              <li><strong className="text-[var(--text-primary)]">Notion</strong>: <code className="text-[12px] font-mono text-[var(--text-secondary)]">read_content</code>, <code className="text-[12px] font-mono text-[var(--text-secondary)]">update_content</code>, <code className="text-[12px] font-mono text-[var(--text-secondary)]">insert_content</code> (restricted to shared databases).</li>
              <li><strong className="text-[var(--text-primary)]">HubSpot</strong>: <code className="text-[12px] font-mono text-[var(--text-secondary)]">crm.objects.contacts.read</code>, <code className="text-[12px] font-mono text-[var(--text-secondary)]">crm.objects.contacts.write</code>.</li>
            </ul>
          </div>
        )}

        {activeDoc === 'api' && (
          <div className="space-y-4">
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">REST API v1 reference</h2>
            <p>
              All endpoints require <code className="px-1.5 py-0.5 rounded-[4px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-[12px] font-mono text-[var(--text-primary)]">Authorization: Bearer &lt;api_key&gt;</code> and return JSON.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-[14px]">
              <li><code className="text-[12px] font-mono text-[var(--text-primary)]">GET /api/v1/syncs</code> — List all sync pipelines in the workspace.</li>
              <li><code className="text-[12px] font-mono text-[var(--text-primary)]">GET /api/v1/syncs/:id</code> — Retrieve sync details, field mappings, and recent runs.</li>
              <li><code className="text-[12px] font-mono text-[var(--text-primary)]">POST /api/v1/syncs/:id/run</code> — Trigger a live execution or simulation run.</li>
              <li><code className="text-[12px] font-mono text-[var(--text-primary)]">GET /api/v1/runs/:id</code> — Check execution status and per-record sync events.</li>
            </ul>
          </div>
        )}

        {activeDoc === 'qa' && (
          <div className="space-y-4">
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Acceptance criteria QA suite</h2>
            <p>
              Dataloop includes an automated Vitest test suite and manual verification flows for all acceptance criteria:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-[14px]">
              <li>Conflict resolution test for source_wins, destination_wins, newest_wins, and manual review.</li>
              <li>Loop prevention test proving zero writes once endpoints stabilize.</li>
              <li>Idempotency key test proving re-running a job produces zero duplicate records.</li>
              <li>Formula injection protection sanitizing =, +, -, @ with an apostrophe prefix on CSV export.</li>
            </ul>
          </div>
        )}

        {activeDoc === 'runbook' && (
          <div className="space-y-4">
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Operations runbook</h2>
            <p>
              <strong className="text-[var(--text-primary)]">Dead-letter replay</strong>: When vendor errors or missing fields cause a record to exceed 6 retries, it is placed in dead letters. Engineers can fix mappings and trigger single or bulk replays from the Health & Error Center.
            </p>
            <p>
              <strong className="text-[var(--text-primary)]">Key rotation</strong>: Generate a 32-byte hex key, configure ENCRYPTION_KEY_V2, and execute migration to re-encrypt records with key_version = 'v2'.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
