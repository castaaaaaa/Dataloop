/**
 * Database Store & Tenant Isolation Manager
 * Provides reactive data store with Row-Level Security style tenant scoping and role-based access checks.
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
  ApiKeyRow,
  AuditLogRow,
  UpgradeRequestRow,
  WorkspaceInviteRow,
  CsvDatasetRow
} from './schema';
import { SEED_PLANS } from './seed';
import { executeSyncRun, SyncEngineResult } from '../sync-engine/engine';
import { getConnector } from '../connectors/registry';
import { PlanLimits } from '../sync-engine/types';
import { BILLING_ENABLED } from '../billing/config';

export const DEFAULT_USER: UserRow = {
  id: 'usr_owner_01',
  email: 'owner@dataloop.io',
  name: 'Workspace Owner',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z'
};

export const DEFAULT_WORKSPACE: WorkspaceRow = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Default Workspace',
  slug: 'default-workspace',
  ownerId: 'usr_owner_01',
  planId: 'plan_free',
  trialEndsAt: undefined,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export const DEFAULT_MEMBER: WorkspaceMemberRow = {
  id: '00000000-0000-4000-8000-000000000002',
  workspaceId: '00000000-0000-4000-8000-000000000001',
  userId: 'usr_owner_01',
  role: 'owner',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export class AppDbStore {
  plans: PlanRow[] = [...SEED_PLANS];
  users: UserRow[] = [DEFAULT_USER];
  workspaces: WorkspaceRow[] = [];
  members: WorkspaceMemberRow[] = [];
  accounts: ConnectedAccountRow[] = [];
  endpoints: DataEndpointRow[] = [];
  syncConfigs: SyncConfigRow[] = [];
  mappings: FieldMappingRow[] = [];
  recordLinks: RecordLinkRow[] = [];
  conflicts: ConflictRow[] = [];
  runs: SyncRunRow[] = [];
  events: SyncEventRow[] = [];
  errors: SyncErrorRow[] = [];
  deadLetters: DeadLetterRow[] = [];
  apiKeys: ApiKeyRow[] = [];
  auditLogs: AuditLogRow[] = [];
  upgradeRequests: UpgradeRequestRow[] = [];
  invitations: WorkspaceInviteRow[] = [];
  csvDatasets: CsvDatasetRow[] = [];

  // Current session context
  currentUserId: string = 'usr_owner_01';
  currentWorkspaceId: string = '';

  constructor() {
    this.loadFromStorage();
  }

  saveToStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const payload = {
          currentWorkspaceId: this.currentWorkspaceId,
          workspaces: this.workspaces,
          users: this.users,
          members: this.members,
          invitations: this.invitations,
          accounts: this.accounts,
          endpoints: this.endpoints,
          syncConfigs: this.syncConfigs,
          mappings: this.mappings,
          recordLinks: this.recordLinks,
          conflicts: this.conflicts,
          runs: this.runs,
          events: this.events,
          errors: this.errors,
          deadLetters: this.deadLetters,
          apiKeys: this.apiKeys,
          auditLogs: this.auditLogs,
          upgradeRequests: this.upgradeRequests,
          csvDatasets: this.csvDatasets
        };
        window.localStorage.setItem('dataloop_db_state_v2', JSON.stringify(payload));
      } catch (_e) {
        // ignore quota error
      }
    }
  }

  private loadFromStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        // Clear any old mock state cached from earlier development sessions
        if (window.localStorage.getItem('dataloop_db_state_v1')) {
          window.localStorage.removeItem('dataloop_db_state_v1');
        }

        // Clean up any stale Alex Rivera mock session
        const authRaw = window.localStorage.getItem('dataloop_auth_session_v1');
        if (authRaw && authRaw.includes('usr_google_rivera')) {
          window.localStorage.removeItem('dataloop_auth_session_v1');
        }

        const raw = window.localStorage.getItem('dataloop_db_state_v2');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.workspaces && parsed.workspaces.length > 0) {
            this.workspaces = parsed.workspaces.filter((w: any) => w.id !== 'ws_default');
          }
          // Note: Active workspace is strictly loaded from database (workspace_members), NEVER from localStorage
          if (parsed.users && parsed.users.length > 0) {
            this.users = parsed.users.filter((u: any) => u.id !== 'usr_google_rivera');
          }
          if (parsed.members && parsed.members.length > 0) {
            this.members = parsed.members.filter((m: any) => m.userId !== 'usr_google_rivera' && m.workspaceId !== 'ws_default');
          }
          if (parsed.invitations) this.invitations = parsed.invitations;
          if (parsed.accounts) this.accounts = parsed.accounts;
          if (parsed.endpoints) this.endpoints = parsed.endpoints;
          if (parsed.syncConfigs) this.syncConfigs = parsed.syncConfigs;
          if (parsed.mappings) this.mappings = parsed.mappings;
          if (parsed.recordLinks) this.recordLinks = parsed.recordLinks;
          if (parsed.conflicts) this.conflicts = parsed.conflicts;
          if (parsed.runs) this.runs = parsed.runs;
          if (parsed.events) this.events = parsed.events;
          if (parsed.errors) this.errors = parsed.errors;
          if (parsed.deadLetters) this.deadLetters = parsed.deadLetters;
          if (parsed.apiKeys) this.apiKeys = parsed.apiKeys;
          if (parsed.auditLogs) this.auditLogs = parsed.auditLogs;
          if (parsed.upgradeRequests) this.upgradeRequests = parsed.upgradeRequests;
          if (parsed.csvDatasets) this.csvDatasets = parsed.csvDatasets;
        }
      } catch (_e) {
        // fallback to memory
      }
    }
  }

  provisionUserWithWorkspace(user: UserRow): WorkspaceRow {
    // Add user if not present
    let existingUser = this.users.find((u) => u.id === user.id);
    if (!existingUser) {
      this.users.push(user);
    } else {
      Object.assign(existingUser, user);
    }

    // Check if user already owns or belongs to a workspace
    const existingWorkspaces = this.getUserWorkspaces(user.id);
    if (existingWorkspaces.length > 0) {
      this.currentUserId = user.id;
      this.currentWorkspaceId = existingWorkspaces[0].id;
      this.saveToStorage();
      return existingWorkspaces[0];
    }

    // Create a new empty workspace owned by the user on Free (testing) plan
    const now = new Date().toISOString();
    const wsId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000001';
    const userWorkspace: WorkspaceRow = {
      id: wsId,
      name: `${user.name}'s Workspace`,
      slug: `workspace-${user.id.substring(0, 8)}`,
      ownerId: user.id,
      planId: 'plan_free',
      trialEndsAt: undefined,
      createdAt: now,
      updatedAt: now
    };

    this.workspaces.push(userWorkspace);
    this.members.push({
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000002',
      workspaceId: wsId,
      userId: user.id,
      role: 'owner',
      createdAt: now,
      updatedAt: now
    });

    this.currentUserId = user.id;
    this.currentWorkspaceId = wsId;
    this.logAudit('workspace.created', 'workspace', wsId, { ownerId: user.id });
    this.saveToStorage();
    return userWorkspace;
  }

  setCurrentUser(userId: string): void {
    this.currentUserId = userId;
    const workspaces = this.getUserWorkspaces(userId);
    if (workspaces.length > 0) {
      // Keep current if user belongs to it, otherwise default to first
      const belongsToCurrent = workspaces.some((w) => w.id === this.currentWorkspaceId);
      if (!belongsToCurrent) {
        this.currentWorkspaceId = workspaces[0].id;
      }
    } else {
      // Auto-provision if user has none
      const user = this.users.find((u) => u.id === userId);
      if (user) {
        this.provisionUserWithWorkspace(user);
      }
    }
    this.saveToStorage();
  }

  updateUserTheme(theme: 'light' | 'dark' | 'system', userId: string = this.currentUserId): void {
    const user = this.users.find((u) => u.id === userId);
    if (user) {
      user.themePreference = theme;
      user.updatedAt = new Date().toISOString();
      this.saveToStorage();
    }
  }

  createWorkspace(name: string): WorkspaceRow {
    this.assertCanAdmin('create workspace');
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000003';
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const now = new Date().toISOString();
    const newWs: WorkspaceRow = {
      id,
      name,
      slug,
      ownerId: this.currentUserId,
      planId: 'plan_free',
      trialEndsAt: undefined,
      createdAt: now,
      updatedAt: now
    };
    this.workspaces.push(newWs);
    this.members.push({
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000004',
      workspaceId: id,
      userId: this.currentUserId,
      role: 'owner',
      createdAt: now,
      updatedAt: now
    });
    this.currentWorkspaceId = id;
    this.logAudit('workspace.created', 'workspace', id, { name });
    this.saveToStorage();
    return newWs;
  }

  // --- Teammate Invitations ---
  inviteTeammate(email: string, role: 'admin' | 'member'): WorkspaceInviteRow {
    this.assertCanAdmin('invite teammate');
    const cleanEmail = email.trim().toLowerCase();
    const now = new Date().toISOString();

    const invite: WorkspaceInviteRow = {
      id: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      workspaceId: this.currentWorkspaceId,
      email: cleanEmail,
      role,
      invitedBy: this.currentUserId,
      status: 'pending',
      createdAt: now,
      updatedAt: now
    };

    this.invitations.unshift(invite);
    this.logAudit('team.member_invited', 'workspace_invitation', invite.id, { email: cleanEmail, role });
    this.saveToStorage();
    return invite;
  }

  getWorkspaceInvitations(workspaceId: string = this.currentWorkspaceId): WorkspaceInviteRow[] {
    return this.invitations.filter((i) => i.workspaceId === workspaceId && i.status === 'pending');
  }

  revokeInvitation(inviteId: string): void {
    this.assertCanAdmin('revoke invitation');
    const inv = this.invitations.find((i) => i.id === inviteId);
    if (inv) {
      inv.status = 'revoked';
      inv.updatedAt = new Date().toISOString();
      this.logAudit('team.invitation_revoked', 'workspace_invitation', inviteId);
      this.saveToStorage();
    }
  }

  // --- Tenant Isolation & Role Checks ---
  getUserWorkspaces(userId: string): WorkspaceRow[] {
    const wsIds = this.members.filter((m) => m.userId === userId).map((m) => m.workspaceId);
    return this.workspaces.filter((w) => wsIds.includes(w.id) && !w.deletedAt);
  }

  getCurrentWorkspace(): WorkspaceRow {
    const ws = this.workspaces.find((w) => w.id === this.currentWorkspaceId);
    if (ws) return ws;
    const userWorkspaces = this.getUserWorkspaces(this.currentUserId);
    if (userWorkspaces.length > 0) {
      this.currentWorkspaceId = userWorkspaces[0].id;
      return userWorkspaces[0];
    }
    if (this.workspaces.length > 0) {
      this.currentWorkspaceId = this.workspaces[0].id;
      return this.workspaces[0];
    }
    const fallbackId = this.currentWorkspaceId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000000');
    const fallbackWs: WorkspaceRow = {
      id: fallbackId,
      name: 'Workspace',
      slug: 'workspace',
      ownerId: this.currentUserId,
      planId: 'plan_free',
      trialEndsAt: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.workspaces.push(fallbackWs);
    this.currentWorkspaceId = fallbackId;
    return fallbackWs;
  }

  getCurrentRole(): 'owner' | 'admin' | 'member' {
    const m = this.members.find(
      (m) => m.workspaceId === this.currentWorkspaceId && m.userId === this.currentUserId
    );
    return m ? m.role : 'owner';
  }

  canWrite(): boolean {
    const role = this.getCurrentRole();
    return role === 'owner' || role === 'admin';
  }

  canAdmin(): boolean {
    const role = this.getCurrentRole();
    return role === 'owner' || role === 'admin';
  }

  isOwner(): boolean {
    return this.getCurrentRole() === 'owner';
  }

  assertCanWrite(actionDesc: string): void {
    if (!this.canWrite()) {
      throw new Error(`Permission denied: you must be an Admin or Owner to ${actionDesc}.`);
    }
  }

  assertCanAdmin(actionDesc: string): void {
    if (!this.canAdmin()) {
      throw new Error(`Permission denied: you must be an Admin or Owner to ${actionDesc}.`);
    }
  }

  assertIsOwner(actionDesc: string): void {
    if (!this.isOwner()) {
      throw new Error(`Permission denied: only the Workspace Owner can ${actionDesc}.`);
    }
  }

  getCurrentPlan(): PlanRow {
    const ws = this.getCurrentWorkspace();
    const freePlan = this.plans.find((p) => p.id === 'plan_free') || this.plans[0];
    if (!ws) return freePlan;

    if (!BILLING_ENABLED) {
      const plan = this.plans.find((p) => p.id === ws.planId);
      return plan || freePlan;
    }

    const now = Date.now();
    const trialEnded = ws.trialEndsAt ? new Date(ws.trialEndsAt).getTime() < now : false;

    // If workspace is on the 14-day Pro trial and trial has ended, drop to Free plan
    if (ws.planId === 'plan_pro' && trialEnded) {
      if (freePlan) return freePlan;
    }

    const plan = this.plans.find((p) => p.id === ws.planId);
    return plan || this.plans[0];
  }

  isTrialActive(ws: WorkspaceRow = this.getCurrentWorkspace()): boolean {
    if (!BILLING_ENABLED || !ws.trialEndsAt) return false;
    return new Date(ws.trialEndsAt).getTime() > Date.now();
  }

  getTrialDaysRemaining(ws: WorkspaceRow = this.getCurrentWorkspace()): number {
    if (!BILLING_ENABLED || !ws.trialEndsAt) return 0;
    const diffMs = new Date(ws.trialEndsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }

  requestUpgrade(email: string, planKey: string): UpgradeRequestRow {
    const req: UpgradeRequestRow = {
      id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      workspaceId: this.currentWorkspaceId,
      email: email.trim(),
      requestedPlanKey: planKey,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    this.upgradeRequests.unshift(req);
    this.logAudit('upgrade.requested', 'upgrade_request', req.id, { email, planKey });
    this.saveToStorage();
    return req;
  }

  getUpgradeRequests(): UpgradeRequestRow[] {
    return this.upgradeRequests;
  }

  adminSetWorkspacePlan(workspaceId: string, planId: string, trialEndsAt?: string): void {
    const ws = this.workspaces.find((w) => w.id === workspaceId);
    if (!ws) throw new Error(`Workspace ${workspaceId} not found`);
    const plan = this.plans.find((p) => p.id === planId);
    if (!plan) throw new Error(`Plan ${planId} not found`);

    const prevPlan = ws.planId;
    ws.planId = planId;
    if (trialEndsAt !== undefined) {
      ws.trialEndsAt = trialEndsAt;
    }
    ws.updatedAt = new Date().toISOString();

    this.logAudit('admin.plan_changed', 'workspace', ws.id, {
      fromPlan: prevPlan,
      toPlan: planId,
      trialEndsAt: ws.trialEndsAt
    });
    this.saveToStorage();
  }

  getLimits(): PlanLimits {
    return this.getCurrentPlan().limits;
  }

  // --- Audit Logging ---
  logAudit(action: string, targetType: string, targetId?: string, metadata?: any): void {
    const user = this.users.find((u) => u.id === this.currentUserId);
    const entry: AuditLogRow = {
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      workspaceId: this.currentWorkspaceId,
      actorUserId: this.currentUserId,
      actorEmail: user ? user.email : 'system@dataloop.io',
      action,
      targetType,
      targetId,
      metadata,
      ip: '198.51.100.14',
      createdAt: new Date().toISOString()
    };
    this.auditLogs.unshift(entry);
    this.saveToStorage();
  }

  // --- Data Accessors (Tenant-Scoped) ---
  getConnectedAccounts(): ConnectedAccountRow[] {
    return this.accounts.filter((a) => a.workspaceId === this.currentWorkspaceId);
  }

  getDataEndpoints(): DataEndpointRow[] {
    return this.endpoints.filter((e) => e.workspaceId === this.currentWorkspaceId);
  }

  getSyncConfigs(): SyncConfigRow[] {
    return this.syncConfigs.filter((s) => s.workspaceId === this.currentWorkspaceId);
  }

  getSyncConfigById(id: string): SyncConfigRow | undefined {
    return this.syncConfigs.find(
      (s) => s.id === id && s.workspaceId === this.currentWorkspaceId
    );
  }

  getFieldMappings(syncConfigId: string): FieldMappingRow[] {
    return this.mappings.filter((m) => m.syncConfigId === syncConfigId);
  }

  getRecordLinks(syncConfigId: string): RecordLinkRow[] {
    return this.recordLinks.filter((r) => r.syncConfigId === syncConfigId);
  }

  // --- CSV Datasets (Scoped to Workspace) ---
  getCsvDatasets(workspaceId: string = this.currentWorkspaceId): CsvDatasetRow[] {
    return this.csvDatasets.filter((d) => d.workspaceId === workspaceId);
  }

  getCsvDatasetById(id: string): CsvDatasetRow | undefined {
    return this.csvDatasets.find((d) => d.id === id);
  }

  addCsvDataset(dataset: CsvDatasetRow): void {
    const existingIdx = this.csvDatasets.findIndex((d) => d.id === dataset.id);
    if (existingIdx >= 0) {
      this.csvDatasets[existingIdx] = dataset;
    } else {
      this.csvDatasets.unshift(dataset);
    }
    this.saveToStorage();
  }

  deleteCsvDataset(id: string): void {
    this.csvDatasets = this.csvDatasets.filter((d) => d.id !== id);
    this.saveToStorage();
  }

  getConflicts(): ConflictRow[] {
    const syncIds = this.getSyncConfigs().map((s) => s.id);
    return this.conflicts.filter((c) => syncIds.includes(c.syncConfigId) && c.status === 'open');
  }

  getErrors(): SyncErrorRow[] {
    return this.errors;
  }

  getDeadLetters(): DeadLetterRow[] {
    const syncIds = this.getSyncConfigs().map((s) => s.id);
    return this.deadLetters.filter((d) => syncIds.includes(d.syncConfigId));
  }

  getSyncRuns(syncConfigId?: string): SyncRunRow[] {
    if (syncConfigId) {
      return this.runs.filter((r) => r.syncConfigId === syncConfigId);
    }
    const syncIds = this.getSyncConfigs().map((s) => s.id);
    return this.runs.filter((r) => syncIds.includes(r.syncConfigId));
  }

  getSyncEvents(syncRunId?: string): SyncEventRow[] {
    if (syncRunId) {
      return this.events.filter((e) => e.syncRunId === syncRunId);
    }
    return this.events;
  }

  // --- Execution & Engine Integration ---
  async runSync(syncConfigId: string, isDryRun = false): Promise<SyncEngineResult> {
    const sync = this.getSyncConfigById(syncConfigId);
    if (!sync) throw new Error(`Sync config ${syncConfigId} not found`);

    const endpointA = this.endpoints.find((e) => e.id === sync.endpointAId);
    const endpointB = this.endpoints.find((e) => e.id === sync.endpointBId);

    if (!endpointA || !endpointB) {
      throw new Error('Endpoints not configured');
    }

    const connA = getConnector(endpointA.connectorId);
    const connB = getConnector(endpointB.connectorId);

    const foundAccA = this.accounts.find((a) => a.id === endpointA.connectedAccountId);
    const accountA: any = foundAccA ? {
      id: foundAccA.id,
      workspaceId: foundAccA.workspaceId,
      connectorKey: foundAccA.connectorKey,
      displayName: foundAccA.displayName,
      accessToken: foundAccA.encryptedAccessToken,
      scopes: foundAccA.scopes
    } : {
      id: 'default',
      workspaceId: this.currentWorkspaceId,
      connectorKey: endpointA.connectorId,
      displayName: endpointA.connectorId,
      accessToken: 'demo_token',
      scopes: []
    };

    const foundAccB = this.accounts.find((a) => a.id === endpointB.connectedAccountId);
    const accountB: any = foundAccB ? {
      id: foundAccB.id,
      workspaceId: foundAccB.workspaceId,
      connectorKey: foundAccB.connectorKey,
      displayName: foundAccB.displayName,
      accessToken: foundAccB.encryptedAccessToken,
      scopes: foundAccB.scopes
    } : {
      id: 'default',
      workspaceId: this.currentWorkspaceId,
      connectorKey: endpointB.connectorId,
      displayName: endpointB.connectorId,
      accessToken: 'demo_token',
      scopes: []
    };

    // Read records from both sides
    const resA = await connA.readRecords(accountA, endpointA.objectRef, { pageSize: 50 });
    const resB = await connB.readRecords(accountB, endpointB.objectRef, { pageSize: 50 });

    const mappings = this.getFieldMappings(syncConfigId);
    const existingLinks = this.getRecordLinks(syncConfigId);
    const limits = this.getLimits();

    const runId = `run_${Date.now()}`;

    // Execute pure engine
    const engineResult = executeSyncRun({
      config: sync as any,
      mappings: mappings as any,
      recordLinks: existingLinks as any,
      sourceRecords: resA.records,
      destinationRecords: resB.records,
      planLimits: limits,
      currentLinkedRecordsCount: this.recordLinks.length,
      isDryRun,
      runId
    });

    if (!isDryRun) {
      // Execute side B writes
      for (const w of engineResult.writesB) {
        if (w.action === 'create') {
          await connB.createRecord(accountB, endpointB.objectRef, w.record, w.idempotencyKey);
        } else if (w.action === 'update') {
          await connB.updateRecord(accountB, endpointB.objectRef, w.record.externalId, w.record, w.idempotencyKey);
        } else if (w.action === 'delete' && connB.deleteRecord) {
          await connB.deleteRecord(accountB, endpointB.objectRef, w.record.externalId, w.idempotencyKey);
        }
      }

      // Execute side A writes (for two-way sync)
      for (const w of engineResult.writesA) {
        if (w.action === 'create') {
          await connA.createRecord(accountA, endpointA.objectRef, w.record, w.idempotencyKey);
        } else if (w.action === 'update') {
          await connA.updateRecord(accountA, endpointA.objectRef, w.record.externalId, w.record, w.idempotencyKey);
        } else if (w.action === 'delete' && connA.deleteRecord) {
          await connA.deleteRecord(accountA, endpointA.objectRef, w.record.externalId, w.idempotencyKey);
        }
      }

      // Update state
      this.runs.unshift({
        ...engineResult.run,
        createdAt: engineResult.run.startedAt,
        updatedAt: engineResult.run.finishedAt || engineResult.run.startedAt
      });
      this.events.unshift(...(engineResult.events as any));
      this.errors.unshift(...(engineResult.errors as any));
      this.conflicts.unshift(...(engineResult.newConflicts as any));

      // Update record links
      this.recordLinks = this.recordLinks.filter((l) => l.syncConfigId !== syncConfigId);
      this.recordLinks.push(...(engineResult.updatedRecordLinks as any));

      sync.lastRunAt = engineResult.run.finishedAt;
      if (engineResult.run.status === 'failed') {
        sync.status = 'error';
      }

      this.logAudit('sync.executed', 'sync_config', syncConfigId, {
        runId,
        created: engineResult.run.created,
        updated: engineResult.run.updated,
        conflicts: engineResult.run.conflicts
      });
    }

    this.saveToStorage();
    return engineResult;
  }

  // --- Conflict Resolution ---
  resolveConflict(conflictId: string, resolution: 'use_a' | 'use_b' | 'custom', customValues?: any): void {
    const c = this.conflicts.find((item) => item.id === conflictId);
    if (!c) return;
    c.status = 'resolved';
    c.resolution = resolution;
    c.resolvedBy = this.currentUserId;
    c.resolvedAt = new Date().toISOString();

    const link = this.recordLinks.find((l) => l.id === c.recordLinkId);
    if (link) {
      if (resolution === 'use_a') {
        link.lastSyncedHashB = link.lastSyncedHashA;
      } else if (resolution === 'use_b') {
        link.lastSyncedHashA = link.lastSyncedHashB;
      }
      link.lastSyncedAt = new Date().toISOString();
    }

    this.logAudit('conflict.resolved', 'conflict', conflictId, { resolution, customValues });
    this.saveToStorage();
  }

  // --- Dead Letter Replay ---
  replayDeadLetter(id: string): boolean {
    const dl = this.deadLetters.find((d) => d.id === id);
    if (!dl) return false;
    dl.status = 'replayed';
    dl.attempts += 1;
    dl.updatedAt = new Date().toISOString();
    this.logAudit('dead_letter.replayed', 'dead_letter', id);
    this.saveToStorage();
    return true;
  }

  bulkReplayDeadLetters(): number {
    let count = 0;
    for (const dl of this.deadLetters) {
      if (dl.status === 'open') {
        dl.status = 'replayed';
        dl.attempts += 1;
        dl.updatedAt = new Date().toISOString();
        count++;
      }
    }
    this.logAudit('dead_letter.bulk_replayed', 'dead_letter', undefined, { count });
    this.saveToStorage();
    return count;
  }

  // --- Workspace Export ---
  exportWorkspaceData(): string {
    const data = {
      workspace: this.getCurrentWorkspace(),
      plan: this.getCurrentPlan(),
      members: this.members.filter((m) => m.workspaceId === this.currentWorkspaceId),
      accounts: this.getConnectedAccounts().map((a) => ({
        id: a.id,
        connectorKey: a.connectorKey,
        displayName: a.displayName,
        scopes: a.scopes,
        status: a.status
      })),
      endpoints: this.getDataEndpoints(),
      syncConfigs: this.getSyncConfigs(),
      fieldMappings: this.mappings.filter((m) =>
        this.getSyncConfigs().some((s) => s.id === m.syncConfigId)
      ),
      recordLinks: this.recordLinks.filter((l) =>
        this.getSyncConfigs().some((s) => s.id === l.syncConfigId)
      ),
      runs: this.getSyncRuns(),
      auditLogs: this.auditLogs.filter((a) => a.workspaceId === this.currentWorkspaceId),
      exportedAt: new Date().toISOString()
    };
    this.logAudit('workspace.exported', 'workspace', this.currentWorkspaceId);
    return JSON.stringify(data, null, 2);
  }

  // --- Workspace Deletion ---
  deleteCurrentWorkspace(): void {
    this.assertIsOwner('delete this workspace');
    const ws = this.getCurrentWorkspace();
    ws.deletedAt = new Date(Date.now() + 7 * 86400 * 1000).toISOString(); // 7-day soft delete grace
    this.logAudit('workspace.soft_deleted', 'workspace', this.currentWorkspaceId, {
      purgeScheduledAt: ws.deletedAt
    });
    this.saveToStorage();
  }

  // --- Create New Sync ---
  createSync(
    name: string,
    endpointA: Partial<DataEndpointRow>,
    endpointB: Partial<DataEndpointRow>,
    config: Partial<SyncConfigRow>,
    mappingsList: Array<Omit<FieldMappingRow, 'id' | 'syncConfigId' | 'createdAt' | 'updatedAt'>>
  ): SyncConfigRow {
    this.assertCanWrite('create new sync pipeline');
    const now = new Date().toISOString();
    const syncId = `sync_${Date.now()}`;

    // Create or reuse endpoints
    const epAId = `ep_${Date.now()}_a`;
    const epBId = `ep_${Date.now()}_b`;

    const newEpA: DataEndpointRow = {
      id: epAId,
      workspaceId: this.currentWorkspaceId,
      connectedAccountId: endpointA.connectedAccountId,
      connectorId: endpointA.connectorId || 'csv',
      objectRef: endpointA.objectRef || { id: 'obj_a', name: 'Source Object' },
      role: 'source',
      createdAt: now,
      updatedAt: now
    };

    const newEpB: DataEndpointRow = {
      id: epBId,
      workspaceId: this.currentWorkspaceId,
      connectedAccountId: endpointB.connectedAccountId,
      connectorId: endpointB.connectorId || 'mock_db',
      objectRef: endpointB.objectRef || { id: 'obj_b', name: 'Destination Object' },
      role: 'destination',
      createdAt: now,
      updatedAt: now
    };

    this.endpoints.push(newEpA, newEpB);

    const newSync: SyncConfigRow = {
      id: syncId,
      workspaceId: this.currentWorkspaceId,
      name,
      endpointAId: epAId,
      endpointBId: epBId,
      direction: config.direction || 'a_to_b',
      conflictRule: config.conflictRule || 'source_wins',
      triggerMode: config.triggerMode || 'manual',
      intervalMinutes: config.intervalMinutes || 15,
      deleteBehavior: config.deleteBehavior || 'ignore',
      filters: config.filters,
      status: 'active',
      createdBy: this.currentUserId,
      createdAt: now,
      updatedAt: now
    };

    this.syncConfigs.push(newSync);

    // Save field mappings
    mappingsList.forEach((m, idx) => {
      this.mappings.push({
        id: `map_${syncId}_${idx + 1}`,
        syncConfigId: syncId,
        sourceFieldKey: m.sourceFieldKey,
        destinationFieldKey: m.destinationFieldKey,
        transform: m.transform,
        defaultValue: m.defaultValue,
        isKey: m.isKey,
        required: m.required,
        createdAt: now,
        updatedAt: now
      });
    });

    this.logAudit('sync.created', 'sync_config', syncId, { name, direction: newSync.direction });
    this.saveToStorage();
    return newSync;
  }
}

export const db = new AppDbStore();
