-- Add missing fields to patches table for error handling and status tracking

-- Add error_message column for storing failure reasons
ALTER TABLE patches ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add updated_at column for tracking last status change
ALTER TABLE patches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Update the status check constraint to include new statuses
ALTER TABLE patches DROP CONSTRAINT IF EXISTS patches_status_check;
ALTER TABLE patches ADD CONSTRAINT patches_status_check 
  CHECK (status IN ('pending', 'applied', 'rejected', 'superseded', 'failed', 'conflicted'));

-- Add index on updated_at for efficient queries
CREATE INDEX IF NOT EXISTS patches_updated_idx ON patches(updated_at DESC);

-- Add comments for documentation
COMMENT ON COLUMN patches.error_message IS 
  'Error message if patch failed to apply or had conflicts';
COMMENT ON COLUMN patches.updated_at IS 
  'Timestamp of last status change';