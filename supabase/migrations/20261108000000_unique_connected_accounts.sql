-- Migration: Add Unique Constraint to public.connected_accounts
-- Description: Enforces that each Google/OAuth account (email) can only have ONE connection per workspace.
-- NOTE: Do NOT run this migration until duplicate rows for the same (workspace_id, connector_key, external_account_id)
-- have been removed, otherwise PostgreSQL will fail with:
-- ERROR: duplicate key value violates unique constraint.

-- In the database schema, the provider column is "connector_key" and the account email column is "external_account_id":
ALTER TABLE public.connected_accounts
ADD CONSTRAINT uq_connected_accounts_workspace_provider_email
UNIQUE (workspace_id, connector_key, external_account_id);

-- Optional: If column aliases "provider" and "account_email" are preferred:
-- ALTER TABLE public.connected_accounts ADD COLUMN IF NOT EXISTS provider TEXT GENERATED ALWAYS AS (connector_key) STORED;
-- ALTER TABLE public.connected_accounts ADD COLUMN IF NOT EXISTS account_email TEXT GENERATED ALWAYS AS (external_account_id) STORED;
-- ALTER TABLE public.connected_accounts ADD CONSTRAINT uq_connected_accounts_workspace_provider_email UNIQUE (workspace_id, provider, account_email);
