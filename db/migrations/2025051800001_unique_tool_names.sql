-- Ensure custom tool names are globally unique
BEGIN;

-- Drop old partial unique index if it exists
DROP INDEX IF EXISTS custom_tools_name_latest_idx;

-- Add a unique constraint on the name column
ALTER TABLE custom_tools
    ADD CONSTRAINT custom_tools_name_unique UNIQUE(name);

COMMIT;
