-- Optional provider-backed bytes; metadata/authorization remain portable PostgreSQL.
-- Existing BYTEA file rows, identifiers and audit history are unchanged.
CREATE TABLE IF NOT EXISTS portal_client_document_objects (
 id uuid PRIMARY KEY,client_id bigint NOT NULL REFERENCES portal_clients(id),actor_id bigint NOT NULL REFERENCES portal_users(id),
 operation uuid NOT NULL UNIQUE,digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 180),description text NOT NULL DEFAULT '' CHECK(length(description)<=1000),
 filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 180),mime_type text NOT NULL,
 size_bytes bigint NOT NULL CHECK(size_bytes>0),storage_origin text NOT NULL,bucket text NOT NULL,object_path text NOT NULL UNIQUE,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','ready','rejected')),
 share_requested boolean NOT NULL,content_hash text,revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 published_by bigint REFERENCES portal_users(id),published_at timestamptz,archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,client_id),CHECK((published_by IS NULL)=(published_at IS NULL)),
 CHECK(state<>'ready' OR (content_hash IS NOT NULL AND content_hash ~ '^[0-9a-f]{64}$'))
);
CREATE INDEX IF NOT EXISTS client_document_objects_scope ON portal_client_document_objects(client_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS portal_client_document_object_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,file_id uuid NOT NULL,client_id bigint NOT NULL,
 actor_id bigint NOT NULL REFERENCES portal_users(id),operation uuid NOT NULL UNIQUE,digest text NOT NULL,
 action text NOT NULL CHECK(action IN('upload','update','publish','revoke','archive')),result jsonb NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(file_id,client_id) REFERENCES portal_client_document_objects(id,client_id)
);
REVOKE ALL ON portal_client_document_objects,portal_client_document_object_audit FROM PUBLIC;
REVOKE ALL ON SEQUENCE portal_client_document_object_audit_id_seq FROM PUBLIC;
DO $$ DECLARE r text;BEGIN FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
 EXECUTE format('REVOKE ALL ON portal_client_document_objects,portal_client_document_object_audit FROM %I',r);
 EXECUTE format('REVOKE ALL ON SEQUENCE portal_client_document_object_audit_id_seq FROM %I',r);END IF;
END LOOP;END $$;
