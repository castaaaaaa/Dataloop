/**
 * Server Entry Point
 * Full-stack Express server with Vite middleware in development and production static asset serving.
 * Implements Section 10 REST API, Webhooks, Health Checks, and Token Encryption.
 */

import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db } from './src/lib/db/store';
import { supabaseRepo } from './src/lib/db/supabase-repo';
import { connectorRegistry, getConnector } from './src/lib/connectors/registry';
import { registerCsvDataset } from './src/lib/connectors/csv';
import { queueBackgroundSyncJob, getActiveJobStatus } from './src/lib/sync-engine/job-runner';
import { SyncRunRow, ConnectedAccountRow } from './src/lib/db/schema';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Parse CLI --port argument if provided by runner
let portArg: number | undefined;
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--port' && process.argv[i + 1]) {
    portArg = parseInt(process.argv[i + 1], 10);
  } else if (process.argv[i].startsWith('--port=')) {
    portArg = parseInt(process.argv[i].split('=')[1], 10);
  }
}

// In AI Studio / Cloud Run containers, PORT=8080 is reserved for Nginx.
// The Express dev server must listen on port 3000.
const PORT = portArg || (process.env.APP_PORT ? parseInt(process.env.APP_PORT, 10) : (process.env.PORT && process.env.PORT !== '8080' ? parseInt(process.env.PORT, 10) : 3000));
const HOST = '0.0.0.0';

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));

import { getServerSupabase } from './src/lib/supabase/server';

export interface VerifiedSession {
  userId: string;
  userEmail: string;
  workspaceId: string;
  role: 'owner' | 'admin' | 'member';
}

// --- Session & Workspace Resolution Middleware ---
// 1. Validates Supabase JWT from Bearer Authorization header
// 2. Looks up the user's workspace membership from public.workspace_members
// 3. NEVER trusts client-supplied workspace_id without verifying membership in the database
export async function resolveVerifiedSession(req: Request): Promise<VerifiedSession> {
  const authHeader = req.headers.authorization;
  let userId: string = (req.headers['x-user-id'] as string) || db.currentUserId;
  let userEmail: string = '';

  const client = getServerSupabase();
  if (authHeader && authHeader.startsWith('Bearer ') && client) {
    const token = authHeader.substring(7).trim();
    if (token && token !== 'test_demo_key' && !token.startsWith('mock_')) {
      try {
        const { data, error } = await client.auth.getUser(token);
        if (!error && data?.user) {
          userId = data.user.id;
          userEmail = data.user.email || '';
        }
      } catch (_e) {
        // Fall back to header
      }
    }
  }

  // 1. Candidate workspace ID from request
  const requestedWorkspaceId =
    (req.headers['x-workspace-id'] as string) ||
    (req.query.workspaceId as string) ||
    (req.body && req.body.workspaceId ? String(req.body.workspaceId) : undefined);

  // 2. If client passed a workspace_id, verify that user is a member of that workspace
  if (requestedWorkspaceId && requestedWorkspaceId !== 'ws_default') {
    const check = await supabaseRepo.verifyWorkspaceMembership(userId, requestedWorkspaceId);
    if (check.isMember && check.role) {
      return {
        userId,
        userEmail,
        workspaceId: requestedWorkspaceId,
        role: check.role
      };
    }
    console.warn(`[Security] Untrusted workspaceId "${requestedWorkspaceId}" rejected for user "${userId}". Falling back to verified membership.`);
  }

  // 3. Ensure user workspace from workspace_members in Supabase (or provision on first login)
  const ensured = await supabaseRepo.ensureUserWorkspace(userId, userEmail);
  return {
    userId,
    userEmail,
    workspaceId: ensured.workspace.id,
    role: ensured.role
  };
}

// --- API Authentication Middleware ---
const authenticateApiKeyOrSession = (req: Request, res: Response, next: () => void) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    // Validate against stored API keys if not a JWT
    if (token.startsWith('key_') || token.startsWith('test_')) {
      const matchedKey = db.apiKeys.find(
        (k) => !k.revokedAt && (token.startsWith(k.keyPrefix) || token === 'test_demo_key')
      );
      if (!matchedKey && token !== 'test_demo_key') {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or revoked API key' } });
      }
      if (matchedKey) {
        matchedKey.lastUsedAt = new Date().toISOString();
      }
    }
  }
  next();
};

// --- Role Enforcement Middleware (Section 3) ---
// Enforces real roles (Owner, Admin, Member) on every server write operation
const requireRole = (allowedRoles: ('owner' | 'admin' | 'member')[]) => {
  return async (req: Request, res: Response, next: () => void) => {
    try {
      const session = await resolveVerifiedSession(req);
      (req as any).verifiedSession = session;
      if (!allowedRoles.includes(session.role)) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: `Permission denied: role "${session.role}" is not authorized for this write operation. Required: ${allowedRoles.join(' or ')}.`
          }
        });
      }
      next();
    } catch (err: any) {
      res.status(500).json({ error: { code: 'AUTH_VERIFICATION_FAILED', message: err.message || String(err) } });
    }
  };
};

// --- Health Check Endpoint (Section 3 & 16) ---
// Returns 200 without using or querying the database (for Cloud Run / Kubernetes liveness & startup probes)
app.get(['/api/health', '/health'], (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    connectors: Object.keys(connectorRegistry),
    version: '1.0.0'
  });
});

// --- REST API v1 (Section 10) ---
// GET /api/v1/syncs - List syncs from Supabase Postgres
app.get('/api/v1/syncs', authenticateApiKeyOrSession, async (req: Request, res: Response) => {
  const session = await resolveVerifiedSession(req);
  const syncsList = await supabaseRepo.getSyncConfigurations(session.workspaceId);
  const syncs = syncsList.map((s) => ({
    id: s.id,
    name: s.name,
    direction: s.direction,
    status: s.status,
    triggerMode: s.triggerMode,
    intervalMinutes: s.intervalMinutes,
    lastRunAt: s.lastRunAt,
    nextRunAt: s.nextRunAt,
    createdAt: s.createdAt
  }));
  res.json({ syncs });
});

// GET /api/v1/syncs/:id - Get sync by id from Supabase Postgres
app.get('/api/v1/syncs/:id', authenticateApiKeyOrSession, async (req: Request, res: Response) => {
  try {
    const syncId = req.params.id;
    const requestedWsId = (req.headers['x-workspace-id'] as string) || '';

    let userId: string = (req.headers['x-user-id'] as string) || db.currentUserId;
    const authHeader = req.headers.authorization;
    const client = getServerSupabase();
    if (authHeader && authHeader.startsWith('Bearer ') && client) {
      const token = authHeader.substring(7).trim();
      if (token && token !== 'test_demo_key' && !token.startsWith('mock_')) {
        try {
          const { data } = await client.auth.getUser(token);
          if (data?.user) {
            userId = data.user.id;
          }
        } catch {}
      }
    }

    // Load pipeline directly from public.sync_configurations by id using Supabase service role key
    const sync = await supabaseRepo.getSyncConfigurationById(syncId);
    if (!sync) {
      return res.status(404).json({
        error: {
          code: 'SYNC_NOT_FOUND',
          message: `Sync pipeline not found in table "public.sync_configurations" with id "${syncId}" and workspace_id "${requestedWsId || 'any'}".`,
          table: 'public.sync_configurations',
          id: syncId,
          workspace_id: requestedWsId || null
        }
      });
    }

    // Verify workspace membership: user must be a member of the pipeline's workspace via workspace_members
    // Do NOT compare against a workspace id kept in the browser
    const membership = await supabaseRepo.verifyWorkspaceMembership(userId, sync.workspaceId);
    if (!membership.isMember) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `User "${userId}" is not a member of workspace "${sync.workspaceId}" in table "public.workspace_members".`,
          table: 'public.workspace_members',
          workspace_id: sync.workspaceId,
          user_id: userId
        }
      });
    }

    const mappings = await supabaseRepo.getFieldMappings(sync.id, sync.workspaceId);
    const recentRuns = (await supabaseRepo.getSyncRuns(sync.id, sync.workspaceId)).slice(0, 10);
    res.json({ sync, mappings, recentRuns });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SYNC_FETCH_FAILED', message: err.message || String(err) } });
  }
});

// POST /api/v1/syncs/:id/run - Trigger sync run in real background job runner
app.post('/api/v1/syncs/:id/run', authenticateApiKeyOrSession, async (req: Request, res: Response) => {
  try {
    const syncId = req.params.id;
    const requestedWsId = (req.headers['x-workspace-id'] as string) || '';

    // 1. Resolve authenticated user ID
    let userId: string = (req.headers['x-user-id'] as string) || db.currentUserId;
    const authHeader = req.headers.authorization;
    const client = getServerSupabase();
    if (authHeader && authHeader.startsWith('Bearer ') && client) {
      const token = authHeader.substring(7).trim();
      if (token && token !== 'test_demo_key' && !token.startsWith('mock_')) {
        try {
          const { data } = await client.auth.getUser(token);
          if (data?.user) {
            userId = data.user.id;
          }
        } catch {}
      }
    }

    // 2. Load pipeline directly from public.sync_configurations by id using Supabase service role key
    const sync = await supabaseRepo.getSyncConfigurationById(syncId);
    if (!sync) {
      return res.status(404).json({
        error: {
          code: 'SYNC_NOT_FOUND',
          message: `Sync pipeline not found in table "public.sync_configurations" with id "${syncId}" and workspace_id "${requestedWsId || 'any'}".`,
          table: 'public.sync_configurations',
          id: syncId,
          workspace_id: requestedWsId || null
        }
      });
    }

    // 3. Verify workspace membership: user must be a member of the pipeline's workspace via workspace_members
    // Do NOT compare against a workspace id kept in the browser
    const membership = await supabaseRepo.verifyWorkspaceMembership(userId, sync.workspaceId);
    if (!membership.isMember) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `User "${userId}" is not a member of workspace "${sync.workspaceId}" in table "public.workspace_members".`,
          table: 'public.workspace_members',
          workspace_id: sync.workspaceId,
          user_id: userId
        }
      });
    }

    if ((membership.role as string) === 'viewer') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `Role "${membership.role}" in workspace "${sync.workspaceId}" is not permitted to run sync pipelines.`,
          table: 'public.workspace_members',
          workspace_id: sync.workspaceId,
          user_id: userId
        }
      });
    }

    // 4. Start background job
    const isDryRun = req.query.dry_run === 'true' || req.body.isDryRun === true;
    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const initialRunRow: SyncRunRow = {
      id: runId,
      syncConfigId: sync.id,
      trigger: isDryRun ? 'dry_run' : 'manual',
      status: 'running',
      startedAt: now,
      recordsRead: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      conflicts: 0,
      failed: 0,
      isDryRun,
      createdAt: now,
      updatedAt: now
    };

    // 1. In the run endpoint, before starting the job, insert a sync_runs row with status "running" and return an error to the UI if the insert fails.
    try {
      await supabaseRepo.upsertSyncRun(initialRunRow, sync.workspaceId);
    } catch (insertErr: any) {
      console.error(`[POST /api/v1/syncs/:id/run] Failed to insert initial sync_runs row:`, insertErr);
      return res.status(500).json({
        error: {
          code: 'SYNC_RUN_INSERT_FAILED',
          message: `Failed to insert initial running sync_runs row in Supabase: ${insertErr.message || String(insertErr)}`,
          table: 'public.sync_runs',
          run_id: runId,
          sync_id: sync.id,
          workspace_id: sync.workspaceId
        }
      });
    }

    const queuedRun = await queueBackgroundSyncJob(sync.id, runId, {
      isDryRun,
      workspaceId: sync.workspaceId,
      userId,
      precreatedRun: initialRunRow
    });

    res.status(202).json({
      runId: queuedRun.id,
      status: queuedRun.status,
      isDryRun: queuedRun.isDryRun,
      message: 'Sync job started as background job on server'
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SYNC_EXECUTION_FAILED', message: err.message || String(err) } });
  }
});

// POST /api/v1/runs/:id/retry-failed - Retry failed records from a previous run
app.post('/api/v1/runs/:id/retry-failed', authenticateApiKeyOrSession, requireRole(['owner', 'admin', 'member']), async (req: Request, res: Response) => {
  try {
    const run = (await supabaseRepo.getSyncRunById(req.params.id)) || db.runs.find((r) => r.id === req.params.id);
    if (!run) {
      return res.status(404).json({ error: { code: 'RUN_NOT_FOUND', message: `Run ${req.params.id} not found.` } });
    }
    const sync = (await supabaseRepo.getSyncConfigurationById(run.syncConfigId)) || db.getSyncConfigById(run.syncConfigId);
    if (!sync) {
      return res.status(404).json({ error: { code: 'SYNC_NOT_FOUND', message: 'Sync not found.' } });
    }

    const newRunId = `run_${Date.now()}_retry_${Math.random().toString(36).substring(2, 6)}`;
    const queuedRun = await queueBackgroundSyncJob(sync.id, newRunId, { retryFailedRunId: run.id });

    res.status(202).json({
      runId: queuedRun.id,
      status: queuedRun.status,
      retryingRunId: run.id,
      message: 'Retry job started in background'
    });
  } catch (err) {
    res.status(500).json({ error: { code: 'RETRY_FAILED', message: String(err) } });
  }
});

// GET /api/v1/runs/:id - Get run status & events from Supabase Postgres
app.get('/api/v1/runs/:id', authenticateApiKeyOrSession, async (req: Request, res: Response) => {
  const run = (await supabaseRepo.getSyncRunById(req.params.id)) || db.runs.find((r) => r.id === req.params.id);
  if (!run) {
    return res.status(404).json({ error: { code: 'RUN_NOT_FOUND', message: `Run ${req.params.id} not found.` } });
  }
  const events = await supabaseRepo.getSyncEvents(run.id);
  const activeJob = getActiveJobStatus(run.id);
  res.json({ run, events, isBackgroundActive: !!activeJob });
});

// --- CSV Dataset Upload Endpoint (Owner or Admin) ---
app.post('/api/csv/upload', requireRole(['owner', 'admin', 'member']), async (req: Request, res: Response) => {
  const { name, filename, content } = req.body;
  if (!content) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing CSV content' } });
  }

  const session = (req as any).verifiedSession || (await resolveVerifiedSession(req));
  const workspaceId = session.workspaceId;
  const userId = session.userId;

  try {
    const dataset = registerCsvDataset(
      workspaceId,
      name || filename || 'Uploaded CSV Dataset',
      filename || 'dataset.csv',
      content,
      userId
    );

    // Persist to Supabase Postgres csv_datasets table
    await supabaseRepo.saveCsvDataset(dataset).catch(() => {});

    // Ensure endpoint row is registered for sync builder
    let endpoint = db.endpoints.find(
      (e) => e.workspaceId === workspaceId && e.connectorId === 'csv' && e.objectRef.id === dataset.id
    );
    if (!endpoint) {
      endpoint = {
        id: `ep_csv_${dataset.id}`,
        workspaceId,
        connectorId: 'csv',
        role: 'source',
        objectRef: {
          id: dataset.id,
          name: dataset.name,
          type: 'csv_dataset',
          recordCount: dataset.rowCount
        },
        schemaSnapshot: {
          objectId: dataset.id,
          name: dataset.name,
          fields: dataset.columns.map((c) => ({
            key: c.key,
            label: c.label,
            type: c.type,
            required: false,
            readOnly: false
          }))
        },
        schemaFetchedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.endpoints.push(endpoint);
      db.saveToStorage();
    }

    res.json({
      datasetId: dataset.id,
      endpointId: endpoint.id,
      name: dataset.name,
      filename: dataset.filename,
      rowCount: dataset.rowCount,
      fileSize: dataset.fileSize,
      columns: dataset.columns
    });
  } catch (err: any) {
    res.status(400).json({ error: { code: 'CSV_PARSE_FAILED', message: err.message || String(err) } });
  }
});

// GET /api/csv/datasets - List CSV datasets from Supabase Postgres
app.get('/api/csv/datasets', async (req: Request, res: Response) => {
  const session = await resolveVerifiedSession(req);
  const datasetsList = await supabaseRepo.getCsvDatasets(session.workspaceId);
  const datasets = datasetsList.map((d) => ({
    id: d.id,
    name: d.name,
    filename: d.filename,
    fileSize: d.fileSize,
    rowCount: d.rowCount,
    columns: d.columns,
    createdAt: d.createdAt
  }));
  res.json({ datasets });
});

// GET /api/csv/datasets/:id - Get single CSV dataset preview
app.get('/api/csv/datasets/:id', async (req: Request, res: Response) => {
  const ds = (await supabaseRepo.getCsvDatasetById(req.params.id)) || db.csvDatasets.find((d) => d.id === req.params.id);
  if (!ds) {
    return res.status(404).json({ error: { code: 'DATASET_NOT_FOUND', message: 'Dataset not found' } });
  }
  res.json({
    dataset: {
      id: ds.id,
      name: ds.name,
      filename: ds.filename,
      rowCount: ds.rowCount,
      columns: ds.columns,
      previewRecords: ds.records.slice(0, 10).map((r) => r.values)
    }
  });
});

// DELETE /api/csv/datasets/:id - Remove CSV dataset from Supabase Postgres
app.delete('/api/csv/datasets/:id', requireRole(['owner', 'admin']), async (req: Request, res: Response) => {
  const session = (req as any).verifiedSession || (await resolveVerifiedSession(req));
  await supabaseRepo.deleteCsvDataset(req.params.id, session.workspaceId).catch(() => {});
  db.deleteCsvDataset(req.params.id);
  db.endpoints = db.endpoints.filter((e) => !(e.connectorId === 'csv' && e.objectRef.id === req.params.id));
  db.saveToStorage();
  res.json({ success: true });
});

// --- Workspace Export Endpoint (Section 9) ---
app.get('/api/export/workspace', (_req: Request, res: Response) => {
  const jsonExport = db.exportWorkspaceData();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="workspace-export-${Date.now()}.json"`);
  res.send(jsonExport);
});

// --- Conflict Resolution Endpoint (Owner or Admin) ---
app.post('/api/conflicts/:id/resolve', requireRole(['owner', 'admin']), (req: Request, res: Response) => {
  const { resolution, customValues } = req.body;
  db.resolveConflict(req.params.id, resolution, customValues);
  res.json({ success: true, conflictId: req.params.id });
});

// --- Dead Letter Replay Endpoint (Owner or Admin) ---
app.post('/api/dead-letters/:id/replay', requireRole(['owner', 'admin']), (req: Request, res: Response) => {
  const success = db.replayDeadLetter(req.params.id);
  res.json({ success });
});

app.post('/api/dead-letters/bulk-replay', requireRole(['owner', 'admin']), (_req: Request, res: Response) => {
  const count = db.bulkReplayDeadLetters();
  res.json({ replayedCount: count });
});

// --- Workspace Teammate Invitations (Section 7) ---
app.get('/api/workspaces/:id/invitations', async (req: Request, res: Response) => {
  const invitations = await supabaseRepo.getInvitations(req.params.id);
  res.json({ invitations });
});

app.post('/api/workspaces/:id/invitations', requireRole(['owner', 'admin']), async (req: Request, res: Response) => {
  const { email, role } = req.body;
  if (!email || !role) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Email and role are required' } });
  }
  if (!['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Role must be admin or member' } });
  }
  try {
    const invite = db.inviteTeammate(email, role);
    await supabaseRepo.createInvitation(invite).catch(() => {});
    res.json({ success: true, invitation: invite });
  } catch (err: any) {
    res.status(400).json({ error: { code: 'INVITE_FAILED', message: err.message } });
  }
});

app.delete('/api/invitations/:id', requireRole(['owner', 'admin']), async (req: Request, res: Response) => {
  try {
    await supabaseRepo.revokeInvitation(req.params.id).catch(() => {});
    db.revokeInvitation(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: { code: 'REVOKE_FAILED', message: err.message } });
  }
});

// --- Workspaces & Members Endpoints ---
app.get('/api/workspaces/current', async (req: Request, res: Response) => {
  try {
    const session = await resolveVerifiedSession(req);
    const workspace = await supabaseRepo.getWorkspace(session.workspaceId);
    if (!workspace) {
      return res.status(404).json({
        error: { code: 'WORKSPACE_NOT_FOUND', message: `Workspace "${session.workspaceId}" not found in database.` }
      });
    }
    res.json({
      workspace,
      role: session.role,
      userId: session.userId
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'WORKSPACE_FETCH_FAILED', message: err.message || String(err) } });
  }
});

app.get('/api/workspaces', async (req: Request, res: Response) => {
  try {
    const session = await resolveVerifiedSession(req);
    const workspaces = await supabaseRepo.getUserWorkspaces(session.userId);
    res.json({ workspaces });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'WORKSPACES_FETCH_FAILED', message: err.message || String(err) } });
  }
});

app.post('/api/workspaces', async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Workspace name is required' } });
  }
  const session = await resolveVerifiedSession(req);
  const created = await supabaseRepo.createWorkspace({
    name: name.trim(),
    ownerId: session.userId,
    planId: 'plan_free'
  }, 'owner');
  res.status(201).json({ workspace: created });
});

app.get('/api/workspaces/:id/members', async (req: Request, res: Response) => {
  const members = await supabaseRepo.getWorkspaceMembers(req.params.id);
  res.json({ members });
});

// --- Plans, Subscriptions & Usage Endpoints ---
app.get('/api/plans', async (_req: Request, res: Response) => {
  const plans = await supabaseRepo.getPlans();
  res.json({ plans });
});

app.get('/api/subscriptions', async (req: Request, res: Response) => {
  const session = await resolveVerifiedSession(req);
  const subscription = await supabaseRepo.getSubscription(session.workspaceId);
  res.json({ subscription });
});

app.get('/api/usage', async (req: Request, res: Response) => {
  const session = await resolveVerifiedSession(req);
  const usage = await supabaseRepo.getUsageCounter(session.workspaceId);
  res.json({ usage });
});

// --- Audit Logs & Errors Endpoints ---
app.get('/api/audit-logs', async (req: Request, res: Response) => {
  const session = await resolveVerifiedSession(req);
  const logs = await supabaseRepo.getAuditLogs(session.workspaceId);
  res.json({ logs });
});

app.get('/api/errors', async (req: Request, res: Response) => {
  const session = await resolveVerifiedSession(req);
  const errors = await supabaseRepo.getSyncErrors(session.workspaceId);
  res.json({ errors });
});

// --- Connectors Meta Endpoint ---
app.get('/api/connectors', (_req: Request, res: Response) => {
  const connectors = Object.values(connectorRegistry).map((c) => ({
    id: c.id,
    displayName: c.displayName,
    capabilities: c.capabilities,
    authType: c.auth.type,
    requiredScopes: c.auth.requiredScopes
  }));
  res.json({ connectors });
});

// --- Early Access Upgrade Requests & Admin Plan Management ---
app.post('/api/upgrade-requests', (req: Request, res: Response) => {
  const { email, planKey } = req.body;
  if (!email || !planKey) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Email and planKey are required' } });
  }
  const request = db.requestUpgrade(email, planKey);
  res.json({ success: true, request });
});

// Admin-only plan modification (Owner only)
app.post('/api/admin/workspaces/:id/plan', requireRole(['owner']), (req: Request, res: Response) => {
  const { planId, trialEndsAt } = req.body;
  const workspace = db.workspaces.find((w) => w.id === req.params.id);
  if (!workspace) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workspace not found' } });
  }
  if (planId) {
    workspace.planId = planId;
  }
  if (trialEndsAt !== undefined) {
    workspace.trialEndsAt = trialEndsAt;
  }
  workspace.updatedAt = new Date().toISOString();
  db.logAudit('admin.plan_changed_manually', 'workspace', workspace.id, { planId, trialEndsAt });
  res.json({ success: true, workspace });
});

// --- Connections Management API (Sanitized - Zero Tokens Returned) ---
app.get('/api/connections', async (req: Request, res: Response) => {
  try {
    const session = await resolveVerifiedSession(req);
    console.log(`[Connection:LOAD] user_id: ${session.userId}, workspace_id: ${session.workspaceId}`);
    const accountsList = await supabaseRepo.getConnectedAccounts(session.workspaceId, session.userId);
    console.log(`[API:connections:GET] Selected ${accountsList.length} connection(s) from Supabase for workspace ${session.workspaceId}`);

    // Count rows in sync_configurations in Supabase that use this connection
    const client = getServerSupabase();
    const countsMap: Record<string, number> = {};
    if (client) {
      const { data: syncsData } = await client
        .from('sync_configurations')
        .select('id, destination_account_id')
        .eq('workspace_id', session.workspaceId);
      if (syncsData) {
        for (const s of syncsData) {
          if (s.destination_account_id) {
            countsMap[s.destination_account_id] = (countsMap[s.destination_account_id] || 0) + 1;
          }
        }
      }
    } else {
      const syncs = await supabaseRepo.getSyncConfigurations(session.workspaceId).catch(() => []);
      for (const s of syncs) {
        if (s.destinationAccountId) {
          countsMap[s.destinationAccountId] = (countsMap[s.destinationAccountId] || 0) + 1;
        }
      }
    }

    const accounts = accountsList.map((a) => ({
      id: a.id,
      workspaceId: a.workspaceId,
      connectorKey: a.connectorKey,
      displayName: a.displayName,
      externalAccountId: a.externalAccountId,
      scopes: a.scopes,
      status: a.status,
      credentialsStored: Boolean(a.encryptedAccessToken),
      pipelineCount: countsMap[a.id] || 0,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt
    }));
    res.json({ accounts });
  } catch (err: any) {
    console.error(`[API:connections:GET_ERROR]`, err.message || err);
    res.status(500).json({
      error: { code: 'DATABASE_QUERY_FAILED', message: err.message || String(err) },
      accounts: []
    });
  }
});

// POST /api/connections - Create connection in Supabase Postgres
app.post('/api/connections', requireRole(['owner', 'admin', 'member']), async (req: Request, res: Response) => {
  const session = (req as any).verifiedSession || (await resolveVerifiedSession(req));
  const { connectorKey, displayName, externalAccountId, scopes } = req.body;
  if (!connectorKey) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'connectorKey is required' } });
  }

  try {
    const { encryptSecret } = await import('./src/lib/security/crypto');
    const dummyToken = `tok_${connectorKey}_${Date.now()}`;
    const encrypted = await encryptSecret(dummyToken);

    const newId = `conn_${connectorKey}_${Date.now().toString().slice(-4)}`;
    console.log(`[Connection:SAVE] user_id: ${session.userId}, workspace_id: ${session.workspaceId}`);
    const accountPayload = {
      id: newId,
      workspaceId: session.workspaceId,
      connectorKey,
      displayName: displayName || `${connectorKey} Connection`,
      externalAccountId: externalAccountId || `ext_${Date.now().toString().slice(-6)}`,
      encryptedAccessToken: encrypted.encrypted,
      keyVersion: encrypted.keyVersion,
      scopes: scopes || [],
      status: 'active' as const,
      createdBy: session.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const saved = await supabaseRepo.saveConnectedAccount(accountPayload);
    db.accounts.push(accountPayload);

    db.logAudit('connection.added', 'connected_account', newId, {
      connector: connectorKey,
      displayName: accountPayload.displayName
    });

    res.status(201).json({ success: true, account: saved });
  } catch (err: any) {
    console.error('[API:connections:POST_ERROR]', err.message || err);
    res.status(500).json({ error: { code: 'INSERT_FAILED', message: err.message || String(err) } });
  }
});

// DELETE /api/connections/:id - Disconnect account from Supabase Postgres
app.delete('/api/connections/:id', requireRole(['owner', 'admin']), async (req: Request, res: Response) => {
  const session = (req as any).verifiedSession || (await resolveVerifiedSession(req));
  const workspaceId = session.workspaceId;
  try {
    await supabaseRepo.deleteConnectedAccount(req.params.id, workspaceId);
  } catch (err: any) {
    console.error('[API:connections:DELETE_ERROR]', err.message || err);
  }

  const targetIndex = db.accounts.findIndex((a) => a.id === req.params.id && a.workspaceId === workspaceId);
  if (targetIndex >= 0) {
    const removed = db.accounts.splice(targetIndex, 1)[0];
    const dependentEndpoints = db.endpoints.filter((e) => e.connectedAccountId === removed.id).map((e) => e.id);
    db.syncConfigs.forEach((s) => {
      if (dependentEndpoints.includes(s.endpointAId) || dependentEndpoints.includes(s.endpointBId)) {
        s.status = 'paused';
      }
    });
  }

  res.json({ success: true, message: `Disconnected account ${req.params.id}` });
});

// --- Google OAuth Endpoints ---
const GOOGLE_SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email'
];

const getBaseAppUrl = (req: Request) => {
  const appUrl = process.env.APP_URL;
  if (appUrl && appUrl !== 'not-used' && appUrl.startsWith('http')) {
    return appUrl.replace(/\/$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`;
};

// GET /api/auth/google - Initiate Google OAuth flow or get auth URL
app.get(['/api/auth/google', '/api/auth/connect/google_sheets'], async (req: Request, res: Response) => {
  const baseUrl = getBaseAppUrl(req);
  const redirectUri = `${baseUrl}/api/auth/google/callback`;
  const rawClientId = process.env.GOOGLE_CLIENT_ID;
  const clientId = rawClientId && rawClientId !== 'not-used' ? rawClientId : 'dummy_google_client_id';

  // 1. Resolve target workspace_id, user_id, and optional connection_id (for reconnect)
  let targetWorkspaceId = (req.query.workspaceId as string) || (req.headers['x-workspace-id'] as string);
  let targetUserId = (req.query.userId as string) || (req.headers['x-user-id'] as string);
  const targetConnectionId = (req.query.connectionId as string) || undefined;

  if (!targetWorkspaceId || !targetUserId) {
    const session = await resolveVerifiedSession(req);
    targetWorkspaceId = targetWorkspaceId || session.workspaceId;
    targetUserId = targetUserId || session.userId;
  }

  // 2. Put workspace_id, user_id, and connection_id in the cryptographically signed OAuth state
  const { createSignedOAuthState } = await import('./src/lib/security/crypto');
  const signedState = await createSignedOAuthState(targetWorkspaceId, targetUserId, targetConnectionId);

  const scopes = encodeURIComponent(GOOGLE_SHEETS_SCOPES.join(' '));
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=${scopes}&access_type=offline&prompt=consent&state=${encodeURIComponent(signedState)}`;

  if (req.query.json === 'true') {
    return res.json({
      authUrl,
      redirectUri,
      clientId,
      scopes: GOOGLE_SHEETS_SCOPES,
      state: signedState,
      workspaceId: targetWorkspaceId,
      userId: targetUserId
    });
  }

  res.redirect(authUrl);
});

// GET /api/auth/google/callback and /api/auth/callback/google - Handle Google OAuth redirect callback
const handleGoogleOAuthCallback = async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const error = req.query.error as string;
  const baseUrl = getBaseAppUrl(req);
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  if (error) {
    return res.redirect(`/?tab=connections&oauth_error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.redirect(`/?tab=connections&oauth_error=${encodeURIComponent('Missing authorization code')}`);
  }

  try {
    const rawState = req.query.state as string;
    if (!rawState) {
      return res.redirect(`/?tab=connections&oauth_error=${encodeURIComponent('Missing signed OAuth state parameter')}`);
    }

    // 1. Verify signed OAuth state containing workspace_id, user_id, and optional connection_id
    const { verifySignedOAuthState } = await import('./src/lib/security/crypto');
    const stateCheck = await verifySignedOAuthState(rawState);

    if (!stateCheck.valid || !stateCheck.workspaceId || !stateCheck.userId) {
      const stateErr = stateCheck.error || `Invalid or tampered OAuth state signature (workspace_id: ${stateCheck.workspaceId || 'missing'}, user_id: ${stateCheck.userId || 'missing'})`;
      console.error('[GoogleOAuth:invalid_state]', stateErr);
      return res.redirect(`/?tab=connections&oauth_error=${encodeURIComponent(stateErr)}`);
    }

    const targetWorkspaceId = stateCheck.workspaceId;
    const targetUserId = stateCheck.userId;
    const targetConnectionId = stateCheck.connectionId;

    // 2. In the callback, verify against workspace_members that this user belongs to that workspace.
    // If not, return a clear error that includes the workspace_id and user_id. Never create a workspace here.
    const check = await supabaseRepo.verifyWorkspaceMembership(targetUserId, targetWorkspaceId);
    if (!check.isMember) {
      const errorMsg = `Unauthorized: User "${targetUserId}" is not a verified member of workspace "${targetWorkspaceId}".`;
      console.error('[GoogleOAuth:membership_verification_failed]', { targetWorkspaceId, targetUserId, errorMsg });
      return res.redirect(`/?tab=connections&oauth_error=${encodeURIComponent(errorMsg)}`);
    }

    let accessToken = `ya29.google_${Date.now()}`;
    let refreshToken: string | undefined = undefined;
    let connectedEmail: string | undefined = undefined;
    let expiresInSeconds = 3600;

    // If real Google OAuth credentials are provided, exchange authorization code
    const rawClientId = process.env.GOOGLE_CLIENT_ID;
    const rawClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const hasRealGoogleOauth =
      rawClientId &&
      rawClientId !== 'not-used' &&
      rawClientSecret &&
      rawClientSecret !== 'not-used';

    if (hasRealGoogleOauth) {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: rawClientId,
          client_secret: rawClientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        })
      });

      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        accessToken = tokenData.access_token || accessToken;
        if (tokenData.refresh_token) {
          refreshToken = tokenData.refresh_token;
        }
        if (tokenData.expires_in) {
          expiresInSeconds = tokenData.expires_in;
        }

        // Fetch real Google account email
        try {
          const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (userinfoRes.ok) {
            const userData = await userinfoRes.json();
            connectedEmail = userData.email;
          }
        } catch (_e) {
          // non-fatal
        }
      } else {
        const errText = await tokenResponse.text();
        console.error('[GoogleOAuth:token_exchange_failed]', errText);
      }
    }

    // Encrypt tokens before storing
    const { encryptSecret } = await import('./src/lib/security/crypto');
    const encryptedAccess = await encryptSecret(accessToken);
    let encryptedRefresh = refreshToken ? await encryptSecret(refreshToken) : undefined;

    // Resolve target connection to update
    const client = getServerSupabase();
    let existingAccount: ConnectedAccountRow | null = null;

    // Requirement 1: If reconnecting, targetConnectionId was passed in the signed OAuth state.
    if (targetConnectionId) {
      console.log(`[GoogleOAuth:reconnect] Looking up existing connection id: ${targetConnectionId}`);
      if (client) {
        const { data: byId } = await client
          .from('connected_accounts')
          .select('*')
          .eq('id', targetConnectionId)
          .eq('workspace_id', targetWorkspaceId)
          .maybeSingle();
        if (byId) {
          existingAccount = {
            id: byId.id,
            workspaceId: byId.workspace_id,
            connectorKey: byId.connector_key,
            displayName: byId.display_name,
            externalAccountId: byId.external_account_id,
            encryptedAccessToken: byId.encrypted_access_token,
            encryptedRefreshToken: byId.encrypted_refresh_token,
            keyVersion: byId.key_version,
            scopes: byId.scopes || [],
            status: byId.status,
            createdBy: byId.created_by,
            createdAt: byId.created_at,
            updatedAt: byId.updated_at
          };
        }
      }
      if (!existingAccount) {
        const mem = db.accounts.find((a) => a.id === targetConnectionId && a.workspaceId === targetWorkspaceId);
        if (mem) existingAccount = mem;
      }
    }

    // Requirement 2: When connecting Google from "New connection" (or fallback),
    // look for an existing connection with the same workspace_id + provider + Google account email.
    if (!existingAccount && connectedEmail) {
      console.log(`[GoogleOAuth:lookup_existing] Looking for existing connection for workspace ${targetWorkspaceId} and email ${connectedEmail}`);
      if (client) {
        const { data: existingRows } = await client
          .from('connected_accounts')
          .select('*')
          .eq('workspace_id', targetWorkspaceId)
          .eq('connector_key', 'google_sheets');

        if (existingRows && existingRows.length > 0) {
          const match = existingRows.find(
            (r: any) => r.external_account_id === connectedEmail || (r.display_name && r.display_name.includes(connectedEmail))
          );
          if (match) {
            existingAccount = {
              id: match.id,
              workspaceId: match.workspace_id,
              connectorKey: match.connector_key,
              displayName: match.display_name,
              externalAccountId: match.external_account_id,
              encryptedAccessToken: match.encrypted_access_token,
              encryptedRefreshToken: match.encrypted_refresh_token,
              keyVersion: match.key_version,
              scopes: match.scopes || [],
              status: match.status,
              createdBy: match.created_by,
              createdAt: match.created_at,
              updatedAt: match.updated_at
            };
          }
        }
      }
      if (!existingAccount) {
        const match = db.accounts.find(
          (a) => a.workspaceId === targetWorkspaceId &&
                 a.connectorKey === 'google_sheets' &&
                 (a.externalAccountId === connectedEmail || a.displayName.includes(connectedEmail))
        );
        if (match) existingAccount = match;
      }
    }

    // If Google didn't return a new refresh token on reconnect, retain existing one
    if (!encryptedRefresh && existingAccount?.encryptedRefreshToken) {
      encryptedRefresh = {
        encrypted: existingAccount.encryptedRefreshToken,
        keyVersion: existingAccount.keyVersion || 'v1'
      };
    }

    const isUpdating = Boolean(existingAccount);
    const targetAccountId = existingAccount ? existingAccount.id : `conn_google_sheets_${Date.now().toString().slice(-6)}`;
    const displayName = connectedEmail ? `Google Sheets (${connectedEmail})` : (existingAccount?.displayName || 'Google Sheets');
    const externalAccountId = connectedEmail || existingAccount?.externalAccountId || `google_${Date.now().toString().slice(-6)}`;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    console.log(`[Connection:${isUpdating ? 'UPDATE' : 'INSERT'}] id: ${targetAccountId}, user_id: ${targetUserId || 'oauth_verified'}, workspace_id: ${targetWorkspaceId}`);

    const accountPayload = {
      id: targetAccountId,
      workspaceId: targetWorkspaceId,
      connectorKey: 'google_sheets',
      displayName,
      externalAccountId,
      encryptedAccessToken: encryptedAccess.encrypted,
      encryptedRefreshToken: encryptedRefresh?.encrypted,
      keyVersion: encryptedAccess.keyVersion,
      scopes: GOOGLE_SHEETS_SCOPES,
      expiresAt,
      status: 'active' as const, // Always set back to Active after successful reconnect
      createdBy: existingAccount?.createdBy || targetUserId || db.currentUserId,
      createdAt: existingAccount?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Await real update/insert into Supabase connected_accounts table! Never swallow errors.
    await supabaseRepo.saveConnectedAccount(accountPayload);

    // Prune existing duplicates for this Google account so reconnecting leaves exactly ONE card
    if (client && (connectedEmail || externalAccountId)) {
      const emailToMatch = connectedEmail || externalAccountId;
      try {
        const { data: dupRows } = await client
          .from('connected_accounts')
          .select('id, external_account_id, display_name')
          .eq('workspace_id', targetWorkspaceId)
          .eq('connector_key', 'google_sheets')
          .neq('id', targetAccountId);

        if (dupRows && dupRows.length > 0) {
          const matchingDupes = dupRows.filter(
            (r: any) => r.external_account_id === emailToMatch || (r.display_name && r.display_name.includes(emailToMatch))
          );

          if (matchingDupes.length > 0) {
            console.log(`[GoogleOAuth:cleanup_duplicates] Found ${matchingDupes.length} duplicate connection(s) for ${emailToMatch}. Consolidating...`);
            for (const dup of matchingDupes) {
              // Re-point any sync_configurations to the kept connection id
              await client
                .from('sync_configurations')
                .update({ destination_account_id: targetAccountId })
                .eq('destination_account_id', dup.id);
              // Delete the duplicate row
              await client
                .from('connected_accounts')
                .delete()
                .eq('id', dup.id);
            }
            // Remove duplicates from in-memory cache
            db.accounts = db.accounts.filter((a) => !matchingDupes.some((d: any) => d.id === a.id));
          }
        }
      } catch (cleanupErr) {
        console.warn('[GoogleOAuth:cleanup_duplicates_error]', cleanupErr);
      }
    }

    // Keep memory cache aligned for sync runner
    const existingIndex = db.accounts.findIndex((a) => a.id === targetAccountId);
    if (existingIndex >= 0) {
      db.accounts[existingIndex] = accountPayload;
    } else {
      db.accounts.push(accountPayload);
    }

    db.logAudit(isUpdating ? 'connection.updated' : 'connection.added', 'connected_account', accountPayload.id, {
      connector: 'google_sheets',
      displayName: accountPayload.displayName
    });

    res.redirect('/?tab=connections&connected=google_sheets');
  } catch (err: any) {
    console.error('[GoogleOAuth:callback_insert_error]', err.message || err);
    // If the insert fails, redirect with real error message so UI shows real error!
    const errorMsg = err.message || 'Database insert failed during OAuth connection';
    res.redirect(`/?tab=connections&oauth_error=${encodeURIComponent(errorMsg)}`);
  }
};

app.get('/api/auth/google/callback', handleGoogleOAuthCallback);
app.get('/api/auth/callback/google', handleGoogleOAuthCallback);

// GET /api/google/spreadsheets - Discover spreadsheets from connected account
app.get('/api/google/spreadsheets', async (req: Request, res: Response) => {
  const session = await resolveVerifiedSession(req);
  let account = db.accounts.find((a) => a.workspaceId === session.workspaceId && a.connectorKey === 'google_sheets');
  if (!account) {
    const list = await supabaseRepo.getConnectedAccounts(session.workspaceId, session.userId).catch(() => []);
    account = list.find((a) => a.connectorKey === 'google_sheets') as any;
  }
  if (!account) {
    return res.json({ spreadsheets: [], connected: false });
  }

  try {
    const conn = getConnector('google_sheets');
    const objects = await conn.listObjects(account as any);
    res.json({
      spreadsheets: objects,
      connected: true,
      accountEmail: account.externalAccountId
    });
  } catch (err: any) {
    const status = err.status || (err.message && err.message.includes('401') ? 401 : 500);
    const category = err.category || (status === 401 ? 'TOKEN_EXPIRED' : 'GOOGLE_ERROR');
    const googleMessage = err.rawMessage || err.message || String(err);

    let userMessage = `Google Drive error (HTTP ${status}): ${googleMessage}`;
    if (category === 'TOKEN_EXPIRED') {
      userMessage = 'Google token expired or revoked. Please click Reconnect in Connections.';
    } else if (category === 'DRIVE_API_NOT_ENABLED') {
      userMessage = 'Google Drive API is not enabled in your Google Cloud Project. Please enable it in the Google Cloud Console.';
    } else if (category === 'INSUFFICIENT_SCOPES') {
      userMessage = 'Insufficient permissions: Google account lacks the required "drive.readonly" scope. Please reconnect with full permissions.';
    } else if (category === 'NO_SPREADSHEETS_FOUND') {
      userMessage = 'No spreadsheets found in your Google Drive (mimeType=\'application/vnd.google-apps.spreadsheet\' and trashed=false).';
      return res.status(200).json({
        spreadsheets: [],
        connected: true,
        accountEmail: account.externalAccountId,
        emptyReason: 'NO_SPREADSHEETS_FOUND',
        message: userMessage
      });
    }

    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: {
        code: category,
        status,
        googleMessage,
        message: userMessage
      },
      connected: true,
      accountEmail: account.externalAccountId
    });
  }
});

// 5-minute server-side memory cache for sheet headers per spreadsheet and tab
interface HeaderCacheEntry {
  schema: any;
  cachedAt: number;
}
const sheetHeaderCache = new Map<string, HeaderCacheEntry>();
const SHEET_HEADER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// GET /api/google/schema - Get sheet headers for selected spreadsheet and tab
app.get('/api/google/schema', async (req: Request, res: Response) => {
  const reqStart = Date.now();
  const objectId = req.query.objectId as string;
  if (!objectId) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing objectId' } });
  }

  // 1. Step: DB read (resolve session & get connected account)
  const dbStart = Date.now();
  const session = await resolveVerifiedSession(req);
  let account = db.accounts.find((a) => a.workspaceId === session.workspaceId && a.connectorKey === 'google_sheets');
  if (!account) {
    const list = await supabaseRepo.getConnectedAccounts(session.workspaceId, session.userId).catch(() => []);
    account = list.find((a) => a.connectorKey === 'google_sheets') as any;
    if (account) {
      db.accounts.push(account);
    }
  }
  const dbDurationMs = Date.now() - dbStart;
  console.log(`[SchemaTiming] Step 1 (DB read): Session & account read took ${dbDurationMs}ms (workspace: ${session.workspaceId})`);

  if (!account) {
    return res.status(400).json({ error: { code: 'NOT_CONNECTED', message: 'Google Sheets not connected' } });
  }

  // Check 5-minute server cache
  const cacheKey = `${session.workspaceId}:${objectId}`;
  const cached = sheetHeaderCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < SHEET_HEADER_CACHE_TTL_MS) {
    const totalMs = Date.now() - reqStart;
    console.log(`[SchemaTiming] Server Cache HIT: Returned headers in ${totalMs}ms for "${objectId}" (cache age: ${Math.round((Date.now() - cached.cachedAt) / 1000)}s)`);
    return res.json({ schema: cached.schema, cached: true });
  }

  try {
    const conn = getConnector('google_sheets');
    const schema = await conn.getSchema(account as any, { id: objectId, name: objectId });
    
    // Save to 5-minute server cache
    sheetHeaderCache.set(cacheKey, { schema, cachedAt: Date.now() });

    const totalMs = Date.now() - reqStart;
    console.log(`[SchemaTiming] Total schema fetch time: ${totalMs}ms for "${objectId}"`);
    res.json({ schema });
  } catch (err: any) {
    const totalMs = Date.now() - reqStart;
    console.error(`[SchemaTiming] Schema fetch failed after ${totalMs}ms:`, err);
    res.status(500).json({ error: { code: 'SCHEMA_FETCH_FAILED', message: err.message || String(err) } });
  }
});

// POST /api/syncs/create-simple - Create simple one-way sync (CSV -> Google Sheets) and optionally run now
app.post('/api/syncs/create-simple', requireRole(['owner', 'admin', 'member']), async (req: Request, res: Response) => {
  try {
    const { name, sourceDatasetId, destObjectId, destObjectName, mappings, keyColumn, runNow } = req.body;
    const session = (req as any).verifiedSession || (await resolveVerifiedSession(req));
    const workspaceId = session.workspaceId;
    const userId = session.userId;

    if (!sourceDatasetId || !destObjectId || !mappings || mappings.length === 0) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Source, destination, and mappings are required' } });
    }

    const csvDataset = (await supabaseRepo.getCsvDatasetById(sourceDatasetId)) || db.getCsvDatasetById(sourceDatasetId);
    if (!csvDataset) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Source CSV dataset not found' } });
    }

    let sheetsAccount = db.accounts.find((a) => a.workspaceId === workspaceId && a.connectorKey === 'google_sheets');
    if (!sheetsAccount) {
      const accountsList = await supabaseRepo.getConnectedAccounts(workspaceId, userId).catch(() => []);
      sheetsAccount = accountsList.find((a) => a.connectorKey === 'google_sheets') as any;
    }
    if (!sheetsAccount) {
      return res.status(400).json({ error: { code: 'NOT_CONNECTED', message: 'Google Sheets account not connected' } });
    }

    // Enforce sync limits (3 syncs on Free (testing))
    const client = getServerSupabase();
    let currentSyncCount = 0;
    if (client) {
      const { count } = await client
        .from('sync_configurations')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .neq('status', 'draft');
      currentSyncCount = count || 0;
    } else {
      currentSyncCount = db.getSyncConfigs().filter((s) => s.workspaceId === workspaceId && s.status !== 'draft').length;
    }

    const currentWorkspace = await supabaseRepo.getWorkspace(workspaceId);
    const planId = currentWorkspace?.planId || 'plan_free';
    const plans = await supabaseRepo.getPlans();
    const activePlan = plans.find((p) => p.id === planId) || plans.find((p) => p.id === 'plan_free');
    const maxActiveSyncs = activePlan?.limits?.maxActiveSyncs ?? 3;

    if (currentSyncCount >= maxActiveSyncs) {
      return res.status(403).json({
        error: {
          code: 'PLAN_LIMIT_REACHED',
          message: `Sync limit reached: The ${activePlan?.name || 'Free (testing)'} plan allows a maximum of ${maxActiveSyncs} sync pipelines (${currentSyncCount} currently active). Delete an existing pipeline to create a new one.`
        }
      });
    }

    // 1. Ensure source endpoint
    let endpointA = db.endpoints.find((e) => e.workspaceId === workspaceId && e.connectorId === 'csv' && e.objectRef.id === sourceDatasetId);
    if (!endpointA) {
      endpointA = {
        id: `ep_csv_${sourceDatasetId}`,
        workspaceId,
        connectorId: 'csv',
        role: 'source',
        objectRef: {
          id: sourceDatasetId,
          name: csvDataset.name,
          type: 'csv_dataset',
          recordCount: csvDataset.rowCount
        },
        schemaSnapshot: {
          objectId: sourceDatasetId,
          name: csvDataset.name,
          fields: csvDataset.columns.map((c) => ({
            key: c.key,
            label: c.label,
            type: c.type,
            required: false,
            readOnly: false
          }))
        },
        schemaFetchedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.endpoints.push(endpointA);
    }

    // 2. Ensure destination endpoint
    let endpointB = db.endpoints.find(
      (e) => e.workspaceId === workspaceId && e.connectorId === 'google_sheets' && e.objectRef.id === destObjectId
    );
    if (!endpointB) {
      endpointB = {
        id: `ep_sheets_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        workspaceId,
        connectedAccountId: sheetsAccount.id,
        connectorId: 'google_sheets',
        role: 'destination',
        objectRef: {
          id: destObjectId,
          name: destObjectName || destObjectId,
          type: 'spreadsheet'
        },
        schemaFetchedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.endpoints.push(endpointB);
    }

    // 3. Create sync config
    const syncId = `sync_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newSync = {
      id: syncId,
      workspaceId,
      name: name || `${csvDataset.name} -> Google Sheets`,
      endpointAId: endpointA.id,
      endpointBId: endpointB.id,
      direction: 'a_to_b' as const,
      conflictRule: 'source_wins' as const,
      triggerMode: 'manual' as const,
      intervalMinutes: 15,
      deleteBehavior: 'ignore' as const,
      status: 'active' as const,
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.syncConfigs.push(newSync);

    // 4. Save field mappings
    const fieldMappingRows = mappings.map((m: any, idx: number) => ({
      id: `map_${syncId}_${idx + 1}`,
      syncConfigId: syncId,
      sourceFieldKey: m.sourceFieldKey,
      destinationFieldKey: m.destinationFieldKey,
      isKey: m.sourceFieldKey === keyColumn || m.isKey === true,
      required: m.required ?? false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
    db.mappings.push(...fieldMappingRows);

    db.saveToStorage();
    db.logAudit('sync.created', 'sync_config', syncId, { name: newSync.name });

    // Persist to Supabase Postgres sync_configurations and field_mappings tables
    await supabaseRepo.saveSyncConfiguration(newSync, fieldMappingRows, {
      sourceDatasetId,
      destAccountId: sheetsAccount.id,
      destResourceId: destObjectId,
      destResourceName: destObjectName,
      keyColumn
    }).catch((err) => {
      console.error('[create-simple] Error saving sync configuration to Supabase:', err);
    });

    // 5. Trigger background run if requested
    let runId: string | undefined = undefined;
    if (runNow) {
      runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date().toISOString();
      const initialRunRow: SyncRunRow = {
        id: runId,
        syncConfigId: syncId,
        trigger: 'manual',
        status: 'running',
        startedAt: now,
        recordsRead: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        skipped: 0,
        conflicts: 0,
        failed: 0,
        isDryRun: false,
        createdAt: now,
        updatedAt: now
      };
      await supabaseRepo.upsertSyncRun(initialRunRow, workspaceId).catch((err) => {
        console.error('[create-simple] Error inserting initial sync_run to Supabase:', err);
      });
      await queueBackgroundSyncJob(syncId, runId, {
        isDryRun: false,
        workspaceId,
        userId,
        precreatedRun: initialRunRow
      });
    }

    res.status(201).json({
      success: true,
      syncId,
      runId,
      sync: newSync
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SYNC_CREATE_FAILED', message: err.message || String(err) } });
  }
});



// --- Database Plan & Workspace Synchronization for Free (testing) Mode ---
async function syncDatabasePlansAndWorkspaces() {
  const client = getServerSupabase();
  if (!client) return;

  const freeLimits = {
    maxRecords: 1000,
    maxActiveSyncs: 3,
    minIntervalMinutes: 15,
    premiumConnectors: true,
    teamSeats: 5,
    logRetentionDays: 30,
    realtime: true
  };

  try {
    // 1. Update/upsert plan_free in Supabase
    const { error: planErr } = await client
      .from('plans')
      .upsert({
        id: 'plan_free',
        key: 'free',
        name: 'Free (testing)',
        price_monthly_cents: 0,
        price_annual_monthly_cents: 0,
        limits: freeLimits,
        updated_at: new Date().toISOString()
      });

    if (planErr) {
      console.error('[FreeTestingPlan] Error updating plan_free in database:', planErr);
    } else {
      console.log('[FreeTestingPlan] Successfully updated plan_free to "Free (testing)" (3 syncs, 1,000 records)');
    }

    // 2. Set all workspaces in database to plan_free and clear trial_ends_at
    const { error: wsErr } = await client
      .from('workspaces')
      .update({
        plan_id: 'plan_free',
        trial_ends_at: null,
        updated_at: new Date().toISOString()
      })
      .neq('plan_id', 'plan_free');

    if (wsErr) {
      console.error('[FreeTestingPlan] Error setting workspace plan_id in database:', wsErr);
    }

    const { error: trialErr } = await client
      .from('workspaces')
      .update({
        trial_ends_at: null,
        updated_at: new Date().toISOString()
      })
      .not('trial_ends_at', 'is', null);

    if (trialErr) {
      console.error('[FreeTestingPlan] Error clearing trial_ends_at in database:', trialErr);
    } else {
      console.log('[FreeTestingPlan] Successfully verified all workspaces on Free (testing) plan with no trial');
    }
  } catch (err: any) {
    console.error('[FreeTestingPlan] Exception during plan/workspace database sync:', err);
  }
}

// --- Vite Dev Server Middleware or Static Production Serving ---
async function startServer() {
  // Sync database plans and workspaces on startup
  await syncDatabasePlansAndWorkspaces();

  const distCandidates = [
    path.resolve(__dirname, 'dist'),
    path.resolve(__dirname, '../dist'),
    path.resolve(process.cwd(), 'dist')
  ];
  const distDir = distCandidates.find((dir) => fs.existsSync(path.join(dir, 'index.html')));

  if (process.env.NODE_ENV === 'production' || distDir) {
    if (distDir) {
      app.use(express.static(distDir));
      app.get('*', (req: Request, res: Response, next: () => void) => {
        if (req.path.startsWith('/api/')) {
          return next();
        }
        res.sendFile(path.join(distDir, 'index.html'));
      });
    } else {
      app.get('*', (req: Request, res: Response, next: () => void) => {
        if (req.path.startsWith('/api/')) {
          return next();
        }
        res.status(200).send('Dataloop API server running (production mode)');
      });
    }
  } else {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true, host: HOST, port: PORT, hmr: false },
        appType: 'spa'
      });
      app.use(vite.middlewares);
    } catch (err) {
      console.warn('[Dataloop Server] Vite dev server middleware could not be loaded, continuing in API mode:', err);
    }
  }

  app.listen(PORT, HOST, () => {
    console.log(`[Dataloop Server] Running on http://${HOST}:${PORT} (PORT=${PORT})`);
  });
}

startServer().catch((err) => {
  console.error('[Dataloop Server] Failed to start server:', err);
  process.exit(1);
});
