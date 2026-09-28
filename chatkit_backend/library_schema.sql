BEGIN;
SET LOCAL search_path = public, pg_temp;

-- Durable, client-wide references. Unlike composer uploads, these records are
-- not owned by a conversation and remain available until explicitly removed.
CREATE TABLE IF NOT EXISTS portal_client_library (
  id TEXT PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,
  submitted_by BIGINT REFERENCES portal_users(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('file', 'link', 'note')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 180),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
  source_url TEXT,
  filename TEXT,
  mime_type TEXT,
  content BYTEA,
  extracted_text TEXT NOT NULL DEFAULT '',
  period_start DATE,
  period_end DATE,
  openai_file_id TEXT,
  index_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (index_status IN ('pending', 'ready', 'failed', 'not_applicable')),
  source_upload_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT portal_client_library_shape CHECK (
    (source_type = 'file' AND filename IS NOT NULL AND mime_type IS NOT NULL
      AND content IS NOT NULL AND octet_length(content) BETWEEN 1 AND 2097152)
    OR
    (source_type = 'link' AND source_url IS NOT NULL AND content IS NULL)
    OR
    (source_type = 'note' AND content IS NULL AND extracted_text <> '')
  ),
  CONSTRAINT portal_client_library_period CHECK (
    period_start IS NULL OR period_end IS NULL OR period_start <= period_end
  ),
  CONSTRAINT portal_client_library_upload_unique UNIQUE (client_id, source_upload_id)
);

CREATE INDEX IF NOT EXISTS portal_client_library_scope_idx
  ON portal_client_library(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS portal_client_library_period_idx
  ON portal_client_library(client_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS portal_client_library_search_idx
  ON portal_client_library USING GIN (
    to_tsvector('simple', title || ' ' || description || ' ' || extracted_text)
  );

COMMIT;
