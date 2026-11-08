/**
 * Supabase Postgres Database Repository
 * Executes real database reads and writes to all 16 tables in Supabase Postgres:
 * 1. profiles
 * 2. workspaces
 * 3. workspace_members
 * 4. invitations
 * 5. connected_accounts
 * 6. csv_datasets
 * 7. sync_configurations
 * 8. field_mappings
 * 9. record_links
 * 10. sync_runs
 * 11. sync_events
 * 12. sync_errors
 * 13. plans
 * 14. subscriptions
 * 15. usage_counters
 * 16. audit_logs
 *
 * Runs exclusively on server-side with service-role permissions (or in local fallback mode if not configured).
 */

import { getServerSupabase } from '../supabase/server';
import { db } from './store';
import { BILLING_ENABLED } from '../billing/config';
import {
  UserRow,
  WorkspaceRow,
  WorkspaceMemberRow,
  WorkspaceInviteRow,
  ConnectedAccountRow,
  CsvDatasetRow,
  SyncConfigRow,
  FieldMappingRow,
  RecordLinkRow,
  SyncRunRow,
  SyncEventRow,
  SyncErrorRow,
  PlanRow,
  SubscriptionRow,
  UsageCounterRow,
  AuditLogRow
} from './schema';

export class SupabasePostgresRepo {
  private client = getServerSupabase();

  // Helper to re-check client
  private getClient() {
    if (!this.client) {
      this.client = getServerSupabase();
    }
    return this.client;
  }

  // ---------------------------------------------------------------------------
  // 1. PROFILES
  // ---------------------------------------------------------------------------
  async getProfile(userId: string): Promise<UserRow | null> {
    const client = this.getClient();
    if (client) {
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (!error && data) {
        return {
          id: data.id,
          email: data.email,
          name: data.name || '',
          avatarUrl: data.avatar_url,
          themePreference: data.theme_preference,
          createdAt: data.created_at,
          updatedAt: data.updated_at
        };
      }
    }
    return db.users.find((u) => u.id === userId) || null;
  }

  async upsertProfile(user: UserRow): Promise<void> {
    const client = this.getClient();
    if (client) {
      await client.from('profiles').upsert({
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatarUrl,
        theme_preference: user.themePreference || 'system',
        updated_at: new Date().toISOString()
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 2. WORKSPACES
  // ---------------------------------------------------------------------------
  private formatWorkspaceRow(data: any): WorkspaceRow {
    let planId = data.plan_id || data.planId;
    let trialEndsAt = data.trial_ends_at !== undefined ? data.trial_ends_at : data.trialEndsAt;

    if (!BILLING_ENABLED) {
      trialEndsAt = null;
      // Workspaces with automatic 14-day trial Pro default to Free (testing).
      // Manual plan changes in database without trial timestamp are preserved.
      if (planId === 'plan_pro' && data.trial_ends_at) {
        planId = 'plan_free';
      } else if (!planId) {
        planId = 'plan_free';
      }
    }

    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      ownerId: data.owner_id || data.ownerId,
      planId: planId || 'plan_free',
      trialEndsAt: trialEndsAt || undefined,
      deletedAt: data.deleted_at || data.deletedAt || null,
      createdAt: data.created_at || data.createdAt,
      updatedAt: data.updated_at || data.updatedAt
    };
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceRow | null> {
    const client = this.getClient();
    if (client) {
      const { data, error } = await client
        .from('workspaces')
        .select('*')
        .eq('id', workspaceId)
        .maybeSingle();
      if (!error && data) {
        return this.formatWorkspaceRow(data);
      }
    }
    const mem = db.workspaces.find((w) => w.id === workspaceId);
    return mem ? this.formatWorkspaceRow(mem) : null;
  }

  async getUserWorkspaces(userId: string): Promise<WorkspaceRow[]> {
    const client = this.getClient();
    if (client) {
      // Find workspaces where user is a member
      const { data: memberRows, error: memberErr } = await client
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', userId);

      if (!memberErr && memberRows && memberRows.length > 0) {
        const wsIds = memberRows.map((m: any) => m.workspace_id);
        const { data: wsRows, error: wsErr } = await client
          .from('workspaces')
          .select('*')
          .in('id', wsIds);

        if (!wsErr && wsRows) {
          return wsRows.map((data: any) => this.formatWorkspaceRow(data));
        }
      }
    }
    return db.getUserWorkspaces(userId).map((w) => this.formatWorkspaceRow(w));
  }

  async createWorkspace(
    workspace: Partial<WorkspaceRow> & { name: string; ownerId: string },
    initialMemberRole = 'owner'
  ): Promise<WorkspaceRow> {
    const client = this.getClient();
    if (client) {
      const now = new Date().toISOString();
      const slug = workspace.slug || workspace.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

      const insertPayload: any = {
        name: workspace.name,
        slug,
        owner_id: workspace.ownerId,
        plan_id: workspace.planId || 'plan_free',
        trial_ends_at: workspace.trialEndsAt || null,
        created_at: workspace.createdAt || now,
        updated_at: workspace.updatedAt || now
      };
      // Only include id if already a valid non-ws_ UUID
      if (workspace.id && !workspace.id.startsWith('ws_')) {
        insertPayload.id = workspace.id;
      }

      const { data: createdWs, error: wsErr } = await client
        .from('workspaces')
        .insert(insertPayload)
        .select('*')
        .single();

      if (wsErr || !createdWs) {
        throw new Error(`Failed to create workspace in database: ${wsErr?.message || 'unknown'}`);
      }

      const wsId = createdWs.id;

      // Insert member using database-generated UUID
      await client.from('workspace_members').insert({
        workspace_id: wsId,
        user_id: workspace.ownerId,
        role: initialMemberRole,
        created_at: now,
        updated_at: now
      });

      // Insert default subscription
      try {
        await client.from('subscriptions').insert({
          workspace_id: wsId,
          plan_id: workspace.planId || 'plan_free',
          status: 'active',
          trial_ends_at: null,
          current_period_end: null,
          cancel_at_period_end: false,
          created_at: now,
          updated_at: now
        });
      } catch (_e) {}

      // Insert usage counter
      try {
        await client.from('usage_counters').insert({
          workspace_id: wsId,
          period_start: now,
          period_end: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
          records_synced: 0,
          runs_count: 0,
          active_syncs_peak: 0,
          created_at: now,
          updated_at: now
        });
      } catch (_e) {}

      return this.formatWorkspaceRow(createdWs);
    }
    return this.formatWorkspaceRow(db.createWorkspace(workspace.name));
  }

  // ---------------------------------------------------------------------------
  // 3. WORKSPACE MEMBERS
  // ---------------------------------------------------------------------------
  async getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberRow[]> {
    const client = this.getClient();
    if (client) {
      const { data, error } = await client
        .from('workspace_members')
        .select('*')
        .eq('workspace_id', workspaceId);
      if (!error && data) {
        return data.map((m: any) => ({
          id: m.id,
          workspaceId: m.workspace_id,
          userId: m.user_id,
          role: m.role,
          invitedBy: m.invited_by,
          createdAt: m.created_at,
          updatedAt: m.updated_at
        }));
      }
    }
    return db.members.filter((m) => m.workspaceId === workspaceId);
  }

  async verifyWorkspaceMembership(
    userId: string,
    workspaceId: string
  ): Promise<{ isMember: boolean; role?: 'owner' | 'admin' | 'member' }> {
    const client = this.getClient();
    if (!client) {
      const mem = db.members.find((m) => m.workspaceId === workspaceId && m.userId === userId);
      return mem ? { isMember: true, role: mem.role } : { isMember: false };
    }

    const { data, error } = await client
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) {
      return { isMember: true, role: data.role as any };
    }
    return { isMember: false };
  }

  async ensureUserWorkspace(
    userId: string,
    email?: string,
    name?: string
  ): Promise<{ workspace: WorkspaceRow; role: 'owner' | 'admin' | 'member' }> {
    const client = this.getClient();
    if (!client) {
      const userWorkspaces = db.getUserWorkspaces(userId);
      if (userWorkspaces.length > 0) {
        return { workspace: userWorkspaces[0], role: db.getCurrentRole() };
      }
      const created = db.createWorkspace(name ? `${name}'s Workspace` : 'Workspace');
      return { workspace: created, role: 'owner' };
    }

    const now = new Date().toISOString();

    // 1. Ensure profile row exists in public.profiles table (UUID primary key)
    if (email) {
      try {
        await client
          .from('profiles')
          .upsert(
            {
              id: userId,
              email,
              name: name || email.split('@')[0],
              theme_preference: 'system',
              updated_at: now
            },
            { onConflict: 'id' }
          );
      } catch (e: any) {
        console.warn('[ensureUserWorkspace:profile_upsert]', e.message);
      }
    }

    // 2. Query workspace_members in Supabase:
    // If at least one exists, use that workspace. Never create a workspace on later logins.
    const { data: memberRows, error: memberErr } = await client
      .from('workspace_members')
      .select('workspace_id, role, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (!memberErr && memberRows && memberRows.length > 0) {
      for (const mRow of memberRows) {
        const { data: wsData } = await client
          .from('workspaces')
          .select('*')
          .eq('id', mRow.workspace_id)
          .maybeSingle();

        if (wsData) {
          return {
            workspace: this.formatWorkspaceRow(wsData),
            role: (mRow.role as any) || 'owner'
          };
        }
      }
    }

    // 3. First signup ONLY: User has no rows in workspace_members.
    // Create exactly ONE workspace using database-generated UUID (gen_random_uuid()::text).
    const cleanName = name || (email ? email.split('@')[0] : 'User');
    const wsName = `${cleanName}'s Workspace`;
    const slug = wsName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

    const { data: insertedWs, error: insertWsErr } = await client
      .from('workspaces')
      .insert({
        name: wsName,
        slug,
        owner_id: userId,
        plan_id: 'plan_free',
        trial_ends_at: null,
        created_at: now,
        updated_at: now
      })
      .select('*')
      .single();

    if (insertWsErr || !insertedWs) {
      throw new Error(`Failed to create initial workspace: ${insertWsErr?.message || 'unknown error'}`);
    }

    // Insert workspace_members row using database-generated UUID
    await client
      .from('workspace_members')
      .insert({
        workspace_id: insertedWs.id,
        user_id: userId,
        role: 'owner',
        created_at: now,
        updated_at: now
      });

    try {
      await client.from('subscriptions').insert({
        workspace_id: insertedWs.id,
        plan_id: 'plan_free',
        status: 'active',
        created_at: now,
        updated_at: now
      });
    } catch (_e) {}

    try {
      await client.from('usage_counters').insert({
        workspace_id: insertedWs.id,
        period_start: now,
        period_end: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
        records_synced: 0,
        runs_count: 0,
        active_syncs_peak: 0,
        created_at: now,
        updated_at: now
      });
    } catch (_e) {}

    return {
      workspace: this.formatWorkspaceRow(insertedWs),
      role: 'owner'
    };
  }

  // ---------------------------------------------------------------------------
  // 4. INVITATIONS
  // ---------------------------------------------------------------------------
  async getInvitations(workspaceId: string): Promise<WorkspaceInviteRow[]> {
    const client = this.getClient();
    if (client) {
      const { data, error } = await client
        .from('invitations')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('status', 'pending');
      if (!error && data) {
        return data.map((i: any) => ({
          id: i.id,
          workspaceId: i.workspace_id,
          email: i.email,
          role: i.role,
          invitedBy: i.invited_by,
          status: i.status,
          createdAt: i.created_at,
          updatedAt: i.updated_at
        }));
      }
    }
    return db.getWorkspaceInvitations(workspaceId);
  }

  async createInvitation(invite: WorkspaceInviteRow): Promise<void> {
    const client = this.getClient();
    if (client) {
      await client.from('invitations').insert({
        id: invite.id,
        workspace_id: invite.workspaceId,
        email: invite.email,
        role: invite.role,
        invited_by: invite.invitedBy,
        status: invite.status,
        created_at: invite.createdAt,
        updated_at: invite.updatedAt || invite.createdAt
      });
    }
  }

  async revokeInvitation(inviteId: string): Promise<void> {
    const client = this.getClient();
    if (client) {
      await client
        .from('invitations')
        .update({ status: 'revoked', updated_at: new Date().toISOString() })
        .eq('id', inviteId);
    }
  }

  // ---------------------------------------------------------------------------
  // 5. CONNECTED ACCOUNTS
  // ---------------------------------------------------------------------------
  async getConnectedAccounts(workspaceId: string, userId?: string): Promise<ConnectedAccountRow[]> {
    console.log(`[Connection:LOAD] user_id: ${userId || 'verified_session'}, workspace_id: ${workspaceId}`);
    const client = this.getClient();
    if (client) {
      const { data, error } = await client
        .from('connected_accounts')
        .select('*')
        .eq('workspace_id', workspaceId);

      if (error) {
        console.error('[Supabase:connected_accounts:SELECT_FAIL]', {
          workspace_id: workspaceId,
          error_code: error.code,
          error_message: error.message
        });
        throw new Error(`Database query on connected_accounts failed: ${error.message} (code: ${error.code})`);
      }

      if (data) {
        console.log('[Supabase:connected_accounts:SELECT_SUCCESS]', {
          workspace_id: workspaceId,
          user_id: userId || 'verified_session',
          row_count: data.length,
          rows: data.map((a: any) => ({
            id: a.id,
            workspace_id: a.workspace_id,
            connector_key: a.connector_key,
            display_name: a.display_name,
            external_account_id: a.external_account_id,
            status: a.status,
            scopes: a.scopes,
            created_at: a.created_at
          }))
        });

        return data.map((a: any) => ({
          id: a.id,
          workspaceId: a.workspace_id,
          connectorKey: a.connector_key,
          displayName: a.display_name,
          externalAccountId: a.external_account_id,
          encryptedAccessToken: a.encrypted_access_token,
          encryptedRefreshToken: a.encrypted_refresh_token,
          keyVersion: a.key_version,
          scopes: a.scopes || [],
          expiresAt: a.expires_at || undefined,
          status: a.status,
          createdBy: a.created_by,
          createdAt: a.created_at,
          updatedAt: a.updated_at
        }));
      }
    }
    throw new Error('Supabase client is not configured (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).');
  }

  async saveConnectedAccount(account: ConnectedAccountRow): Promise<ConnectedAccountRow> {
    console.log(`[Connection:SAVE] user_id: ${account.createdBy || 'verified_session'}, workspace_id: ${account.workspaceId}`);
    const client = this.getClient();
    if (!client) {
      throw new Error('Supabase client is not configured on server (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing).');
    }

    // Sanitized insert payload: createdBy must be a valid UUID or null to respect UUID foreign key
    const isUuid = account.createdBy && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(account.createdBy);

    const rowPayload = {
      id: account.id,
      workspace_id: account.workspaceId,
      connector_key: account.connectorKey,
      display_name: account.displayName,
      external_account_id: account.externalAccountId || null,
      encrypted_access_token: account.encryptedAccessToken,
      encrypted_refresh_token: account.encryptedRefreshToken || null,
      key_version: account.keyVersion || 'v1',
      scopes: account.scopes || [],
      expires_at: account.expiresAt || null,
      status: account.status || 'active',
      created_by: isUuid ? account.createdBy : null,
      created_at: account.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await client
      .from('connected_accounts')
      .upsert(rowPayload)
      .select('*')
      .single();

    if (error) {
      console.error('[Supabase:connected_accounts:INSERT_FAIL]', {
        workspace_id: rowPayload.workspace_id,
        connector_key: rowPayload.connector_key,
        display_name: rowPayload.display_name,
        error_code: error.code,
        error_message: error.message,
        error_details: error.details,
        error_hint: error.hint
      });
      throw new Error(`Database insert into connected_accounts failed: ${error.message}${error.hint ? ` (${error.hint})` : ''} (code: ${error.code})`);
    }

    console.log('[Supabase:connected_accounts:INSERT_SUCCESS]', {
      id: data.id,
      workspace_id: data.workspace_id,
      connector_key: data.connector_key,
      display_name: data.display_name,
      external_account_id: data.external_account_id,
      status: data.status,
      scopes: data.scopes,
      created_at: data.created_at,
      updated_at: data.updated_at
    });

    return {
      id: data.id,
      workspaceId: data.workspace_id,
      connectorKey: data.connector_key,
      displayName: data.display_name,
      externalAccountId: data.external_account_id,
      encryptedAccessToken: data.encrypted_access_token,
      encryptedRefreshToken: data.encrypted_refresh_token,
      keyVersion: data.key_version,
      scopes: data.scopes || [],
      status: data.status,
      createdBy: data.created_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  async deleteConnectedAccount(accountId: string, workspaceId: string): Promise<void> {
    const client = this.getClient();
    if (client) {
      const { error } = await client
        .from('connected_accounts')
        .delete()
        .eq('id', accountId)
        .eq('workspace_id', workspaceId);

      if (error) {
        console.error('[Supabase:connected_accounts:DELETE_FAIL]', {
          id: accountId,
          workspace_id: workspaceId,
          error_code: error.code,
          error_message: error.message
        });
        throw new Error(`Database delete on connected_accounts failed: ${error.message} (code: ${error.code})`);
      }

      console.log('[Supabase:connected_accounts:DELETE_SUCCESS]', {
        id: accountId,
        workspace_id: workspaceId
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 6. CSV DATASETS
  // ---------------------------------------------------------------------------
  async getCsvDatasets(workspaceId: string): Promise<CsvDatasetRow[]> {
    const client = this.getClient();
    if (client) {
      const { data, error } = await client
        .from('csv_datasets')
        .select('*')
        .eq('workspace_id', workspaceId);
      if (!error && data) {
        return data.map((d: any) => ({
          id: d.id,
          workspaceId: d.workspace_id,
          name: d.name,
          filename: d.filename,
          fileSize: Number(d.file_size || 0),
          rowCount: Number(d.row_count || 0),
          columns: d.columns || [],
          records: d.records || [],
          uploadedBy: d.uploaded_by,
          createdAt: d.created_at,
          updatedAt: d.updated_at
        }));
      }
    }
    return db.getCsvDatasets(workspaceId);
  }

  async getCsvDatasetById(datasetId: string): Promise<CsvDatasetRow | null> {
    const client = this.getClient();
    if (client) {
      const { data, error } = await client
        .from('csv_datasets')
        .select('*')
        .eq('id', datasetId)
        .maybeSingle();
      if (!error && data) {
        return {
          id: data.id,
          workspaceId: data.workspace_id,
          name: data.name,
          filename: data.filename,
          fileSize: Number(data.file_size || 0),
          rowCount: Number(data.row_count || 0),
          columns: data.columns || [],
          records: data.records || [],
          uploadedBy: data.uploaded_by,
          createdAt: data.created_at,
          updatedAt: data.updated_at
        };
      }
    }
    return db.getCsvDatasetById(datasetId) || null;
  }

  async saveCsvDataset(dataset: CsvDatasetRow): Promise<void> {
    const client = this.getClient();
    if (client) {
      await client.from('csv_datasets').upsert({
        id: dataset.id,
        workspace_id: dataset.workspaceId,
        name: dataset.name,
        filename: dataset.filename,
        file_size: dataset.fileSize,
        row_count: dataset.rowCount,
        columns: dataset.columns,
        records: dataset.records,
        uploaded_by: dataset.uploadedBy,
        created_at: dataset.createdAt,
        updated_at: dataset.updatedAt
      });
    }
  }

  async deleteCsvDataset(datasetId: string, workspaceId: string): Promise<void> {
    const client = this.getClient();
    if (client) {
      await client
        .from('csv_datasets')
        .delete()
        .eq('id', datasetId)
        .eq('workspace_id', workspaceId);
    }
  }

  // ---------------------------------------------------------------------------
  // 7. SYNC CONFIGURATIONS & 8. FIELD MAPPINGS
  // ---------------------------------------------------------------------------
  async getSyncConfigurations(workspaceId: string): Promise<SyncConfigRow[]> {
    const client = this.getClient();
    if (client) {
      const { data, error } = await client
        .from('sync_configurations')
        .select('*')
        .eq('workspace_id', workspaceId);
      if (!error && data) {
        return data.map((s: any) => ({
          id: s.id,
          workspaceId: s.workspace_id,
          name: s.name,
          endpointAId: s.source_dataset_id ? `ep_csv_${s.source_dataset_id}` : 'ep_a',
          endpointBId: s.destination_resource_id || 'ep_b',
          direction: s.direction,
          conflictRule: s.conflict_rule,
          triggerMode: s.trigger_mode,
          intervalMinutes: s.interval_minutes,
          deleteBehavior: s.delete_behavior,
          filters: s.filters,
          status: s.status,
          lastRunAt: s.last_run_at,
          nextRunAt: s.next_run_at,
          createdBy: s.created_by,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
          sourceDatasetId: s.source_dataset_id,
          destinationAccountId: s.destination_account_id,
          destinationResourceId: s.destination_resource_id,
          destinationResourceName: s.destination_resource_name
        }));
      }
      return [];
    }
    return db.getSyncConfigs().filter((s) => s.workspaceId === workspaceId);
  }

  async getSyncConfigurationById(syncId: string): Promise<SyncConfigRow | null> {
    const client = this.getClient();
    if (client) {
      const { data, error } = await client
        .from('sync_configurations')
        .select('*')
        .eq('id', syncId)
        .maybeSingle();
      if (!error && data) {
        return {
          id: data.id,
          workspaceId: data.workspace_id,
          name: data.name,
          endpointAId: data.source_dataset_id ? `ep_csv_${data.source_dataset_id}` : 'ep_a',
          endpointBId: data.destination_resource_id || 'ep_b',
          direction: data.direction,
          conflictRule: data.conflict_rule,
          triggerMode: data.trigger_mode,
          intervalMinutes: data.interval_minutes,
          deleteBehavior: data.delete_behavior,
          filters: data.filters,
          status: data.status,
          lastRunAt: data.last_run_at,
          nextRunAt: data.next_run_at,
          createdBy: data.created_by,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          sourceDatasetId: data.source_dataset_id,
          destinationAccountId: data.destination_account_id,
          destinationResourceId: data.destination_resource_id,
          destinationResourceName: data.destination_resource_name
        };
      }
      return null;
    }
    return null;
  }

  async updateSyncConfigurationRunStatus(syncId: string, lastRunAt: string, status: string): Promise<void> {
    const client = this.getClient();
    if (client) {
      await client
        .from('sync_configurations')
        .update({
          last_run_at: lastRunAt,
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', syncId);
    }
  }

  async saveSyncConfiguration(
    sync: SyncConfigRow,
    mappings: FieldMappingRow[] = [],
    extra?: { sourceDatasetId?: string; destAccountId?: string; destResourceId?: string; destResourceName?: string; keyColumn?: string }
  ): Promise<void> {
    const client = this.getClient();
    if (client) {
      const keyCol = extra?.keyColumn || mappings.find((m) => m.isKey)?.sourceFieldKey;
      const combinedFilters = {
        ...(sync.filters || {}),
        field_mappings: mappings,
        key_column: keyCol
      };

      await client.from('sync_configurations').upsert({
        id: sync.id,
        workspace_id: sync.workspaceId,
        name: sync.name,
        source_type: 'csv',
        source_dataset_id: extra?.sourceDatasetId,
        destination_type: 'google_sheets',
        destination_account_id: extra?.destAccountId,
        destination_resource_id: extra?.destResourceId,
        destination_resource_name: extra?.destResourceName,
        direction: sync.direction,
        conflict_rule: sync.conflictRule,
        trigger_mode: sync.triggerMode,
        interval_minutes: sync.intervalMinutes,
        delete_behavior: sync.deleteBehavior,
        filters: combinedFilters,
        status: sync.status,
        last_run_at: sync.lastRunAt,
        next_run_at: sync.nextRunAt,
        created_by: sync.createdBy,
        created_at: sync.createdAt,
        updated_at: sync.updatedAt
      });

      if (mappings.length > 0) {
        const mappingInserts = mappings.map((m) => ({
          id: m.id,
          sync_configuration_id: sync.id,
          workspace_id: sync.workspaceId,
          source_field_key: m.sourceFieldKey,
          destination_field_key: m.destinationFieldKey,
          transform: m.transform || {},
          default_value: m.defaultValue,
          is_key: m.isKey,
          required: m.required,
          created_at: m.createdAt,
          updated_at: m.updatedAt
        }));
        await client.from('field_mappings').upsert(mappingInserts);
      }
    }
  }

  async getFieldMappings(syncConfigId: string, workspaceId: string): Promise<FieldMappingRow[]> {
    const client = this.getClient();
    if (client) {
      const { data, error } = await client
        .from('field_mappings')
        .select('*')
        .eq('sync_configuration_id', syncConfigId);
      if (!error && data && data.length > 0) {
        return data.map((m: any) => ({
          id: m.id,
          syncConfigId: m.sync_configuration_id || m.syncConfigId,
          sourceFieldKey: m.source_field_key || m.sourceFieldKey || m.source_column || m.sourceColumn || m.source || '',
          destinationFieldKey: m.destination_field_key || m.destinationFieldKey || m.destination_column || m.destinationColumn || m.destField || m.destination || '',
          transform: m.transform && typeof m.transform === 'object' && Object.keys(m.transform).length > 0 ? m.transform : undefined,
          defaultValue: m.default_value ?? m.defaultValue,
          isKey: Boolean(m.is_key ?? m.isKey),
          required: Boolean(m.required),
          createdAt: m.created_at || m.createdAt || new Date().toISOString(),
          updatedAt: m.updated_at || m.updatedAt || new Date().toISOString()
        }));
      }

      // Check filters in sync_configurations for field_mappings & key_column
      const sync = await this.getSyncConfigurationById(syncConfigId);
      if (sync?.filters?.field_mappings && Array.isArray(sync.filters.field_mappings)) {
        const keyCol = sync.filters.key_column;
        return sync.filters.field_mappings.map((m: any, idx: number) => {
          const src = m.sourceFieldKey || m.source_field_key || m.source_column || m.sourceColumn || m.source || '';
          const dst = m.destinationFieldKey || m.destination_field_key || m.destination_column || m.destinationColumn || m.destField || m.destination || '';
          const isK = Boolean(m.isKey ?? m.is_key) || src === keyCol;
          return {
            id: m.id || `map_${syncConfigId}_${idx + 1}`,
            syncConfigId,
            sourceFieldKey: src,
            destinationFieldKey: dst,
            transform: m.transform && typeof m.transform === 'object' && Object.keys(m.transform).length > 0 ? m.transform : undefined,
            defaultValue: m.defaultValue ?? m.default_value,
            isKey: isK,
            required: Boolean(m.required),
            createdAt: m.createdAt || m.created_at || new Date().toISOString(),
            updatedAt: m.updatedAt || m.updated_at || new Date().toISOString()
          };
        });
      }
    }
    return db.getFieldMappings(syncConfigId);
  }

  // ---------------------------------------------------------------------------
  // 9. RECORD LINKS
  // ---------------------------------------------------------------------------
  async getRecordLinks(syncConfigId: string): Promise<RecordLinkRow[]> {
    const client = this.getClient();
    if (client) {
      const { data, error } = await client
        .from('record_links')
        .select('*')
        .eq('sync_configuration_id', syncConfigId);
      if (!error && data) {
        return data.map((l: any) => ({
          id: l.id,
          syncConfigId: l.sync_configuration_id,
          aExternalId: l.source_external_id,
          bExternalId: l.destination_external_id,
          lastSyncedHashA: l.last_synced_hash,
          lastSyncedHashB: l.last_synced_hash,
          lastSyncedAt: l.last_synced_at,
          aDeleted: l.source_deleted,
          bDeleted: l.destination_deleted,
          createdAt: l.created_at,
          updatedAt: l.updated_at
        }));
      }
    }
    return db.recordLinks.filter((l) => l.syncConfigId === syncConfigId);
  }

  async upsertRecordLink(link: RecordLinkRow, workspaceId: string): Promise<void> {
    const client = this.getClient();
    if (client) {
      await client.from('record_links').upsert({
        id: link.id,
        sync_configuration_id: link.syncConfigId,
        workspace_id: workspaceId,
        source_external_id: link.aExternalId,
        destination_external_id: link.bExternalId,
        last_synced_hash: link.lastSyncedHashA || link.lastSyncedHashB || '',
        last_synced_at: link.lastSyncedAt,
        source_deleted: link.aDeleted || false,
        destination_deleted: link.bDeleted || false,
        created_at: link.createdAt,
        updated_at: link.updatedAt
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 10. SYNC RUNS, 11. SYNC EVENTS, 12. SYNC ERRORS
  // ---------------------------------------------------------------------------
  async getSyncRuns(syncConfigId?: string, workspaceId?: string): Promise<SyncRunRow[]> {
    const client = this.getClient();
    if (client) {
      let query = client.from('sync_runs').select('*').order('started_at', { ascending: false });
      if (syncConfigId) query = query.eq('sync_configuration_id', syncConfigId);
      if (workspaceId) query = query.eq('workspace_id', workspaceId);

      const { data, error } = await query;
      if (!error && data) {
        return data.map((r: any) => ({
          id: r.id,
          syncConfigId: r.sync_configuration_id,
          trigger: r.trigger,
          status: r.status,
          startedAt: r.started_at,
          finishedAt: r.finished_at,
          recordsRead: Number(r.records_read || 0),
          created: Number(r.created || 0),
          updated: Number(r.updated || 0),
          deleted: Number(r.deleted || 0),
          skipped: Number(r.skipped || 0),
          conflicts: Number(r.conflicts || 0),
          failed: Number(r.failed || 0),
          isDryRun: Boolean(r.is_dry_run),
          createdAt: r.created_at,
          updatedAt: r.updated_at
        }));
      }
    }
    return db.getSyncRuns(syncConfigId);
  }

  async getSyncRunById(runId: string): Promise<SyncRunRow | null> {
    const client = this.getClient();
    if (client) {
      const { data, error } = await client
        .from('sync_runs')
        .select('*')
        .eq('id', runId)
        .maybeSingle();
      if (!error && data) {
        return {
          id: data.id,
          syncConfigId: data.sync_configuration_id,
          trigger: data.trigger,
          status: data.status,
          startedAt: data.started_at,
          finishedAt: data.finished_at,
          recordsRead: Number(data.records_read || 0),
          created: Number(data.created || 0),
          updated: Number(data.updated || 0),
          deleted: Number(data.deleted || 0),
          skipped: Number(data.skipped || 0),
          conflicts: Number(data.conflicts || 0),
          failed: Number(data.failed || 0),
          isDryRun: Boolean(data.is_dry_run),
          createdAt: data.created_at,
          updatedAt: data.updated_at
        };
      }
    }
    return db.runs.find((r) => r.id === runId) || null;
  }

  async upsertSyncRun(run: SyncRunRow, workspaceId: string): Promise<void> {
    const client = this.getClient();
    if (client) {
      const { data, error } = await client.from('sync_runs').upsert({
        id: run.id,
        sync_configuration_id: run.syncConfigId,
        workspace_id: workspaceId,
        trigger: run.trigger,
        status: run.status,
        started_at: run.startedAt,
        finished_at: run.finishedAt,
        records_read: run.recordsRead,
        created: run.created,
        updated: run.updated,
        deleted: run.deleted,
        skipped: run.skipped,
        conflicts: run.conflicts,
        failed: run.failed,
        is_dry_run: run.isDryRun,
        created_at: run.createdAt,
        updated_at: run.updatedAt
      });
      if (error) {
        console.error('[Supabase sync_runs upsert ERROR]:', error);
        throw new Error(`Failed to insert into public.sync_runs: ${error.message} (code: ${error.code})`);
      }
    }
  }

  async getSyncEvents(runId: string): Promise<SyncEventRow[]> {
    const client = this.getClient();
    if (client) {
      const { data, error } = await client
        .from('sync_events')
        .select('*')
        .eq('sync_run_id', runId)
        .order('created_at', { ascending: false });
      if (!error && data) {
        return data.map((e: any) => ({
          id: e.id,
          syncRunId: e.sync_run_id,
          recordLinkId: e.record_link_id,
          action: e.action,
          side: e.side,
          status: e.status,
          idempotencyKey: e.idempotency_key,
          before: e.before,
          after: e.after,
          message: e.message,
          createdAt: e.created_at
        }));
      }
    }
    return db.getSyncEvents(runId);
  }

  async createSyncEvent(event: SyncEventRow, syncConfigId: string, workspaceId: string): Promise<void> {
    const client = this.getClient();
    if (client) {
      await client.from('sync_events').insert({
        id: event.id,
        sync_run_id: event.syncRunId,
        sync_configuration_id: syncConfigId,
        workspace_id: workspaceId,
        record_link_id: event.recordLinkId,
        action: event.action,
        side: event.side,
        status: event.status,
        idempotency_key: event.idempotencyKey,
        before: event.before,
        after: event.after,
        message: event.message,
        created_at: event.createdAt
      });
    }
  }

  async getSyncErrors(workspaceId?: string): Promise<SyncErrorRow[]> {
    const client = this.getClient();
    if (client) {
      let query = client.from('sync_errors').select('*').order('created_at', { ascending: false });
      if (workspaceId) query = query.eq('workspace_id', workspaceId);

      const { data, error } = await query;
      if (!error && data) {
        return data.map((err: any) => ({
          id: err.id,
          syncRunId: err.sync_run_id,
          syncEventId: err.sync_event_id,
          category: err.category,
          code: err.code,
          userMessage: err.user_message,
          fixHint: err.fix_hint,
          raw: err.raw,
          isResolved: Boolean(err.is_resolved),
          createdAt: err.created_at,
          updatedAt: err.updated_at
        }));
      }
    }
    return db.errors;
  }

  async createSyncError(errorItem: SyncErrorRow, workspaceId: string): Promise<void> {
    const client = this.getClient();
    if (client) {
      await client.from('sync_errors').insert({
        id: errorItem.id,
        sync_run_id: errorItem.syncRunId,
        workspace_id: workspaceId,
        sync_event_id: errorItem.syncEventId,
        category: errorItem.category,
        code: errorItem.code,
        user_message: errorItem.userMessage,
        fix_hint: errorItem.fixHint,
        raw: errorItem.raw,
        is_resolved: errorItem.isResolved,
        created_at: errorItem.createdAt,
        updated_at: errorItem.updatedAt
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 13. PLANS
  // ---------------------------------------------------------------------------
  async getPlans(): Promise<PlanRow[]> {
    const client = this.getClient();
    if (client) {
      const { data, error } = await client.from('plans').select('*');
      if (!error && data && data.length > 0) {
        return data.map((p: any) => ({
          id: p.id,
          key: p.key,
          name: p.name,
          priceMonthlyCents: p.price_monthly_cents,
          priceAnnualMonthlyCents: p.price_annual_monthly_cents,
          limits: p.limits,
          createdAt: p.created_at,
          updatedAt: p.updated_at
        }));
      }
    }
    return db.plans;
  }

  // ---------------------------------------------------------------------------
  // 14. SUBSCRIPTIONS & 15. USAGE COUNTERS
  // ---------------------------------------------------------------------------
  async getSubscription(workspaceId: string): Promise<SubscriptionRow | null> {
    const client = this.getClient();
    if (client) {
      const { data, error } = await client
        .from('subscriptions')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (!error && data) {
        return {
          id: data.id,
          workspaceId: data.workspace_id,
          planKey: data.plan_id.replace('plan_', '') as any,
          status: data.status,
          trialEnd: data.trial_ends_at,
          currentPeriodEnd: data.current_period_end,
          cancelAtPeriodEnd: data.cancel_at_period_end,
          createdAt: data.created_at,
          updatedAt: data.updated_at
        };
      }
    }
    return null;
  }

  async getUsageCounter(workspaceId: string): Promise<UsageCounterRow | null> {
    const client = this.getClient();
    if (client) {
      const { data, error } = await client
        .from('usage_counters')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (!error && data) {
        return {
          id: data.id,
          workspaceId: data.workspace_id,
          periodStart: data.period_start,
          periodEnd: data.period_end,
          recordsSynced: Number(data.records_synced || 0),
          runsCount: Number(data.runs_count || 0),
          activeSyncsPeak: Number(data.active_syncs_peak || 0),
          createdAt: data.created_at,
          updatedAt: data.updated_at
        };
      }
    }
    return null;
  }

  async incrementUsageCounter(
    workspaceId: string,
    recordsSyncedDelta: number,
    runsDelta: number = 1
  ): Promise<void> {
    const client = this.getClient();
    if (client) {
      const { data: existing } = await client
        .from('usage_counters')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle();

      const now = new Date().toISOString();
      if (existing) {
        await client
          .from('usage_counters')
          .update({
            records_synced: Number(existing.records_synced || 0) + recordsSyncedDelta,
            runs_count: Number(existing.runs_count || 0) + runsDelta,
            updated_at: now
          })
          .eq('workspace_id', workspaceId);
      } else {
        await client.from('usage_counters').insert({
          id: `use_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          workspace_id: workspaceId,
          period_start: now,
          period_end: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
          records_synced: recordsSyncedDelta,
          runs_count: runsDelta,
          active_syncs_peak: 1,
          created_at: now,
          updated_at: now
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 16. AUDIT LOGS
  // ---------------------------------------------------------------------------
  async getAuditLogs(workspaceId: string): Promise<AuditLogRow[]> {
    const client = this.getClient();
    if (client) {
      const { data, error } = await client
        .from('audit_logs')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });
      if (!error && data) {
        return data.map((l: any) => ({
          id: l.id,
          workspaceId: l.workspace_id,
          actorUserId: l.actor_user_id,
          actorEmail: l.actor_email,
          action: l.action,
          targetType: l.target_type,
          targetId: l.target_id,
          metadata: l.metadata,
          ip: l.ip,
          userAgent: l.user_agent,
          createdAt: l.created_at
        }));
      }
    }
    return db.auditLogs.filter((l) => l.workspaceId === workspaceId);
  }

  async createAuditLog(log: AuditLogRow): Promise<void> {
    const client = this.getClient();
    if (client) {
      await client.from('audit_logs').insert({
        id: log.id,
        workspace_id: log.workspaceId,
        actor_user_id: log.actorUserId,
        actor_email: log.actorEmail,
        action: log.action,
        target_type: log.targetType,
        target_id: log.targetId,
        metadata: log.metadata || {},
        ip: log.ip,
        user_agent: log.userAgent,
        created_at: log.createdAt
      });
    }
  }
}

export const supabaseRepo = new SupabasePostgresRepo();
