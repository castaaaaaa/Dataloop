-- ==============================================================================
-- Dataloop Migration: Real Authentication, Workspaces, RBAC & Row Level Security
-- ==============================================================================

-- 1. PROFILES / USERS TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. WORKSPACES TABLE (14-day Pro trial by default)
CREATE TABLE IF NOT EXISTS public.workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  plan_id TEXT NOT NULL DEFAULT 'plan_pro',
  trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. WORKSPACE MEMBERS TABLE (Owner, Admin, Member)
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_workspace_user UNIQUE (workspace_id, user_id)
);

-- 4. WORKSPACE INVITATIONS TABLE (Teammates invited by email)
CREATE TABLE IF NOT EXISTS public.workspace_invitations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. PLANS TABLE (Configuration)
CREATE TABLE IF NOT EXISTS public.plans (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price_monthly_cents INT NOT NULL DEFAULT 0,
  price_annual_monthly_cents INT NOT NULL DEFAULT 0,
  limits JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed plans if not present
INSERT INTO public.plans (id, key, name, price_monthly_cents, price_annual_monthly_cents, limits)
VALUES
  ('plan_free', 'free', 'Free', 0, 0, '{"maxRecords": 500, "maxActiveSyncs": 2, "minIntervalMinutes": 60, "premiumConnectors": false, "teamSeats": 1, "logRetentionDays": 7, "realtime": false}'::jsonb),
  ('plan_starter', 'starter', 'Starter', 1900, 1500, '{"maxRecords": 5000, "maxActiveSyncs": 5, "minIntervalMinutes": 15, "premiumConnectors": true, "teamSeats": 2, "logRetentionDays": 30, "realtime": false}'::jsonb),
  ('plan_pro', 'pro', 'Pro', 4900, 3900, '{"maxRecords": 25000, "maxActiveSyncs": 20, "minIntervalMinutes": 5, "premiumConnectors": true, "teamSeats": 5, "logRetentionDays": 90, "realtime": true}'::jsonb),
  ('plan_business', 'business', 'Business', 12900, 9900, '{"maxRecords": 100000, "maxActiveSyncs": 75, "minIntervalMinutes": 1, "premiumConnectors": true, "teamSeats": 15, "logRetentionDays": 180, "realtime": true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 6. CONNECTED ACCOUNTS TABLE (OAuth & tokens encrypted at rest)
CREATE TABLE IF NOT EXISTS public.connected_accounts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connector_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  external_account_id TEXT,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT,
  key_version TEXT NOT NULL DEFAULT 'v1',
  scopes TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'needs_reconnect', 'revoked')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. DATA ENDPOINTS TABLE
CREATE TABLE IF NOT EXISTS public.data_endpoints (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connected_account_id TEXT REFERENCES public.connected_accounts(id) ON DELETE SET NULL,
  connector_id TEXT NOT NULL,
  object_ref JSONB NOT NULL,
  role TEXT NOT NULL DEFAULT 'both' CHECK (role IN ('source', 'destination', 'both')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. SYNC CONFIGS TABLE (Pipelines)
CREATE TABLE IF NOT EXISTS public.sync_configs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  endpoint_a_id TEXT NOT NULL REFERENCES public.data_endpoints(id) ON DELETE RESTRICT,
  endpoint_b_id TEXT NOT NULL REFERENCES public.data_endpoints(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL DEFAULT 'two_way' CHECK (direction IN ('a_to_b', 'b_to_a', 'two_way')),
  conflict_rule TEXT NOT NULL DEFAULT 'manual' CHECK (conflict_rule IN ('source_wins', 'destination_wins', 'newest_wins', 'manual')),
  trigger_mode TEXT NOT NULL DEFAULT 'scheduled' CHECK (trigger_mode IN ('manual', 'scheduled', 'webhook')),
  interval_minutes INT NOT NULL DEFAULT 15,
  delete_behavior TEXT NOT NULL DEFAULT 'soft_delete' CHECK (delete_behavior IN ('ignore', 'soft_delete', 'hard_delete')),
  filters JSONB,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'error')),
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. FIELD MAPPINGS TABLE
CREATE TABLE IF NOT EXISTS public.field_mappings (
  id TEXT PRIMARY KEY,
  sync_config_id TEXT NOT NULL REFERENCES public.sync_configs(id) ON DELETE CASCADE,
  source_field_key TEXT NOT NULL,
  destination_field_key TEXT NOT NULL,
  transform JSONB,
  default_value JSONB,
  is_key BOOLEAN NOT NULL DEFAULT false,
  required BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. RECORD LINKS TABLE (Identity correlation & change hash tracking)
CREATE TABLE IF NOT EXISTS public.record_links (
  id TEXT PRIMARY KEY,
  sync_config_id TEXT NOT NULL REFERENCES public.sync_configs(id) ON DELETE CASCADE,
  a_external_id TEXT NOT NULL,
  b_external_id TEXT NOT NULL,
  last_synced_hash_a TEXT NOT NULL,
  last_synced_hash_b TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_sync_link UNIQUE (sync_config_id, a_external_id, b_external_id)
);

-- 11. CONFLICTS TABLE (Review Queue)
CREATE TABLE IF NOT EXISTS public.conflicts (
  id TEXT PRIMARY KEY,
  sync_config_id TEXT NOT NULL REFERENCES public.sync_configs(id) ON DELETE CASCADE,
  record_link_id TEXT NOT NULL REFERENCES public.record_links(id) ON DELETE CASCADE,
  a_value JSONB NOT NULL,
  b_value JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution TEXT CHECK (resolution IN ('use_a', 'use_b', 'custom')),
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. SYNC RUNS TABLE
CREATE TABLE IF NOT EXISTS public.sync_runs (
  id TEXT PRIMARY KEY,
  sync_config_id TEXT NOT NULL REFERENCES public.sync_configs(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'schedule', 'webhook', 'api', 'dry_run')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  records_read INT NOT NULL DEFAULT 0,
  created INT NOT NULL DEFAULT 0,
  updated INT NOT NULL DEFAULT 0,
  deleted INT NOT NULL DEFAULT 0,
  skipped INT NOT NULL DEFAULT 0,
  conflicts INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  is_dry_run BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. SYNC EVENTS TABLE (Audit Trail)
CREATE TABLE IF NOT EXISTS public.sync_events (
  id TEXT PRIMARY KEY,
  sync_run_id TEXT NOT NULL REFERENCES public.sync_runs(id) ON DELETE CASCADE,
  record_link_id TEXT REFERENCES public.record_links(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'skip', 'conflict')),
  side TEXT NOT NULL CHECK (side IN ('A', 'B')),
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed', 'pending')),
  idempotency_key TEXT NOT NULL,
  before JSONB,
  after JSONB,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14. SYNC ERRORS TABLE
CREATE TABLE IF NOT EXISTS public.sync_errors (
  id TEXT PRIMARY KEY,
  sync_run_id TEXT NOT NULL REFERENCES public.sync_runs(id) ON DELETE CASCADE,
  sync_event_id TEXT REFERENCES public.sync_events(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  code TEXT NOT NULL,
  user_message TEXT NOT NULL,
  fix_hint TEXT,
  raw JSONB,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 15. DEAD LETTERS TABLE
CREATE TABLE IF NOT EXISTS public.dead_letters (
  id TEXT PRIMARY KEY,
  sync_config_id TEXT NOT NULL REFERENCES public.sync_configs(id) ON DELETE CASCADE,
  sync_event_id TEXT REFERENCES public.sync_events(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  last_error TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'replayed', 'dismissed')),
  attempts INT NOT NULL DEFAULT 6,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 16. API KEYS TABLE
CREATE TABLE IF NOT EXISTS public.api_keys (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 17. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id),
  actor_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata JSONB,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 18. UPGRADE REQUESTS TABLE
CREATE TABLE IF NOT EXISTS public.upgrade_requests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  requested_plan_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS across all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connected_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.record_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dead_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upgrade_requests ENABLE ROW LEVEL SECURITY;

-- Helper function: Check if user is a member of workspace
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper function: Check user's role in workspace
CREATE OR REPLACE FUNCTION public.has_workspace_role(ws_id TEXT, required_roles TEXT[])
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid() AND role = ANY(required_roles)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 1. Profiles Policies
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- 2. Plans Policies (Readable by all authenticated users)
CREATE POLICY "Plans readable by authenticated users" ON public.plans
  FOR SELECT TO authenticated USING (true);

-- 3. Workspaces Policies (Only visible if member)
CREATE POLICY "Users can view workspaces they belong to" ON public.workspaces
  FOR SELECT USING (public.is_workspace_member(id));

CREATE POLICY "Owners can update workspace" ON public.workspaces
  FOR UPDATE USING (public.has_workspace_role(id, ARRAY['owner']));

CREATE POLICY "Users can insert workspaces" ON public.workspaces
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- 4. Workspace Members Policies
CREATE POLICY "Members can view co-members in workspace" ON public.workspace_members
  FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Owners and Admins can manage members" ON public.workspace_members
  FOR ALL USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- 5. Workspace Invitations Policies
CREATE POLICY "Members can view workspace invitations" ON public.workspace_invitations
  FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Owners and Admins can create and revoke invitations" ON public.workspace_invitations
  FOR ALL USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- 6. Connected Accounts Policies
CREATE POLICY "Members can view connected accounts" ON public.connected_accounts
  FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Owners and Admins can write connected accounts" ON public.connected_accounts
  FOR ALL USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- 7. Data Endpoints Policies
CREATE POLICY "Members can view data endpoints" ON public.data_endpoints
  FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Owners and Admins can manage data endpoints" ON public.data_endpoints
  FOR ALL USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- 8. Sync Configs Policies
CREATE POLICY "Members can view sync configs" ON public.sync_configs
  FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Owners and Admins can create and edit sync configs" ON public.sync_configs
  FOR ALL USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- 9. Field Mappings Policies
CREATE POLICY "Members can view field mappings" ON public.field_mappings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sync_configs
      WHERE sync_configs.id = field_mappings.sync_config_id
      AND public.is_workspace_member(sync_configs.workspace_id)
    )
  );

CREATE POLICY "Owners and Admins can edit field mappings" ON public.field_mappings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.sync_configs
      WHERE sync_configs.id = field_mappings.sync_config_id
      AND public.has_workspace_role(sync_configs.workspace_id, ARRAY['owner', 'admin'])
    )
  );

-- 10. Record Links Policies
CREATE POLICY "Members can view record links" ON public.record_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sync_configs
      WHERE sync_configs.id = record_links.sync_config_id
      AND public.is_workspace_member(sync_configs.workspace_id)
    )
  );

CREATE POLICY "Members can write record links during sync" ON public.record_links
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.sync_configs
      WHERE sync_configs.id = record_links.sync_config_id
      AND public.is_workspace_member(sync_configs.workspace_id)
    )
  );

-- 11. Conflicts Policies
CREATE POLICY "Members can view and resolve conflicts" ON public.conflicts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.sync_configs
      WHERE sync_configs.id = conflicts.sync_config_id
      AND public.is_workspace_member(sync_configs.workspace_id)
    )
  );

-- 12. Sync Runs Policies
CREATE POLICY "Members can view sync runs" ON public.sync_runs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sync_configs
      WHERE sync_configs.id = sync_runs.sync_config_id
      AND public.is_workspace_member(sync_configs.workspace_id)
    )
  );

CREATE POLICY "Members can trigger sync runs" ON public.sync_runs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sync_configs
      WHERE sync_configs.id = sync_runs.sync_config_id
      AND public.is_workspace_member(sync_configs.workspace_id)
    )
  );

-- 13. Sync Events, Errors & Dead Letters Policies
CREATE POLICY "Members can view sync events" ON public.sync_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sync_runs
      JOIN public.sync_configs ON sync_configs.id = sync_runs.sync_config_id
      WHERE sync_runs.id = sync_events.sync_run_id
      AND public.is_workspace_member(sync_configs.workspace_id)
    )
  );

CREATE POLICY "Members can view sync errors" ON public.sync_errors
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.sync_runs
      JOIN public.sync_configs ON sync_configs.id = sync_runs.sync_config_id
      WHERE sync_runs.id = sync_errors.sync_run_id
      AND public.is_workspace_member(sync_configs.workspace_id)
    )
  );

CREATE POLICY "Members can view and replay dead letters" ON public.dead_letters
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.sync_configs
      WHERE sync_configs.id = dead_letters.sync_config_id
      AND public.is_workspace_member(sync_configs.workspace_id)
    )
  );

-- 14. API Keys & Audit Logs
CREATE POLICY "Owners and Admins can view and create api keys" ON public.api_keys
  FOR ALL USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

CREATE POLICY "Members can view audit logs" ON public.audit_logs
  FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY "System and Members can insert audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id));

-- 15. Upgrade Requests
CREATE POLICY "Members can insert upgrade requests" ON public.upgrade_requests
  FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Owners and Admins can view upgrade requests" ON public.upgrade_requests
  FOR SELECT USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));


-- ==============================================================================
-- AUTOMATIC NEW USER ONBOARDING TRIGGER
-- When a user signs up via Supabase Auth:
-- 1. Create their user row in public.profiles
-- 2. Create a new empty workspace they own with a 14-day Pro trial
-- 3. Add them to public.workspace_members with role: 'owner'
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_ws_id TEXT;
  new_member_id TEXT;
  user_full_name TEXT;
BEGIN
  user_full_name := COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));

  -- 1. Create User Row in profiles
  INSERT INTO public.profiles (id, email, name, avatar_url, created_at, updated_at)
  VALUES (
    new.id,
    new.email,
    user_full_name,
    new.raw_user_meta_data->>'avatar_url',
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email, name = EXCLUDED.name, updated_at = now();

  -- 2. Create new empty workspace owned by user (with 14-day Pro trial)
  new_ws_id := 'ws_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  INSERT INTO public.workspaces (
    id,
    name,
    slug,
    owner_id,
    plan_id,
    trial_ends_at,
    created_at,
    updated_at
  )
  VALUES (
    new_ws_id,
    user_full_name || '''s Workspace',
    'workspace-' || substr(new.id::text, 1, 8),
    new.id,
    'plan_pro',
    now() + interval '14 days',
    now(),
    now()
  );

  -- 3. Add user as Owner in workspace_members
  new_member_id := 'mem_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  INSERT INTO public.workspace_members (
    id,
    workspace_id,
    user_id,
    role,
    created_at,
    updated_at
  )
  VALUES (
    new_member_id,
    new_ws_id,
    new.id,
    'owner',
    now(),
    now()
  );

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if already exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
