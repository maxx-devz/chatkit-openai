-- Portable, private admin uploads. Bytes never live on Vercel's filesystem.
CREATE TABLE IF NOT EXISTS portal_client_document_files (
 id uuid PRIMARY KEY,client_id bigint NOT NULL REFERENCES portal_clients(id),
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 180),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=1000),
 filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 180),mime_type text NOT NULL,
 content bytea NOT NULL CHECK(octet_length(content) BETWEEN 1 AND 2097152),
 content_hash text NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by bigint NOT NULL REFERENCES portal_users(id),updated_by bigint NOT NULL REFERENCES portal_users(id),
 published_by bigint REFERENCES portal_users(id),published_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),archived_at timestamptz,
 UNIQUE(id,client_id),CHECK((published_by IS NULL)=(published_at IS NULL))
);
CREATE INDEX IF NOT EXISTS client_document_files_scope ON portal_client_document_files(client_id,updated_at DESC) WHERE archived_at IS NULL;
CREATE TABLE IF NOT EXISTS portal_client_document_file_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,file_id uuid NOT NULL,client_id bigint NOT NULL,
 actor_id bigint NOT NULL REFERENCES portal_users(id),operation uuid NOT NULL UNIQUE,
 digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 action text NOT NULL CHECK(action IN ('upload','update','publish','revoke','archive')),
 result jsonb NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(file_id,client_id) REFERENCES portal_client_document_files(id,client_id)
);
CREATE INDEX IF NOT EXISTS client_document_file_audit_scope ON portal_client_document_file_audit(client_id,occurred_at DESC);

-- Browser/Data API roles must never read private bytes or audit records.
REVOKE ALL ON portal_client_document_files,portal_client_document_file_audit FROM PUBLIC;
REVOKE ALL ON SEQUENCE portal_client_document_file_audit_id_seq FROM PUBLIC;
DO $$
DECLARE browser_role text;
BEGIN
 FOREACH browser_role IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=browser_role) THEN
   EXECUTE format('REVOKE ALL ON portal_client_document_files,portal_client_document_file_audit FROM %I',browser_role);
   EXECUTE format('REVOKE ALL ON SEQUENCE portal_client_document_file_audit_id_seq FROM %I',browser_role);
  END IF;
 END LOOP;
END $$;
