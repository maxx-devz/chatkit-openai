-- Data-preserving internal-user migration. Authentication and client tables stay intact.
DO $$
BEGIN
  IF to_regclass('portal_employees') IS NOT NULL
    AND to_regclass('portal_internal_users') IS NOT NULL THEN
    -- Some installations retain an empty legacy table after the account rename.
    -- Leave it untouched; never merge or discard actual legacy account rows.
    IF EXISTS (SELECT 1 FROM portal_employees) THEN
      RAISE EXCEPTION 'Both tables exist and portal_employees still contains account mappings; resolve the duplicate tables before migrating.';
    END IF;
  ELSIF to_regclass('portal_employees') IS NOT NULL THEN
    ALTER TABLE portal_employees RENAME TO portal_internal_users;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS portal_internal_users (
  user_id BIGINT PRIMARY KEY REFERENCES portal_users(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL DEFAULT 'internal_user',
  position TEXT NOT NULL DEFAULT 'team_member',
  panel_access JSONB NOT NULL DEFAULT '["overview","my_tasks","activity","team_directory","account_settings","hubstaff"]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  hubstaff_user_id BIGINT NOT NULL UNIQUE CHECK (hubstaff_user_id > 0),
  encrypted_access_token TEXT,
  encrypted_refresh_token TEXT,
  access_expires_at TIMESTAMPTZ,
  connection_version BIGINT NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  next_request_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Align inherited constraint/index names after an in-place legacy table rename.
DO $$
DECLARE
  legacy_name TEXT;
  current_name TEXT;
BEGIN
  FOR legacy_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'portal_internal_users'::regclass
      AND conname LIKE 'portal_employees_%'
  LOOP
    current_name := REGEXP_REPLACE(
      legacy_name,
      '^portal_employees_',
      'portal_internal_users_'
    );
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'portal_internal_users'::regclass
        AND conname = current_name
    ) THEN
      EXECUTE FORMAT(
        'ALTER TABLE portal_internal_users RENAME CONSTRAINT %I TO %I',
        legacy_name,
        current_name
      );
    END IF;
  END LOOP;
END $$;

-- Older installations stored the fixed account category in a column named role.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'portal_internal_users'::regclass
      AND attname = 'role'
      AND NOT attisdropped
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'portal_internal_users'::regclass
      AND attname = 'account_type'
      AND NOT attisdropped
  ) THEN
    ALTER TABLE portal_internal_users RENAME COLUMN role TO account_type;
  END IF;
END $$;

ALTER TABLE portal_internal_users ADD COLUMN IF NOT EXISTS account_type TEXT;
ALTER TABLE portal_internal_users ADD COLUMN IF NOT EXISTS encrypted_refresh_token TEXT;
ALTER TABLE portal_internal_users ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMPTZ;
ALTER TABLE portal_internal_users ADD COLUMN IF NOT EXISTS position TEXT NOT NULL DEFAULT 'team_member';
ALTER TABLE portal_internal_users ADD COLUMN IF NOT EXISTS panel_access JSONB NOT NULL
  DEFAULT '["overview","my_tasks","activity","team_directory","account_settings","hubstaff"]'::jsonb;

-- Apply the new Account Settings panel once to existing explicit panel lists.
-- The marker preserves later per-account toggles when this idempotent schema is rerun.
CREATE TABLE IF NOT EXISTS portal_internal_schema_migrations (
  migration_key TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM portal_internal_schema_migrations
    WHERE migration_key = 'account_settings_panel_default_v1') THEN
    UPDATE portal_internal_users
    SET panel_access = panel_access || '["account_settings"]'::jsonb,
        updated_at = NOW()
    WHERE NOT panel_access ? 'account_settings';
    INSERT INTO portal_internal_schema_migrations (migration_key)
    VALUES ('account_settings_panel_default_v1');
  END IF;
END $$;
ALTER TABLE portal_internal_users ALTER COLUMN panel_access SET DEFAULT
  '["overview","my_tasks","activity","team_directory","account_settings","hubstaff"]'::jsonb;

-- This field identifies the account category; business roles remain separate.
ALTER TABLE portal_internal_users DROP CONSTRAINT IF EXISTS portal_employees_role_check;
ALTER TABLE portal_internal_users DROP CONSTRAINT IF EXISTS portal_internal_users_role_check;
ALTER TABLE portal_internal_users DROP CONSTRAINT IF EXISTS portal_internal_users_account_type_check;

UPDATE portal_internal_users
SET account_type = 'internal_user'
WHERE account_type IS DISTINCT FROM 'internal_user';

ALTER TABLE portal_internal_users ALTER COLUMN account_type SET DEFAULT 'internal_user';
ALTER TABLE portal_internal_users ALTER COLUMN account_type SET NOT NULL;
ALTER TABLE portal_internal_users ADD CONSTRAINT portal_internal_users_account_type_check
  CHECK (account_type = 'internal_user');

ALTER TABLE portal_internal_users DROP CONSTRAINT IF EXISTS portal_employees_panel_access_array;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'portal_internal_users_panel_access_array'
      AND conrelid = 'portal_internal_users'::regclass
  ) THEN
    ALTER TABLE portal_internal_users ADD CONSTRAINT portal_internal_users_panel_access_array
      CHECK (jsonb_typeof(panel_access) = 'array');
  END IF;
END $$;

-- Role assignments are separate from account type, position, and visible panels.
-- Backfill legacy project managers only when this table is created for the first time.
DO $$
BEGIN
  IF to_regclass('portal_internal_user_roles') IS NULL THEN
    CREATE TABLE portal_internal_user_roles (
      user_id BIGINT NOT NULL REFERENCES portal_internal_users(user_id) ON DELETE CASCADE,
      role_key TEXT NOT NULL CHECK (role_key IN ('project_management', 'leadership', 'hr', 'sales', 'support',
        'marketing', 'seo_geo', 'cro', 'development', 'billing', 'internal_admin', 'internal_access_manager')),
      granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, role_key)
    );
    INSERT INTO portal_internal_user_roles (user_id, role_key)
    SELECT user_id, 'project_management' FROM portal_internal_users
    WHERE position = 'project_manager';
  END IF;
END $$;

-- Expand the role allow-list on databases where the table already exists.
ALTER TABLE portal_internal_user_roles
  DROP CONSTRAINT IF EXISTS portal_internal_user_roles_role_key_check;
ALTER TABLE portal_internal_user_roles
  ADD CONSTRAINT portal_internal_user_roles_role_key_check
  CHECK (role_key IN ('project_management', 'leadership', 'hr', 'sales', 'support',
    'marketing', 'seo_geo', 'cro', 'development', 'billing', 'internal_admin', 'internal_access_manager'));

-- Existing HR role holders receive the initial panel defaults exactly once.
-- Subsequent runs preserve their explicit per-panel choices, including all off.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM portal_internal_schema_migrations
    WHERE migration_key = 'hr_panel_defaults_v1') THEN
    UPDATE portal_internal_users AS internal_user
    SET panel_access = panel_access ||
      '["hr_overview","hr_leave_calendar","hr_leave_requests","hr_leave_balances","hr_schedule_coverage"]'::jsonb,
      updated_at = NOW()
    WHERE EXISTS (SELECT 1 FROM portal_internal_user_roles AS role
      WHERE role.user_id = internal_user.user_id AND role.role_key = 'hr');
    INSERT INTO portal_internal_schema_migrations (migration_key) VALUES ('hr_panel_defaults_v1');
  END IF;
END $$;

-- Existing Project Management role holders receive the first PM panel defaults
-- once. Later migrations preserve their explicit choices, including all off.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM portal_internal_schema_migrations
    WHERE migration_key = 'pm_panel_defaults_v1') THEN
    UPDATE portal_internal_users AS internal_user
    SET panel_access = panel_access || '["pm_projects","pm_project_tasks"]'::jsonb,
      updated_at = NOW()
    WHERE EXISTS (SELECT 1 FROM portal_internal_user_roles AS role
      WHERE role.user_id = internal_user.user_id AND role.role_key = 'project_management');
    INSERT INTO portal_internal_schema_migrations (migration_key) VALUES ('pm_panel_defaults_v1');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS portal_internal_access_audit (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT REFERENCES portal_users(id) ON DELETE SET NULL,
  target_user_id BIGINT REFERENCES portal_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS portal_internal_access_audit_occurred_idx
  ON portal_internal_access_audit (occurred_at DESC, id DESC);
