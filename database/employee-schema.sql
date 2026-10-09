-- Additive employee extension. Existing authentication and client tables stay intact.
CREATE TABLE IF NOT EXISTS portal_employees (
  user_id BIGINT PRIMARY KEY REFERENCES portal_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role = 'employee'),
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

ALTER TABLE portal_employees ADD COLUMN IF NOT EXISTS encrypted_refresh_token TEXT;
ALTER TABLE portal_employees ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMPTZ;
ALTER TABLE portal_employees ADD COLUMN IF NOT EXISTS position TEXT NOT NULL DEFAULT 'team_member';
ALTER TABLE portal_employees ADD COLUMN IF NOT EXISTS panel_access JSONB NOT NULL
  DEFAULT '["overview","my_tasks","activity","hubstaff"]'::jsonb;

-- Advisory labels only. Hubstaff task state is never changed by this table.
CREATE TABLE IF NOT EXISTS portal_employee_task_guidance (
  employee_id BIGINT NOT NULL REFERENCES portal_employees(user_id) ON DELETE CASCADE,
  task_id BIGINT NOT NULL CHECK (task_id > 0),
  fingerprint TEXT NOT NULL,
  label TEXT NOT NULL,
  badge_text TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (employee_id, task_id)
);

ALTER TABLE portal_employee_task_guidance ADD COLUMN IF NOT EXISTS badge_text TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'portal_employees_panel_access_array'
      AND conrelid = 'portal_employees'::regclass
  ) THEN
    ALTER TABLE portal_employees ADD CONSTRAINT portal_employees_panel_access_array
      CHECK (jsonb_typeof(panel_access) = 'array');
  END IF;
END $$;
