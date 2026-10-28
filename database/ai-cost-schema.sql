-- Client-portal accounting only. Apply after admin-audit; no existing rows changed.
CREATE TABLE IF NOT EXISTS portal_ai_cost_state (
  id INTEGER PRIMARY KEY CHECK (id=1),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO portal_ai_cost_state(id) VALUES(1) ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS portal_ai_cost_events (
  event_key TEXT PRIMARY KEY CHECK (char_length(event_key) BETWEEN 1 AND 200),
  request_id UUID NOT NULL,
  client_id BIGINT REFERENCES portal_clients(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (provider IN ('openai','openrouter')),
  model TEXT NOT NULL CHECK (char_length(model) BETWEEN 1 AND 200),
  kind TEXT NOT NULL CHECK (kind IN ('chat','image','hosted_tool','indexing','unreported')),
  status TEXT NOT NULL CHECK (status IN ('succeeded','failed','cancelled')),
  basis TEXT NOT NULL CHECK (basis IN ('reported','estimated','unknown')),
  amount_usd NUMERIC(24,12),
  input_tokens BIGINT CHECK (input_tokens >= 0),
  output_tokens BIGINT CHECK (output_tokens >= 0),
  cached_tokens BIGINT CHECK (cached_tokens >= 0),
  reason TEXT NOT NULL CHECK (char_length(reason) <= 120),
  pricing_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT portal_ai_cost_amount_known CHECK (
    (basis='unknown' AND amount_usd IS NULL)
    OR (basis IN ('reported','estimated') AND amount_usd >= 0 AND amount_usd < 1000000000
        AND amount_usd IS NOT NULL)
  ),
  CONSTRAINT portal_ai_cost_snapshot_object CHECK (
    jsonb_typeof(pricing_snapshot)='object' AND octet_length(pricing_snapshot::text) <= 8192)
);
CREATE INDEX IF NOT EXISTS portal_ai_cost_client_time_idx
  ON portal_ai_cost_events(client_id,occurred_at);
CREATE INDEX IF NOT EXISTS portal_ai_cost_request_idx ON portal_ai_cost_events(request_id);
