-- Remove id column and use name as primary key for custom_tools
BEGIN;

-- Drop existing primary key constraint
ALTER TABLE custom_tools DROP CONSTRAINT IF EXISTS custom_tools_pkey;

-- Drop id column
ALTER TABLE custom_tools DROP COLUMN IF EXISTS id;

-- Set name as the primary key
ALTER TABLE custom_tools ADD PRIMARY KEY (name);

COMMIT;
