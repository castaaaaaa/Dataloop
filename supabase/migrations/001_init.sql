-- ==============================================================================
-- Dataloop Migration: 001_init.sql
-- Complete Supabase Postgres Database Architecture
-- Creates public schema tables:
-- profiles, workspaces, workspace_members, invitations, connected_accounts,
-- csv_datasets, sync_configurations, field_mappings, record_links, sync_runs,
-- sync_events, sync_errors, plans, subscriptions, usage_counters, audit_logs.
--
-- Includes:
-- - Primary keys and foreign keys with CASCADE behaviors
-- - Timestamps (created_at, updated_at)
-- - Indexes on workspace_id and foreign keys
-- - Row Level Security (RLS) on all tenant tables
-- - Service role bypass support
-- - Automatic new user onboarding trigger
-- - Seeding for Free, Starter, Pro, and Business plans with limits
-- ==============================================================================

-- 0. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. PROFILES TABLE (Linked to auth.users)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  theme_preference TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- ==============================================================================
-- 2. PLANS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.plans (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price_monthly_cents INT NOT NULL DEFAULT 0,
  price_annual_monthly_cents INT NOT NULL DEFAULT 0,
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed plans
INSERT INTO public.plans (id, key, name, price_monthly_cents, price_annual_monthly_cents, limits)
VALUES
  (
    'plan_free',
    'free',
    'Free',
    0,
    0,
    '{"maxRecords": 500, "maxActiveSyncs": 2, "minIntervalMinutes": 60, "premiumConnectors": false, "teamSeats": 1, "logRetentionDays": 7, "realtime": false}'::jsonb
  ),
  (
    'plan_starter',
    'starter',
    'Starter',
    1900,
    1500,
    '{"maxRecords": 5000, "maxActiveSyncs": 5, "minIntervalMinutes": 15, "premiumConnectors": true, "teamSeats": 2, "logRetentionDays": 30, "realtime": false}'::jsonb
  ),
  (
    'plan_pro',
    'pro',
    'Pro',
    4900,
    3900,
    '{"maxRecords": 25000, "maxActiveSyncs": 20, "minIntervalMinutes": 5, "premiumConnectors": true, "teamSeats": 5, "logRetentionDays": 90, "realtime": true}'::jsonb
  ),
  (
    'plan_business',
    'business',
    'Business',
    12900,
    9900,
    '{"maxRecords": 100000, "maxActiveSyncs": 75, "minIntervalMinutes": 1, "premiumConnectors": true, "teamSeats": 15, "logRetentionDays": 180, "realtime": true}'::jsonb
  )
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  price_monthly_cents = EXCLUDED.price_monthly_cents,
  price_annual_monthly_cents = EXCLUDED.price_annual_monthly_cents,
  limits = EXCLUDED.limits,
  updated_at = now();

-- ==============================================================================
-- 3. WORKSPACES TABLE (Tenant Root)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.workspaces (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  plan_id TEXT NOT NULL REFERENCES public.plans(id) DEFAULT 'plan_pro',
  trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id ON public.workspaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON public.workspaces(slug);

-- ==============================================================================
-- 4. WORKSPACE MEMBERS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_workspace_member_user UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_ws ON public.workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON public.workspace_members(user_id);

-- ==============================================================================
-- 5. INVITATIONS TABLE (Teammate Invites)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.invitations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitations_ws ON public.invitations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations(token);

-- ==============================================================================
-- 6. CONNECTED ACCOUNTS TABLE (Encrypted OAuth Tokens)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.connected_accounts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connector_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  external_account_id TEXT,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT,
  key_version TEXT NOT NULL DEFAULT 'v1',
  scopes TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'needs_reconnect', 'revoked')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_connected_accounts_ws ON public.connected_accounts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_connector ON public.connected_accounts(workspace_id, connector_key);

-- ==============================================================================
-- 7. CSV DATASETS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.csv_datasets (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  row_count INT NOT NULL DEFAULT 0,
  columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  records JSONB NOT NULL DEFAULT '[]'::jsonb,
  storage_path TEXT,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_csv_datasets_ws ON public.csv_datasets(workspace_id);

-- ==============================================================================
-- 8. SYNC CONFIGURATIONS TABLE (Pipelines)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.sync_configurations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'csv',
  source_dataset_id TEXT REFERENCES public.csv_datasets(id) ON DELETE SET NULL,
  destination_type TEXT NOT NULL DEFAULT 'google_sheets',
  destination_account_id TEXT REFERENCES public.connected_accounts(id) ON DELETE SET NULL,
  destination_resource_id TEXT,
  destination_resource_name TEXT,
  direction TEXT NOT NULL DEFAULT 'a_to_b' CHECK (direction IN ('a_to_b', 'b_to_a', 'two_way')),
  conflict_rule TEXT NOT NULL DEFAULT 'source_wins' CHECK (conflict_rule IN ('source_wins', 'destination_wins', 'newest_wins', 'manual')),
  trigger_mode TEXT NOT NULL DEFAULT 'manual' CHECK (trigger_mode IN ('manual', 'scheduled', 'webhook')),
  interval_minutes INT NOT NULL DEFAULT 15,
  delete_behavior TEXT NOT NULL DEFAULT 'ignore' CHECK (delete_behavior IN ('ignore', 'soft_delete', 'hard_delete')),
  filters JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'error')),
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_configurations_ws ON public.sync_configurations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sync_configurations_status ON public.sync_configurations(workspace_id, status);

-- ==============================================================================
-- 9. FIELD MAPPINGS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.field_mappings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sync_configuration_id TEXT NOT NULL REFERENCES public.sync_configurations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_field_key TEXT NOT NULL,
  destination_field_key TEXT NOT NULL,
  transform JSONB DEFAULT '{}'::jsonb,
  default_value JSONB,
  is_key BOOLEAN NOT NULL DEFAULT false,
  required BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_field_mappings_ws ON public.field_mappings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_field_mappings_sync ON public.field_mappings(sync_configuration_id);

-- ==============================================================================
-- 10. RECORD LINKS TABLE (Identity correlation & change hash tracking)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.record_links (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sync_configuration_id TEXT NOT NULL REFERENCES public.sync_configurations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_external_id TEXT NOT NULL,
  destination_external_id TEXT NOT NULL,
  last_synced_hash TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_deleted BOOLEAN NOT NULL DEFAULT false,
  destination_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_record_links_sync_src UNIQUE (sync_configuration_id, source_external_id)
);

CREATE INDEX IF NOT EXISTS idx_record_links_ws ON public.record_links(workspace_id);
CREATE INDEX IF NOT EXISTS idx_record_links_sync ON public.record_links(sync_configuration_id);
CREATE INDEX IF NOT EXISTS idx_record_links_src_id ON public.record_links(sync_configuration_id, source_external_id);

-- ==============================================================================
-- 11. SYNC RUNS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.sync_runs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sync_configuration_id TEXT NOT NULL REFERENCES public.sync_configurations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual', 'schedule', 'webhook', 'api', 'dry_run')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled')),
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

CREATE INDEX IF NOT EXISTS idx_sync_runs_ws ON public.sync_runs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sync_runs_sync ON public.sync_runs(sync_configuration_id);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON public.sync_runs(started_at DESC);

-- ==============================================================================
-- 12. SYNC EVENTS TABLE (Audit Trail)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.sync_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sync_run_id TEXT NOT NULL REFERENCES public.sync_runs(id) ON DELETE CASCADE,
  sync_configuration_id TEXT NOT NULL REFERENCES public.sync_configurations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  record_link_id TEXT REFERENCES public.record_links(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'skip', 'conflict')),
  side TEXT NOT NULL DEFAULT 'B',
  status TEXT NOT NULL DEFAULT 'succeeded' CHECK (status IN ('succeeded', 'failed', 'pending')),
  idempotency_key TEXT NOT NULL,
  before JSONB,
  after JSONB,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_events_ws ON public.sync_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sync_events_run ON public.sync_events(sync_run_id);
CREATE INDEX IF NOT EXISTS idx_sync_events_idem ON public.sync_events(idempotency_key);

-- ==============================================================================
-- 13. SYNC ERRORS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.sync_errors (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sync_run_id TEXT NOT NULL REFERENCES public.sync_runs(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_sync_errors_ws ON public.sync_errors(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sync_errors_run ON public.sync_errors(sync_run_id);
CREATE INDEX IF NOT EXISTS idx_sync_errors_resolved ON public.sync_errors(workspace_id, is_resolved);

-- ==============================================================================
-- 14. SUBSCRIPTIONS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.plans(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled')),
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_subscriptions_ws UNIQUE (workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_ws ON public.subscriptions(workspace_id);

-- ==============================================================================
-- 15. USAGE COUNTERS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.usage_counters (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  records_synced BIGINT NOT NULL DEFAULT 0,
  runs_count INT NOT NULL DEFAULT 0,
  active_syncs_peak INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_counters_ws ON public.usage_counters(workspace_id);

-- ==============================================================================
-- 16. AUDIT LOGS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_ws ON public.audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(workspace_id, created_at DESC);


-- ==============================================================================
-- COMPATIBILITY VIEWS (Supports legacy view references)
-- ==============================================================================
CREATE OR REPLACE VIEW public.sync_configs AS
  SELECT
    id,
    workspace_id,
    name,
    source_type,
    source_dataset_id,
    destination_type,
    destination_account_id,
    destination_resource_id,
    destination_resource_name,
    direction,
    conflict_rule,
    trigger_mode,
    interval_minutes,
    delete_behavior,
    filters,
    status,
    last_run_at,
    next_run_at,
    created_by,
    created_at,
    updated_at
  FROM public.sync_configurations;

CREATE OR REPLACE VIEW public.workspace_invitations AS
  SELECT
    id,
    workspace_id,
    email,
    role,
    invited_by,
    token,
    status,
    expires_at,
    created_at,
    updated_at
  FROM public.invitations;


-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- 1. Helper function to check workspace membership without recursion
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id
      AND user_id = auth.uid()
  );
$$;

-- 2. Helper function to check admin/owner role
CREATE OR REPLACE FUNCTION public.is_workspace_admin_or_owner(ws_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;

-- Enable RLS on every table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connected_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.csv_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.record_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Clean existing policies before creating new ones
DROP POLICY IF EXISTS "Profiles read own or team" ON public.profiles;
DROP POLICY IF EXISTS "Profiles update own" ON public.profiles;
DROP POLICY IF EXISTS "Profiles insert own" ON public.profiles;
DROP POLICY IF EXISTS "Plans read public" ON public.plans;
DROP POLICY IF EXISTS "Workspaces member select" ON public.workspaces;
DROP POLICY IF EXISTS "Workspaces user insert" ON public.workspaces;
DROP POLICY IF EXISTS "Workspaces admin update" ON public.workspaces;
DROP POLICY IF EXISTS "Workspaces owner delete" ON public.workspaces;
DROP POLICY IF EXISTS "Members member select" ON public.workspace_members;
DROP POLICY IF EXISTS "Members admin insert" ON public.workspace_members;
DROP POLICY IF EXISTS "Members admin update" ON public.workspace_members;
DROP POLICY IF EXISTS "Members admin delete" ON public.workspace_members;

DROP POLICY IF EXISTS "Invitations select" ON public.invitations;
DROP POLICY IF EXISTS "Invitations insert" ON public.invitations;
DROP POLICY IF EXISTS "Invitations update" ON public.invitations;
DROP POLICY IF EXISTS "Invitations delete" ON public.invitations;

DROP POLICY IF EXISTS "Connected accounts select" ON public.connected_accounts;
DROP POLICY IF EXISTS "Connected accounts insert" ON public.connected_accounts;
DROP POLICY IF EXISTS "Connected accounts update" ON public.connected_accounts;
DROP POLICY IF EXISTS "Connected accounts delete" ON public.connected_accounts;

DROP POLICY IF EXISTS "Csv datasets select" ON public.csv_datasets;
DROP POLICY IF EXISTS "Csv datasets insert" ON public.csv_datasets;
DROP POLICY IF EXISTS "Csv datasets update" ON public.csv_datasets;
DROP POLICY IF EXISTS "Csv datasets delete" ON public.csv_datasets;

DROP POLICY IF EXISTS "Sync configurations select" ON public.sync_configurations;
DROP POLICY IF EXISTS "Sync configurations insert" ON public.sync_configurations;
DROP POLICY IF EXISTS "Sync configurations update" ON public.sync_configurations;
DROP POLICY IF EXISTS "Sync configurations delete" ON public.sync_configurations;

DROP POLICY IF EXISTS "Field mappings select" ON public.field_mappings;
DROP POLICY IF EXISTS "Field mappings insert" ON public.field_mappings;
DROP POLICY IF EXISTS "Field mappings update" ON public.field_mappings;
DROP POLICY IF EXISTS "Field mappings delete" ON public.field_mappings;

DROP POLICY IF EXISTS "Record links select" ON public.record_links;
DROP POLICY IF EXISTS "Record links insert" ON public.record_links;
DROP POLICY IF EXISTS "Record links update" ON public.record_links;
DROP POLICY IF EXISTS "Record links delete" ON public.record_links;

DROP POLICY IF EXISTS "Sync runs select" ON public.sync_runs;
DROP POLICY IF EXISTS "Sync runs insert" ON public.sync_runs;
DROP POLICY IF EXISTS "Sync runs update" ON public.sync_runs;
DROP POLICY IF EXISTS "Sync runs delete" ON public.sync_runs;

DROP POLICY IF EXISTS "Sync events select" ON public.sync_events;
DROP POLICY IF EXISTS "Sync events insert" ON public.sync_events;

DROP POLICY IF EXISTS "Sync errors select" ON public.sync_errors;
DROP POLICY IF EXISTS "Sync errors insert" ON public.sync_errors;
DROP POLICY IF EXISTS "Sync errors update" ON public.sync_errors;

DROP POLICY IF EXISTS "Subscriptions select" ON public.subscriptions;
DROP POLICY IF EXISTS "Subscriptions modify" ON public.subscriptions;

DROP POLICY IF EXISTS "Usage counters select" ON public.usage_counters;
DROP POLICY IF EXISTS "Usage counters modify" ON public.usage_counters;

DROP POLICY IF EXISTS "Audit logs select" ON public.audit_logs;
DROP POLICY IF EXISTS "Audit logs insert" ON public.audit_logs;

-- PROFILES
CREATE POLICY "Profiles read own or team" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.workspace_members m1
      JOIN public.workspace_members m2 ON m1.workspace_id = m2.workspace_id
      WHERE m1.user_id = auth.uid() AND m2.user_id = profiles.id
    )
  );

CREATE POLICY "Profiles update own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Profiles insert own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- PLANS (Readable by authenticated and anon users)
CREATE POLICY "Plans read public" ON public.plans
  FOR SELECT USING (true);

-- WORKSPACES
CREATE POLICY "Workspaces member select" ON public.workspaces
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(id) OR owner_id = auth.uid());

CREATE POLICY "Workspaces user insert" ON public.workspaces
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Workspaces admin update" ON public.workspaces
  FOR UPDATE TO authenticated
  USING (public.is_workspace_admin_or_owner(id) OR owner_id = auth.uid());

CREATE POLICY "Workspaces owner delete" ON public.workspaces
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- WORKSPACE MEMBERS
CREATE POLICY "Members member select" ON public.workspace_members
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Members admin insert" ON public.workspace_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_workspace_admin_or_owner(workspace_id));

CREATE POLICY "Members admin update" ON public.workspace_members
  FOR UPDATE TO authenticated
  USING (public.is_workspace_admin_or_owner(workspace_id));

CREATE POLICY "Members admin delete" ON public.workspace_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_workspace_admin_or_owner(workspace_id));

-- INVITATIONS
CREATE POLICY "Invitations select" ON public.invitations
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Invitations insert" ON public.invitations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_admin_or_owner(workspace_id));

CREATE POLICY "Invitations update" ON public.invitations
  FOR UPDATE TO authenticated
  USING (public.is_workspace_admin_or_owner(workspace_id));

CREATE POLICY "Invitations delete" ON public.invitations
  FOR DELETE TO authenticated
  USING (public.is_workspace_admin_or_owner(workspace_id));

-- CONNECTED ACCOUNTS
CREATE POLICY "Connected accounts select" ON public.connected_accounts
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Connected accounts insert" ON public.connected_accounts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Connected accounts update" ON public.connected_accounts
  FOR UPDATE TO authenticated
  USING (public.is_workspace_admin_or_owner(workspace_id));

CREATE POLICY "Connected accounts delete" ON public.connected_accounts
  FOR DELETE TO authenticated
  USING (public.is_workspace_admin_or_owner(workspace_id));

-- CSV DATASETS
CREATE POLICY "Csv datasets select" ON public.csv_datasets
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Csv datasets insert" ON public.csv_datasets
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Csv datasets update" ON public.csv_datasets
  FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Csv datasets delete" ON public.csv_datasets
  FOR DELETE TO authenticated
  USING (public.is_workspace_admin_or_owner(workspace_id));

-- SYNC CONFIGURATIONS
CREATE POLICY "Sync configurations select" ON public.sync_configurations
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Sync configurations insert" ON public.sync_configurations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Sync configurations update" ON public.sync_configurations
  FOR UPDATE TO authenticated
  USING (public.is_workspace_admin_or_owner(workspace_id));

CREATE POLICY "Sync configurations delete" ON public.sync_configurations
  FOR DELETE TO authenticated
  USING (public.is_workspace_admin_or_owner(workspace_id));

-- FIELD MAPPINGS
CREATE POLICY "Field mappings select" ON public.field_mappings
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Field mappings insert" ON public.field_mappings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Field mappings update" ON public.field_mappings
  FOR UPDATE TO authenticated
  USING (public.is_workspace_admin_or_owner(workspace_id));

CREATE POLICY "Field mappings delete" ON public.field_mappings
  FOR DELETE TO authenticated
  USING (public.is_workspace_admin_or_owner(workspace_id));

-- RECORD LINKS
CREATE POLICY "Record links select" ON public.record_links
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Record links insert" ON public.record_links
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Record links update" ON public.record_links
  FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Record links delete" ON public.record_links
  FOR DELETE TO authenticated
  USING (public.is_workspace_admin_or_owner(workspace_id));

-- SYNC RUNS
CREATE POLICY "Sync runs select" ON public.sync_runs
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Sync runs insert" ON public.sync_runs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Sync runs update" ON public.sync_runs
  FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Sync runs delete" ON public.sync_runs
  FOR DELETE TO authenticated
  USING (public.is_workspace_admin_or_owner(workspace_id));

-- SYNC EVENTS
CREATE POLICY "Sync events select" ON public.sync_events
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Sync events insert" ON public.sync_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

-- SYNC ERRORS
CREATE POLICY "Sync errors select" ON public.sync_errors
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Sync errors insert" ON public.sync_errors
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Sync errors update" ON public.sync_errors
  FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id));

-- SUBSCRIPTIONS
CREATE POLICY "Subscriptions select" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Subscriptions modify" ON public.subscriptions
  FOR ALL TO authenticated
  USING (public.is_workspace_admin_or_owner(workspace_id));

-- USAGE COUNTERS
CREATE POLICY "Usage counters select" ON public.usage_counters
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Usage counters modify" ON public.usage_counters
  FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id));

-- AUDIT LOGS
CREATE POLICY "Audit logs select" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Audit logs insert" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));


-- ==============================================================================
-- AUTOMATIC NEW USER ONBOARDING TRIGGER
-- When a new user signs up in Supabase Auth:
-- 1. Create their user row in public.profiles
-- 2. Create their default empty workspace (with 14-day Pro trial)
-- 3. Add them as 'owner' in public.workspace_members
-- 4. Create active subscription with 14-day Pro trial
-- 5. Initialize usage counters
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_ws_id TEXT;
  user_full_name TEXT;
BEGIN
  user_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- 1. Insert or update user profile
  INSERT INTO public.profiles (id, email, name, avatar_url, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    user_full_name,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    name = COALESCE(EXCLUDED.name, profiles.name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
    updated_at = now();

  -- 2. Create empty workspace with 14-day Pro trial
  new_ws_id := 'ws_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16);
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
    'workspace-' || substr(NEW.id::text, 1, 8),
    NEW.id,
    'plan_pro',
    now() + interval '14 days',
    now(),
    now()
  );

  -- 3. Add user as Owner in workspace_members
  INSERT INTO public.workspace_members (
    id,
    workspace_id,
    user_id,
    role,
    created_at,
    updated_at
  )
  VALUES (
    'mem_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16),
    new_ws_id,
    NEW.id,
    'owner',
    now(),
    now()
  );

  -- 4. Create 14-day Pro subscription
  INSERT INTO public.subscriptions (
    id,
    workspace_id,
    plan_id,
    status,
    trial_ends_at,
    current_period_end,
    cancel_at_period_end,
    created_at,
    updated_at
  )
  VALUES (
    'sub_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16),
    new_ws_id,
    'plan_pro',
    'trialing',
    now() + interval '14 days',
    now() + interval '14 days',
    false,
    now(),
    now()
  );

  -- 5. Initialize usage counter
  INSERT INTO public.usage_counters (
    id,
    workspace_id,
    period_start,
    period_end,
    records_synced,
    runs_count,
    active_syncs_peak,
    created_at,
    updated_at
  )
  VALUES (
    'use_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16),
    new_ws_id,
    now(),
    now() + interval '30 days',
    0,
    0,
    0,
    now(),
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
