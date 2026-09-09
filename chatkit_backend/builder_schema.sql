BEGIN;
SET LOCAL search_path = public, pg_temp;
CREATE TABLE IF NOT EXISTS portal_assistant_configs (
  client_id BIGINT PRIMARY KEY REFERENCES portal_clients(id) ON DELETE CASCADE,
  draft JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  base_fingerprint TEXT NOT NULL,
  published JSONB,
  published_version INTEGER NOT NULL DEFAULT 0,
  updated_by BIGINT REFERENCES portal_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS portal_assistant_versions (
  client_id BIGINT NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  config JSONB NOT NULL,
  published_by BIGINT REFERENCES portal_users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, version)
);
CREATE TABLE IF NOT EXISTS portal_assistant_tool_usage (
  client_id BIGINT NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('documents','images')),
  period_start DATE NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (client_id, kind, period_start)
);
CREATE TABLE IF NOT EXISTS portal_assistant_preview_usage (
  user_id BIGINT NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, period_start)
);
-- Small generated artifacts persist across serverless restarts. No public bucket.
CREATE TABLE IF NOT EXISTS portal_assistant_files (
  id UUID PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  thread_id TEXT,
  preview BOOLEAN NOT NULL DEFAULT FALSE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN (
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/webp'
  )),
  content BYTEA NOT NULL CHECK (octet_length(content) <= 3000000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id,user_id,thread_id) REFERENCES portal_chatkit_threads(client_id,user_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS portal_assistant_files_owner_idx ON portal_assistant_files(client_id,user_id,created_at);
COMMIT;
