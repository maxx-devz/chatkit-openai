-- Reporting only: no payments, prepaid wallet, or AI access gate.
CREATE TABLE IF NOT EXISTS portal_ai_credit_pricing (
  id BIGSERIAL PRIMARY KEY,
  pricing_type TEXT NOT NULL CHECK (pricing_type IN ('fixed','percentage')),
  aoc_fee NUMERIC(24,12) NOT NULL CHECK (aoc_fee>=0 AND aoc_fee<=1000000),
  credits_per_usd NUMERIC(24,12) NOT NULL CHECK (credits_per_usd>0 AND credits_per_usd<=1000000),
  effective_period TEXT NOT NULL CHECK (effective_period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  created_by TEXT NOT NULL,
  request_key UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (pricing_type<>'percentage' OR aoc_fee<=1000)
);
CREATE INDEX IF NOT EXISTS portal_ai_credit_pricing_period ON portal_ai_credit_pricing(effective_period,id DESC);
CREATE TABLE IF NOT EXISTS portal_ai_credit_periods (
  client_id BIGINT NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  pricing_id BIGINT NOT NULL REFERENCES portal_ai_credit_pricing(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(client_id,period)
);
CREATE TABLE IF NOT EXISTS portal_ai_credit_entries (
  entry_key TEXT PRIMARY KEY CHECK (char_length(entry_key)<=320),
  client_id BIGINT REFERENCES portal_clients(id) ON DELETE SET NULL,
  period TEXT NOT NULL CHECK (period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  kind TEXT NOT NULL CHECK (kind IN ('usage','fixed_fee','allocation','adjustment')),
  source_event_key TEXT UNIQUE REFERENCES portal_ai_cost_events(event_key),
  pricing_id BIGINT REFERENCES portal_ai_credit_pricing(id),
  credits NUMERIC(30,12),
  api_cost_usd NUMERIC(24,12),
  aoc_fee_usd NUMERIC(24,12),
  basis TEXT NOT NULL CHECK (basis IN ('reported','estimated','unknown','manual')),
  actor_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((kind IN ('allocation','adjustment') AND credits IS NOT NULL AND basis='manual')
    OR (kind IN ('usage','fixed_fee') AND pricing_id IS NOT NULL)),
  CHECK (credits IS NULL OR abs(credits)<1000000000000000000),
  CHECK (api_cost_usd IS NULL OR api_cost_usd>=0),
  CHECK (aoc_fee_usd IS NULL OR aoc_fee_usd>=0)
);
CREATE INDEX IF NOT EXISTS portal_ai_credit_entries_client_period
  ON portal_ai_credit_entries(client_id,period,recorded_at DESC);
-- Additive audit context. Existing entries are preserved with an unknown reason.
ALTER TABLE portal_ai_credit_entries ADD COLUMN IF NOT EXISTS reason TEXT
  CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 300);
