-- Additive employee extension. Existing authentication and client tables stay intact.
CREATE TABLE IF NOT EXISTS portal_employees (
  user_id BIGINT PRIMARY KEY REFERENCES portal_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role = 'employee'),
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
