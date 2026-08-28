-- Optional AOC administrator extension for the client portal.
--
-- Run this file in the Neon SQL Editor only after database/schema.sql.
-- Authentication credentials do not belong in this table. Better Auth owns
-- usernames and salted scrypt password hashes in its generated auth tables.

CREATE TABLE IF NOT EXISTS portal_admins (
  user_id BIGINT PRIMARY KEY REFERENCES portal_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'aoc_admin',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT portal_admins_role
    CHECK (role IN ('aoc_admin', 'aoc_owner'))
);

CREATE INDEX IF NOT EXISTS portal_admins_active_role_idx
  ON portal_admins (is_active, role);

-- Client-level portal and AI controls. Re-running this file safely adds the
-- columns to databases created before the administrator portal existed.
ALTER TABLE portal_clients
  ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS monthly_prompt_limit INTEGER NOT NULL DEFAULT 150;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'portal_clients_monthly_prompt_limit'
  ) THEN
    ALTER TABLE portal_clients
      ADD CONSTRAINT portal_clients_monthly_prompt_limit
      CHECK (monthly_prompt_limit BETWEEN 1 AND 100000);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS portal_ai_usage_monthly (
  client_id BIGINT NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  requests_used INTEGER NOT NULL DEFAULT 0,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  total_tokens BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, period_start),
  CONSTRAINT portal_ai_usage_requests_nonnegative CHECK (requests_used >= 0),
  CONSTRAINT portal_ai_usage_tokens_nonnegative CHECK (
    input_tokens >= 0 AND output_tokens >= 0 AND total_tokens >= 0
  )
);

CREATE INDEX IF NOT EXISTS portal_ai_usage_period_idx
  ON portal_ai_usage_monthly (period_start DESC, client_id);

-- This table prepares the authorization data for a future /admin portal.
-- Every admin route must verify the signed-in Better Auth user and an active
-- portal_admins row on the server.
