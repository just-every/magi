-- Remove implementation column from custom_tools
BEGIN;

ALTER TABLE custom_tools
    DROP COLUMN IF EXISTS implementation;

COMMIT;
