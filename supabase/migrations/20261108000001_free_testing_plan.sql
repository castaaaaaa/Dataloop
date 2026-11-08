-- Migration: Free (testing) Plan
-- Description: Updates the free plan to "Free (testing)" with 3 syncs and 1,000 records limit,
-- and updates all workspaces to Free (testing) with no trial.

-- 1. Update plan_free definition
UPDATE public.plans
SET 
  name = 'Free (testing)',
  limits = jsonb_build_object(
    'maxRecords', 1000,
    'maxActiveSyncs', 3,
    'minIntervalMinutes', 15,
    'premiumConnectors', true,
    'teamSeats', 5,
    'logRetentionDays', 30,
    'realtime', true
  ),
  updated_at = now()
WHERE id = 'plan_free';

-- 2. Update existing workspaces to Free (testing) and remove trial
UPDATE public.workspaces
SET 
  plan_id = 'plan_free',
  trial_ends_at = NULL,
  updated_at = now();

-- 3. Set default plan for any new workspaces
ALTER TABLE public.workspaces ALTER COLUMN plan_id SET DEFAULT 'plan_free';
