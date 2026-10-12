-- Data-preserving internal-user migration. Authentication and client tables stay intact.
DO $$
BEGIN
  IF to_regclass('portal_employees') IS NOT NULL
    AND to_regclass('portal_internal_users') IS NOT NULL THEN
    RAISE EXCEPTION 'Both portal_employees and portal_internal_users exist; resolve the duplicate account mappings before migrating.';
  ELSIF to_regclass('portal_employees') IS NOT NULL THEN
    ALTER TABLE portal_employees RENAME TO portal_internal_users;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS portal_internal_users (
  user_id BIGINT PRIMARY KEY REFERENCES portal_users(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL DEFAULT 'internal_user',
  position TEXT NOT NULL DEFAULT 'team_member',
  panel_access JSONB NOT NULL DEFAULT '["overview","my_tasks","activity","hubstaff"]'::jsonb,
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
  DEFAULT '["overview","my_tasks","activity","hubstaff"]'::jsonb;

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
