-- AOC-GPT client portal prototype schema for Neon Postgres.
-- Run this entire file once in the Neon SQL Editor.

CREATE TABLE IF NOT EXISTS portal_clients (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  assistant_instructions TEXT NOT NULL DEFAULT '',
  openai_vector_store_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT portal_clients_slug_format
    CHECK (slug ~ '^[a-z0-9][a-z0-9._-]{0,99}$')
);

CREATE TABLE IF NOT EXISTS portal_users (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portal_memberships (
  client_id BIGINT NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, user_id),
  CONSTRAINT portal_memberships_role
    CHECK (role IN ('member', 'client_admin', 'aoc_admin'))
);

-- The current UI already treats folders, branches, messages, assets, and usage
-- as one workspace. A JSONB snapshot preserves that behavior for the prototype.
-- A later production migration can normalize messages for analytics if needed.
CREATE TABLE IF NOT EXISTS portal_workspace_snapshots (
  client_id BIGINT NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  workspace JSONB NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, user_id)
);

-- Client facts and corrections enter here as pending. Only approved records
-- should be uploaded to that client's OpenAI vector store.
CREATE TABLE IF NOT EXISTS portal_knowledge_items (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'note',
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_by BIGINT REFERENCES portal_users(id) ON DELETE SET NULL,
  approved_by BIGINT REFERENCES portal_users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT portal_knowledge_status
    CHECK (status IN ('pending', 'approved', 'rejected', 'archived')),
  CONSTRAINT portal_knowledge_source_type
    CHECK (source_type IN ('note', 'correction', 'file', 'website'))
);

CREATE INDEX IF NOT EXISTS portal_knowledge_client_status_idx
  ON portal_knowledge_items (client_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS portal_workspace_updated_idx
  ON portal_workspace_snapshots (client_id, updated_at DESC);
