-- Provider-neutral operational audit for actual integration reads and sync jobs.
-- Apply with `npm run integration-audit:migrate` before deploying writers/readers.
CREATE TABLE IF NOT EXISTS portal_integration_runs (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL CHECK (char_length(source) BETWEEN 1 AND 64),
  operation TEXT NOT NULL CHECK (char_length(operation) BETWEEN 1 AND 64),
  environment TEXT NOT NULL CHECK (char_length(environment) BETWEEN 1 AND 32),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('request', 'scheduled', 'manual', 'webhook')),
  request_id UUID NOT NULL UNIQUE,
  connector_version TEXT CHECK (connector_version IS NULL OR char_length(connector_version) <= 32),
  actor_user_id BIGINT REFERENCES portal_users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  source_window_start TIMESTAMPTZ,
  source_window_end TIMESTAMPTZ,
  records_processed INTEGER NOT NULL DEFAULT 0 CHECK (records_processed >= 0),
  records_read INTEGER NOT NULL DEFAULT 0 CHECK (records_read >= 0),
  records_written INTEGER NOT NULL DEFAULT 0 CHECK (records_written >= 0),
  records_skipped INTEGER NOT NULL DEFAULT 0 CHECK (records_skipped >= 0),
  records_failed INTEGER NOT NULL DEFAULT 0 CHECK (records_failed >= 0),
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  retry_state TEXT NOT NULL DEFAULT 'none' CHECK (retry_state IN ('none', 'recovered', 'exhausted')),
  source_timestamp TIMESTAMPTZ,
  error_code TEXT CHECK (error_code IS NULL OR char_length(error_code) BETWEEN 1 AND 64),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  CONSTRAINT portal_integration_runs_finished_check CHECK (
    (status = 'running' AND finished_at IS NULL)
    OR (status <> 'running' AND finished_at IS NOT NULL)
  ),
  CONSTRAINT portal_integration_runs_window_check CHECK (
    source_window_start IS NULL OR source_window_end IS NULL OR source_window_end >= source_window_start
  )
);

CREATE INDEX IF NOT EXISTS portal_integration_runs_started_idx
  ON portal_integration_runs (started_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS portal_integration_runs_source_started_idx
  ON portal_integration_runs (source, started_at DESC);
