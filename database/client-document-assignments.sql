-- Additive setup records only. No publication, Drive credential, billing or journey state.
CREATE TABLE IF NOT EXISTS portal_client_document_assignments (
 id uuid PRIMARY KEY, client_id bigint NOT NULL REFERENCES portal_clients(id),
 kind text NOT NULL CHECK(kind IN ('folder','document')),
 drive_id text NOT NULL CHECK(drive_id ~ '^[A-Za-z0-9_-]{10,200}$'),
 source_url text NOT NULL CHECK(length(source_url)<=500 AND source_url ~ '^https://(drive|docs)\.google\.com/'),
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 180 AND title !~ '[<>[:cntrl:]]'),
 journey_stage smallint CHECK(journey_stage BETWEEN 1 AND 7),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by bigint NOT NULL REFERENCES portal_users(id),updated_by bigint NOT NULL REFERENCES portal_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),archived_at timestamptz,
 UNIQUE(id,client_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS client_document_assignment_one_owner ON portal_client_document_assignments(drive_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS client_document_assignment_list ON portal_client_document_assignments(client_id,updated_at DESC) WHERE archived_at IS NULL;
CREATE TABLE IF NOT EXISTS portal_client_document_assignment_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 assignment_id uuid NOT NULL,client_id bigint NOT NULL,
 actor_user_id bigint NOT NULL REFERENCES portal_users(id),operation uuid NOT NULL UNIQUE,
 command_digest text NOT NULL CHECK(command_digest ~ '^[a-f0-9]{64}$'),
 action text NOT NULL CHECK(action IN ('create','update','archive')),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 400 AND reason !~ '[<>[:cntrl:]]'),
 result jsonb NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(assignment_id,client_id) REFERENCES portal_client_document_assignments(id,client_id)
);
CREATE INDEX IF NOT EXISTS client_document_assignment_audit_client ON portal_client_document_assignment_audit(client_id,occurred_at DESC);
