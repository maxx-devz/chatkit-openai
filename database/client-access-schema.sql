-- Per-client membership permissions and an audited client-user workflow.
-- Apply after database/schema.sql and database/admin-schema.sql.

ALTER TABLE portal_memberships DROP CONSTRAINT IF EXISTS portal_memberships_role;
ALTER TABLE portal_memberships ADD CONSTRAINT portal_memberships_role
  CHECK (role IN ('client_viewer', 'member', 'client_admin', 'aoc_admin'));

ALTER TABLE portal_memberships
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS portal_memberships_active_user_idx
  ON portal_memberships (user_id, client_id) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS portal_client_access_audit (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,
  actor_user_id BIGINT REFERENCES portal_users(id) ON DELETE SET NULL,
  target_user_id BIGINT REFERENCES portal_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'role_change', 'deactivate', 'reactivate', 'admin_grant', 'admin_revoke')),
  source TEXT NOT NULL DEFAULT 'client_portal' CHECK (source IN ('client_portal', 'aoc_admin', 'terminal')),
  previous_role TEXT,
  next_role TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS portal_client_access_audit_client_time_idx
  ON portal_client_access_audit (client_id, occurred_at DESC, id DESC);
