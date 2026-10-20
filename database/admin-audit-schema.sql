-- Apply after client-access, admin, and integration-audit migrations.
-- No prompts, replies, credentials, raw provider payloads, or arbitrary metadata.
CREATE TABLE IF NOT EXISTS portal_audit_events (
  id BIGSERIAL PRIMARY KEY,
  audience TEXT NOT NULL CHECK (audience IN ('client', 'aoc_admin')),
  client_id BIGINT REFERENCES portal_clients(id) ON DELETE SET NULL,
  actor_user_id BIGINT REFERENCES portal_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action ~ '^[a-z][a-z0-9_.]{0,63}$'),
  target_type TEXT NOT NULL CHECK (target_type ~ '^[a-z][a-z0-9_]{0,31}$'),
  target_id TEXT CHECK (target_id IS NULL OR char_length(target_id) <= 80),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS portal_audit_events_audience_time_idx
  ON portal_audit_events (audience, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS portal_audit_events_client_time_idx
  ON portal_audit_events (client_id, occurred_at DESC, id DESC) WHERE audience='client';

-- One row per user-initiated AI action; token counts are provider-reported only.
CREATE TABLE IF NOT EXISTS portal_ai_usage_events (
  request_id UUID PRIMARY KEY,
  client_id BIGINT REFERENCES portal_clients(id) ON DELETE SET NULL,
  actor_user_id BIGINT REFERENCES portal_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('client_ai.reply', 'admin_ai.reply', 'builder.preview')),
  provider TEXT CHECK (provider IS NULL OR char_length(provider) <= 64),
  model TEXT CHECK (model IS NULL OR char_length(model) <= 120),
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed', 'cancelled')),
  input_tokens BIGINT CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens BIGINT CHECK (output_tokens IS NULL OR output_tokens >= 0),
  total_tokens BIGINT CHECK (total_tokens IS NULL OR total_tokens >= 0),
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT portal_ai_usage_tokens_reported CHECK (
    (input_tokens IS NULL AND output_tokens IS NULL AND total_tokens IS NULL)
    OR (input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND total_tokens IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS portal_ai_usage_events_time_idx
  ON portal_ai_usage_events (started_at DESC, request_id DESC);
CREATE INDEX IF NOT EXISTS portal_ai_usage_events_client_time_idx
  ON portal_ai_usage_events (client_id, started_at DESC, request_id DESC);

ALTER TABLE portal_integration_runs
  ADD COLUMN IF NOT EXISTS portal_area TEXT NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS client_id BIGINT REFERENCES portal_clients(id) ON DELETE SET NULL;
ALTER TABLE portal_integration_runs
  DROP CONSTRAINT IF EXISTS portal_integration_runs_area_check;
ALTER TABLE portal_integration_runs
  ADD CONSTRAINT portal_integration_runs_area_check
  CHECK (portal_area IN ('internal', 'client_portal', 'aoc_admin'));
CREATE INDEX IF NOT EXISTS portal_integration_runs_area_time_idx
  ON portal_integration_runs (portal_area, started_at DESC, id DESC);
