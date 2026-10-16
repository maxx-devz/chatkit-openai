BEGIN;
SET LOCAL search_path = public, pg_temp;

CREATE TABLE IF NOT EXISTS portal_chatkit_threads (
  client_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  id TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, user_id, id),
  FOREIGN KEY (client_id, user_id)
    REFERENCES portal_memberships(client_id, user_id) ON DELETE CASCADE
);

-- Existing conversations remain in the work view. New conversations keep the
-- client's selected mode for history filtering and request routing.
ALTER TABLE portal_chatkit_threads
  ADD COLUMN IF NOT EXISTS chat_mode TEXT NOT NULL DEFAULT 'work'
  CHECK (chat_mode IN ('work', 'general'));

CREATE TABLE IF NOT EXISTS portal_chatkit_items (
  client_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  thread_id TEXT NOT NULL,
  id TEXT NOT NULL,
  sequence BIGSERIAL NOT NULL,
  data JSONB NOT NULL,
  PRIMARY KEY (client_id, user_id, thread_id, id),
  FOREIGN KEY (client_id, user_id, thread_id)
    REFERENCES portal_chatkit_threads(client_id, user_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS portal_chatkit_items_page_idx
  ON portal_chatkit_items (client_id, user_id, thread_id, sequence);
CREATE INDEX IF NOT EXISTS portal_chatkit_threads_page_idx
  ON portal_chatkit_threads (client_id, user_id, created_at, id);
CREATE INDEX IF NOT EXISTS portal_chatkit_threads_mode_page_idx
  ON portal_chatkit_threads (client_id, user_id, chat_mode, created_at DESC, id DESC);

-- A short renewable-by-replacement lease survives serverless process restarts.
-- Serialize mutations per user/account so concurrent tabs cannot corrupt a reply.
CREATE TABLE IF NOT EXISTS portal_chatkit_leases (
  client_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (client_id, user_id),
  FOREIGN KEY (client_id, user_id)
    REFERENCES portal_memberships(client_id, user_id) ON DELETE CASCADE
);

COMMIT;
