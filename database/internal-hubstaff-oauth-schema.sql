-- Keep existing personal PAT connections working while allowing per-user OAuth.
-- Apply after database/internal-user-schema.sql.
ALTER TABLE portal_internal_users
  ADD COLUMN IF NOT EXISTS hubstaff_connection_kind TEXT NOT NULL DEFAULT 'pat';

ALTER TABLE portal_internal_users
  DROP CONSTRAINT IF EXISTS portal_internal_users_hubstaff_connection_kind_check;

ALTER TABLE portal_internal_users
  ADD CONSTRAINT portal_internal_users_hubstaff_connection_kind_check
  CHECK (hubstaff_connection_kind IN ('pat', 'oauth'));
