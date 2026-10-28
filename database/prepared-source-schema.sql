BEGIN;
CREATE TABLE IF NOT EXISTS portal_prepared_source_indexes (
  owner_id BIGINT PRIMARY KEY REFERENCES portal_users(id) ON DELETE CASCADE,
  binding TEXT,
  encrypted_documents TEXT,
  directory JSONB NOT NULL DEFAULT '[]'::jsonb,
  sync_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  checked_at TIMESTAMPTZ,
  failure_code TEXT,
  lease_token TEXT,
  lease_until TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS portal_source_publications (
  owner_id BIGINT NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  audience TEXT NOT NULL,
  client_id BIGINT REFERENCES portal_clients(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  reference_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  instruction_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  additional_instructions TEXT NOT NULL DEFAULT '',
  general_references BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(owner_id, audience),
  CONSTRAINT portal_source_audience CHECK (
    (audience IN ('admin','clients') AND client_id IS NULL) OR
    (client_id IS NOT NULL AND audience='client:' || client_id::text)
  ),
  CONSTRAINT portal_source_additional_limit CHECK (length(additional_instructions)<=4000)
);
CREATE UNIQUE INDEX IF NOT EXISTS portal_source_client_publication_idx
  ON portal_source_publications(client_id) WHERE client_id IS NOT NULL;
-- Upgrade existing installations without rewriting publications or enabling content.
ALTER TABLE portal_source_publications DROP CONSTRAINT IF EXISTS portal_source_audience;
ALTER TABLE portal_source_publications ADD CONSTRAINT portal_source_audience CHECK (
  (audience IN ('admin','clients') AND client_id IS NULL) OR
  (client_id IS NOT NULL AND audience='client:' || client_id::text)
);
-- One accountable publisher for the shared company pack; no last-writer-wins takeover.
CREATE UNIQUE INDEX IF NOT EXISTS portal_source_shared_publication_idx
  ON portal_source_publications(audience) WHERE audience='clients';
COMMIT;
