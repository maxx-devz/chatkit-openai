BEGIN;
SET LOCAL search_path = public, pg_temp;
-- Anonymous operational totals; independent of resettable client allowances.
-- No prompts, account identifiers, credentials, or estimated billing amounts.
CREATE TABLE IF NOT EXISTS portal_ai_activity_monthly (
  source TEXT NOT NULL CHECK (source IN ('client', 'admin', 'preview')),
  period_start DATE NOT NULL,
  runs BIGINT NOT NULL DEFAULT 0 CHECK (runs >= 0),
  reported_runs BIGINT NOT NULL DEFAULT 0 CHECK (reported_runs >= 0 AND reported_runs <= runs),
  input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  total_tokens BIGINT NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  first_recorded_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source, period_start)
);
-- Last observed admin API outcome for a configured credential. No raw key or
-- provider error text is stored, and a key change starts a separate status.
CREATE TABLE IF NOT EXISTS portal_ai_provider_status (
  credential_hash TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  model TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL
);
COMMIT;
