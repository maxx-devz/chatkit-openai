-- Approved original Drive references, separate credentials, and verified journey state.
CREATE TABLE portal_document_connections (
 owner_id bigint PRIMARY KEY REFERENCES portal_users(id),
 generation uuid NOT NULL UNIQUE, config_hash text NOT NULL,
 encrypted_refresh_token text NOT NULL, connected_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE portal_document_oauth_states (
 state_hash text PRIMARY KEY,owner_id bigint NOT NULL REFERENCES portal_users(id),
 session_hash text NOT NULL,config_hash text NOT NULL,encrypted_verifier text NOT NULL,
 prior_generation uuid,prior_event bigint NOT NULL DEFAULT 0,expires_at timestamptz NOT NULL
);
CREATE INDEX document_oauth_expiry ON portal_document_oauth_states(expires_at);
CREATE TABLE portal_document_releases (
 id uuid PRIMARY KEY,client_id bigint NOT NULL REFERENCES portal_clients(id),
 assignment_id uuid NOT NULL,assignment_revision bigint NOT NULL,
 connection_generation uuid NOT NULL,owner_id bigint NOT NULL REFERENCES portal_users(id),
 drive_id text NOT NULL CHECK(drive_id ~ '^[A-Za-z0-9_-]{10,200}$'),
 drive_version text NOT NULL CHECK(drive_version ~ '^[0-9]{1,30}$'),
 modified_time text NOT NULL,mime_type text NOT NULL,
 source_name text NOT NULL,title text NOT NULL CHECK(length(title) BETWEEN 1 AND 180),
 category text NOT NULL CHECK(category IN ('estimate','order','receipt','invoice','report','sow','plan','testing','handover','other')),
 journey_stage smallint NOT NULL CHECK(journey_stage BETWEEN 1 AND 7),
 published_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz,
 FOREIGN KEY(assignment_id,client_id) REFERENCES portal_client_document_assignments(id,client_id)
);
CREATE UNIQUE INDEX document_release_active_file ON portal_document_releases(drive_id) WHERE revoked_at IS NULL;
CREATE INDEX document_release_client ON portal_document_releases(client_id,published_at DESC) WHERE revoked_at IS NULL;
CREATE TABLE portal_client_journey (
 client_id bigint PRIMARY KEY REFERENCES portal_clients(id),
 revision bigint NOT NULL CHECK(revision>0),current_stage smallint NOT NULL CHECK(current_stage BETWEEN 1 AND 7),
 completed boolean NOT NULL DEFAULT false,stage_labels jsonb NOT NULL CHECK(jsonb_typeof(stage_labels)='array' AND jsonb_array_length(stage_labels)=7),
 next_action text NOT NULL CHECK(length(next_action)<=700),evidence_type text NOT NULL CHECK(evidence_type IN ('milestone','approval','billing')),
 evidence_summary text NOT NULL CHECK(length(evidence_summary) BETWEEN 1 AND 700),
 updated_by bigint NOT NULL REFERENCES portal_users(id),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(NOT completed OR current_stage=7)
);
CREATE TABLE portal_document_delivery_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,client_id bigint NOT NULL REFERENCES portal_clients(id),
 actor_id bigint NOT NULL REFERENCES portal_users(id),operation uuid NOT NULL UNIQUE,
 digest text NOT NULL,action text NOT NULL CHECK(action IN ('publish','revoke','journey')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 400),result jsonb NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE portal_document_connection_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,owner_id bigint NOT NULL REFERENCES portal_users(id),
 action text NOT NULL CHECK(action IN ('connect','disconnect')),occurred_at timestamptz NOT NULL DEFAULT now()
);
