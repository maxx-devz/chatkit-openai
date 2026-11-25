-- Portable cleanup receipts. File metadata and audit history remain after byte deletion.
ALTER TABLE portal_client_document_objects ADD COLUMN IF NOT EXISTS upload_grant_expires_at timestamptz;
-- Existing upload grants may still be valid for two hours; never infer immediate expiry.
UPDATE portal_client_document_objects SET upload_grant_expires_at=now()+interval '125 minutes' WHERE upload_grant_expires_at IS NULL;
CREATE TABLE IF NOT EXISTS portal_client_document_storage_cleanup (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 file_id uuid NOT NULL,client_id bigint NOT NULL,object_path text NOT NULL,
 final_check_after timestamptz NOT NULL, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),last_deleted_at timestamptz,
 last_error text CHECK(last_error IS NULL OR last_error ~ '^[a-z_]{2,60}$'),finished_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(file_id,object_path),
 FOREIGN KEY(file_id,client_id) REFERENCES portal_client_document_objects(id,client_id)
);
CREATE INDEX IF NOT EXISTS client_document_cleanup_due ON portal_client_document_storage_cleanup(next_attempt_at,id) WHERE finished_at IS NULL;
CREATE INDEX IF NOT EXISTS client_document_cleanup_scope ON portal_client_document_storage_cleanup(client_id,id);
REVOKE ALL ON portal_client_document_storage_cleanup FROM PUBLIC;
REVOKE ALL ON SEQUENCE portal_client_document_storage_cleanup_id_seq FROM PUBLIC;
DO $$ DECLARE r text;BEGIN FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
 EXECUTE format('REVOKE ALL ON portal_client_document_storage_cleanup FROM %I',r);
 EXECUTE format('REVOKE ALL ON SEQUENCE portal_client_document_storage_cleanup_id_seq FROM %I',r);END IF;
END LOOP;END $$;

-- Legacy database-backed uploads can release bytes while retaining their audit/metadata row.
ALTER TABLE portal_client_document_files DROP CONSTRAINT IF EXISTS portal_client_document_files_content_check;
ALTER TABLE portal_client_document_files ADD CONSTRAINT portal_client_document_files_content_check
 CHECK((archived_at IS NULL AND octet_length(content) BETWEEN 1 AND 2097152) OR (archived_at IS NOT NULL AND octet_length(content) BETWEEN 0 AND 2097152));

ALTER TABLE portal_client_document_object_audit DROP CONSTRAINT IF EXISTS portal_client_document_object_audit_action_check;
ALTER TABLE portal_client_document_object_audit ADD CONSTRAINT portal_client_document_object_audit_action_check CHECK(action IN('upload','update','publish','revoke','archive','storage_rename'));
