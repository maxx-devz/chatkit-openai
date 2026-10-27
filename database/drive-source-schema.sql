-- Isolated, admin-private Google Drive connection test. No client publication.
BEGIN;
CREATE TABLE IF NOT EXISTS portal_drive_source_connections (
  owner_id BIGINT PRIMARY KEY REFERENCES portal_users(id) ON DELETE CASCADE,
  google_email TEXT NOT NULL,
  google_subject TEXT NOT NULL,
  oauth_client_id TEXT NOT NULL,
  root_folder_id TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS portal_drive_source_oauth_states (
  state_hash TEXT PRIMARY KEY,
  owner_id BIGINT NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL,
  encrypted_verifier TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS portal_drive_source_oauth_expiry_idx
  ON portal_drive_source_oauth_states(expires_at);
COMMIT;
