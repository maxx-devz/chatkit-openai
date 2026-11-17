BEGIN;
CREATE TABLE IF NOT EXISTS portal_website_insights_sites (
  id UUID PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  url TEXT NOT NULL CHECK (char_length(url) <= 1000),
  created_by BIGINT REFERENCES portal_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  UNIQUE (id, client_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS website_insights_active_url ON portal_website_insights_sites(client_id,url) WHERE archived_at IS NULL;
CREATE TABLE IF NOT EXISTS portal_website_insights_reports (
  id UUID PRIMARY KEY,
  website_id UUID NOT NULL,
  client_id BIGINT NOT NULL,
  started_by BIGINT REFERENCES portal_users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','complete','failed')),
  state JSONB NOT NULL,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  FOREIGN KEY (website_id,client_id) REFERENCES portal_website_insights_sites(id,client_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS website_insights_one_run ON portal_website_insights_reports(website_id) WHERE status='running';
CREATE INDEX IF NOT EXISTS website_insights_history ON portal_website_insights_reports(client_id,website_id,created_at DESC);
CREATE TABLE IF NOT EXISTS portal_website_insights_google (
  website_id UUID PRIMARY KEY,
  client_id BIGINT NOT NULL,
  connected_by BIGINT REFERENCES portal_users(id) ON DELETE SET NULL,
  oauth_client_id TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  property TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (website_id,client_id) REFERENCES portal_website_insights_sites(id,client_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS portal_website_insights_oauth_states (
  state_hash TEXT PRIMARY KEY,
  website_id UUID NOT NULL,
  client_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL,
  encrypted_verifier TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (website_id,client_id) REFERENCES portal_website_insights_sites(id,client_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS website_insights_oauth_expiry ON portal_website_insights_oauth_states(expires_at);
COMMIT;
