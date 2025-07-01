-- Create table for patch test results
CREATE TABLE IF NOT EXISTS patch_test_results (
    id SERIAL PRIMARY KEY,
    patch_id INTEGER NOT NULL REFERENCES patches(id) ON DELETE CASCADE,
    test_status VARCHAR(20) NOT NULL CHECK (test_status IN ('passed', 'failed', 'skipped', 'running')),
    test_summary TEXT NOT NULL,
    test_details TEXT[],
    test_runner VARCHAR(100),
    test_command TEXT,
    total_tests INTEGER,
    passed_tests INTEGER,
    failed_tests INTEGER,
    skipped_tests INTEGER,
    test_duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookups by patch
CREATE INDEX idx_patch_test_results_patch_id ON patch_test_results(patch_id);

-- Index for finding latest test results
CREATE INDEX idx_patch_test_results_created_at ON patch_test_results(patch_id, created_at DESC);

-- Add columns to patches table for storing commit info
ALTER TABLE patches ADD COLUMN IF NOT EXISTS base_commit VARCHAR(40);
ALTER TABLE patches ADD COLUMN IF NOT EXISTS head_commit VARCHAR(40);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_patch_test_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_patch_test_results_updated_at_trigger
BEFORE UPDATE ON patch_test_results
FOR EACH ROW
EXECUTE FUNCTION update_patch_test_results_updated_at();

-- Comment on table
COMMENT ON TABLE patch_test_results IS 'Stores test execution results for patches';
COMMENT ON COLUMN patch_test_results.test_status IS 'Current status of the test run';
COMMENT ON COLUMN patch_test_results.test_summary IS 'Human-readable summary of test results';
COMMENT ON COLUMN patch_test_results.test_details IS 'Array of detailed test messages or failures';
COMMENT ON COLUMN patch_test_results.test_runner IS 'Test framework used (jest, pytest, etc)';
COMMENT ON COLUMN patch_test_results.test_command IS 'Command used to run the tests';
COMMENT ON COLUMN patch_test_results.test_duration_ms IS 'Total test execution time in milliseconds';