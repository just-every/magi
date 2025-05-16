-- PR events schema - tracks all pull request events including successes, failures, and reverts
-- This replaced the original PR failures schema (PR events is a superset of PR failures)

-- Create the pull request events table
CREATE TABLE pull_request_events (
  id               BIGSERIAL PRIMARY KEY,
  process_id       TEXT        NOT NULL, -- Using TEXT since UUIDs are stored as strings
  project_id       TEXT        NOT NULL,
  branch_name      TEXT        NOT NULL,
  commit_msg       TEXT        NOT NULL,
  metrics          JSONB,           -- risk metrics snapshot
  error_message    TEXT,            -- optional for successful events
  merge_commit_sha TEXT,            -- SHA of merge/revert commit
  status           TEXT        NOT NULL, -- 'merged', 'failed', 'resolved', 'reverted'
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ,
  resolved_by      TEXT,            -- user email / id
  resolution       TEXT             -- 'merged', 'ignored', 'retry_failed'
);

-- Create appropriate indexes
CREATE INDEX pre_project_idx ON pull_request_events(project_id);
CREATE INDEX pre_resolution_idx ON pull_request_events(resolution) WHERE resolution IS NULL;
CREATE INDEX pre_status_idx ON pull_request_events(status);

-- Add table and column comments for documentation
COMMENT ON TABLE pull_request_events IS
  'Tracks all pull request events including successful merges, failures, and reverts.';

COMMENT ON COLUMN pull_request_events.merge_commit_sha IS
  'Git SHA of the merge commit for successful merges or the revert commit for reverts';
COMMENT ON COLUMN pull_request_events.status IS
  'Current status: merged, failed, resolved, reverted';
