BEGIN;
SET LOCAL search_path = public, pg_temp;

CREATE TABLE IF NOT EXISTS portal_chatkit_uploads (
  id TEXT PRIMARY KEY,
  client_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  thread_id TEXT,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  content BYTEA NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 2097152),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, user_id) REFERENCES portal_memberships(client_id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, user_id, thread_id) REFERENCES portal_chatkit_threads(client_id, user_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS portal_chatkit_uploads_scope_idx
  ON portal_chatkit_uploads(client_id, user_id, thread_id);

CREATE TABLE IF NOT EXISTS portal_chatkit_upload_attempts (
  client_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  period_start DATE NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (client_id, user_id, period_start),
  FOREIGN KEY (client_id, user_id) REFERENCES portal_memberships(client_id, user_id) ON DELETE CASCADE
);

COMMIT;
