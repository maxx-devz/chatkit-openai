BEGIN;
CREATE TABLE IF NOT EXISTS portal_hubstaff_search_indexes (
  client_id BIGINT PRIMARY KEY REFERENCES portal_clients(id) ON DELETE CASCADE,
  binding TEXT NOT NULL,
  mapping_url TEXT NOT NULL,
  project_url TEXT NOT NULL,
  organization_id BIGINT NOT NULL,
  project_id BIGINT NOT NULL,
  generation BIGINT NOT NULL DEFAULT 0,
  scan_active BOOLEAN NOT NULL DEFAULT FALSE,
  task_cursor BIGINT,
  metadata_complete BOOLEAN NOT NULL DEFAULT FALSE,
  metadata_completed_at TIMESTAMPTZ,
  next_scan_at TIMESTAMPTZ,
  checked_at TIMESTAMPTZ,
  members JSONB NOT NULL DEFAULT '{}',
  failure_code TEXT,
  task_count BIGINT NOT NULL DEFAULT 0,
  comment_count BIGINT NOT NULL DEFAULT 0,
  pending_tasks BIGINT NOT NULL DEFAULT 0,
  unresolved_people_tasks BIGINT NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_until TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS portal_hubstaff_search_tasks (
  client_id BIGINT NOT NULL REFERENCES portal_hubstaff_search_indexes(client_id) ON DELETE CASCADE,
  task_id BIGINT NOT NULL,
  list_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  column_name TEXT NOT NULL,
  done BOOLEAN NOT NULL,
  assignee_names TEXT[] NOT NULL DEFAULT '{}',
  people_complete BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  activity_at TIMESTAMPTZ,
  fingerprint TEXT NOT NULL,
  seen_generation BIGINT NOT NULL,
  content_truncated BOOLEAN NOT NULL DEFAULT FALSE,
  comments_pending BOOLEAN NOT NULL DEFAULT TRUE,
  comments_cursor BIGINT,
  comments_generation BIGINT NOT NULL DEFAULT 1,
  comments_checked_at TIMESTAMPTZ,
  search_document TSVECTOR GENERATED ALWAYS AS
    (setweight(to_tsvector('english'::regconfig,title),'A') || to_tsvector('english'::regconfig,description)) STORED,
  PRIMARY KEY(client_id,task_id)
);
CREATE TABLE IF NOT EXISTS portal_hubstaff_search_comments (
  client_id BIGINT NOT NULL,
  task_id BIGINT NOT NULL,
  comment_id BIGINT NOT NULL,
  author_name TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  seen_generation BIGINT NOT NULL,
  content_truncated BOOLEAN NOT NULL DEFAULT FALSE,
  search_document TSVECTOR GENERATED ALWAYS AS (to_tsvector('english'::regconfig,content)) STORED,
  PRIMARY KEY(client_id,task_id,comment_id),
  FOREIGN KEY(client_id,task_id) REFERENCES portal_hubstaff_search_tasks(client_id,task_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS portal_hubstaff_search_task_text ON portal_hubstaff_search_tasks USING GIN(search_document);
CREATE INDEX IF NOT EXISTS portal_hubstaff_search_comment_text ON portal_hubstaff_search_comments USING GIN(search_document);
CREATE INDEX IF NOT EXISTS portal_hubstaff_search_task_dates ON portal_hubstaff_search_tasks(client_id,done,completed_at,task_id);
CREATE INDEX IF NOT EXISTS portal_hubstaff_search_task_created ON portal_hubstaff_search_tasks(client_id,created_at,task_id);
CREATE INDEX IF NOT EXISTS portal_hubstaff_search_task_activity ON portal_hubstaff_search_tasks(client_id,activity_at DESC,task_id);
CREATE INDEX IF NOT EXISTS portal_hubstaff_search_comment_queue ON portal_hubstaff_search_tasks(client_id,comments_pending,comments_checked_at,task_id);
COMMIT;
