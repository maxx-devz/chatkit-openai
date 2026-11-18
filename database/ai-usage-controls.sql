BEGIN;
-- Clear report visibility only. No conversations, provider charges or credit entries are deleted.
ALTER TABLE portal_ai_usage_events
  ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cleared_by BIGINT REFERENCES portal_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS clear_operation UUID;
ALTER TABLE portal_ai_cost_events
  ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cleared_by BIGINT REFERENCES portal_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS clear_operation UUID;
-- Reporting reset boundary, separate from provider invoices and assigned allowances.
CREATE TABLE IF NOT EXISTS portal_ai_usage_resets (
  client_id BIGINT NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period='all' OR period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  reset_before TIMESTAMPTZ NOT NULL,
  operation_id UUID NOT NULL,
  actor_user_id BIGINT REFERENCES portal_users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(client_id,period)
);
COMMIT;
