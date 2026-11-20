-- Append-only admin request/activity observations, separate from client/Internal logs.
CREATE TABLE IF NOT EXISTS portal_admin_operation_audit (
 id BIGSERIAL PRIMARY KEY,event_id UUID NOT NULL UNIQUE,request_id UUID NOT NULL,
 phase TEXT NOT NULL CHECK(phase IN ('started','finished','browser')),
 origin TEXT NOT NULL CHECK(origin IN ('server','browser','auth')),
 actor_user_id BIGINT REFERENCES portal_users(id) ON DELETE SET NULL,
 actor_name TEXT NOT NULL CHECK(char_length(actor_name)<=100),
 client_id BIGINT REFERENCES portal_clients(id) ON DELETE SET NULL,
 operation TEXT NOT NULL CHECK(operation ~ '^[a-z][a-z0-9_.]{0,95}$'),
 category TEXT NOT NULL CHECK(category IN ('read','change','navigation','interaction','validation','error','authentication')),
 outcome TEXT NOT NULL CHECK(outcome IN ('started','succeeded','failed','denied','cancelled','info','blocked')),
 method TEXT NOT NULL CHECK(method IN ('GET','POST','PATCH','PUT','DELETE','HEAD','OPTIONS','UI')),
 route TEXT NOT NULL CHECK(char_length(route)<=200),http_status INTEGER CHECK(http_status BETWEEN 100 AND 599),
 duration_ms INTEGER CHECK(duration_ms BETWEEN 0 AND 86400000),
 error_code TEXT CHECK(error_code ~ '^[A-Za-z0-9_]{1,64}$'),
 source_location TEXT CHECK(char_length(source_location)<=220),
 summary TEXT NOT NULL CHECK(char_length(summary)<=500),
 details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(details)='object' AND octet_length(details::text)<=8192),
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(request_id,phase)
);
CREATE INDEX IF NOT EXISTS portal_admin_operation_time ON portal_admin_operation_audit(occurred_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS portal_admin_operation_client ON portal_admin_operation_audit(client_id,occurred_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS portal_admin_operation_actor ON portal_admin_operation_audit(actor_user_id,occurred_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS portal_admin_operation_reference ON portal_admin_operation_audit(request_id,phase);
