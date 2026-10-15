-- Shared, portable PostgreSQL read-through cache for approved Internal Portal data.
-- Provider records remain authoritative. Apply with `npm run internal-sync:migrate`.
CREATE TABLE IF NOT EXISTS portal_internal_sync_settings (
  feed_key TEXT PRIMARY KEY CHECK (feed_key IN ('personal_work', 'team_roster', 'team_status', 'hr_records')),
  interval_minutes INTEGER NOT NULL CHECK (interval_minutes BETWEEN 1 AND 1440),
  updated_by BIGINT REFERENCES portal_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portal_internal_sync_settings_audit (
  id BIGSERIAL PRIMARY KEY,
  feed_key TEXT NOT NULL,
  old_minutes INTEGER NOT NULL,
  new_minutes INTEGER NOT NULL,
  actor_user_id BIGINT REFERENCES portal_users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS portal_internal_sync_settings_audit_changed_idx
  ON portal_internal_sync_settings_audit (changed_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS portal_internal_sync_snapshots (
  cache_key TEXT PRIMARY KEY CHECK (char_length(cache_key) = 64),
  feed_key TEXT NOT NULL CHECK (feed_key IN ('personal_work', 'team_roster', 'team_status', 'hr_records')),
  payload JSONB,
  refreshed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  refresh_claim UUID,
  refresh_until TIMESTAMPTZ,
  CONSTRAINT portal_internal_sync_snapshots_payload_check CHECK (
    (payload IS NULL AND refreshed_at IS NULL AND expires_at IS NULL)
    OR (payload IS NOT NULL AND refreshed_at IS NOT NULL AND expires_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS portal_internal_sync_snapshots_feed_idx
  ON portal_internal_sync_snapshots (feed_key, refreshed_at DESC);
CREATE INDEX IF NOT EXISTS portal_internal_sync_snapshots_expiry_idx
  ON portal_internal_sync_snapshots (expires_at);
