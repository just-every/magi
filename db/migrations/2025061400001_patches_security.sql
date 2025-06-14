-- Add security enhancements to patches table

-- Add patch signature for deduplication
ALTER TABLE patches 
ADD COLUMN IF NOT EXISTS patch_signature VARCHAR(64);

-- Add index for signature lookups
CREATE INDEX IF NOT EXISTS patches_signature_idx 
ON patches(patch_signature) 
WHERE status = 'pending';

-- Add security audit fields
ALTER TABLE patches
ADD COLUMN IF NOT EXISTS security_issues JSONB,
ADD COLUMN IF NOT EXISTS risk_override_reason TEXT,
ADD COLUMN IF NOT EXISTS risk_override_by TEXT;

-- Create audit log table
CREATE TABLE IF NOT EXISTS patch_audit_log (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    action VARCHAR(50) NOT NULL, -- apply, reject, auto-merge, conflict-resolve
    patch_id BIGINT NOT NULL,
    user_id TEXT,
    project_id TEXT NOT NULL,
    success BOOLEAN NOT NULL,
    details TEXT,
    ip_address INET,
    FOREIGN KEY (patch_id) REFERENCES patches(id)
);

-- Add indexes for audit log
CREATE INDEX IF NOT EXISTS audit_log_patch_idx ON patch_audit_log(patch_id);
CREATE INDEX IF NOT EXISTS audit_log_project_idx ON patch_audit_log(project_id);
CREATE INDEX IF NOT EXISTS audit_log_timestamp_idx ON patch_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON patch_audit_log(action);

-- Add rate limiting table
CREATE TABLE IF NOT EXISTS patch_rate_limits (
    identifier VARCHAR(255) PRIMARY KEY,
    request_count INT NOT NULL DEFAULT 0,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_request TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add index for cleanup
CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON patch_rate_limits(window_start);

-- Add distributed locks table
CREATE TABLE IF NOT EXISTS patch_locks (
    lock_key VARCHAR(255) PRIMARY KEY,
    holder VARCHAR(255) NOT NULL,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    released BOOLEAN DEFAULT FALSE
);

-- Add index for lock expiry
CREATE INDEX IF NOT EXISTS locks_expires_idx ON patch_locks(expires_at) WHERE NOT released;

-- Add user permissions table
CREATE TABLE IF NOT EXISTS patch_user_permissions (
    user_id VARCHAR(255) PRIMARY KEY,
    can_apply_patches BOOLEAN DEFAULT FALSE,
    can_reject_patches BOOLEAN DEFAULT FALSE,  
    can_auto_merge BOOLEAN DEFAULT FALSE,
    allowed_projects TEXT[], -- Array of project IDs, empty means all
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to clean up expired locks
CREATE OR REPLACE FUNCTION cleanup_expired_locks() RETURNS void AS $$
BEGIN
    DELETE FROM patch_locks 
    WHERE expires_at < NOW() AND NOT released;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old rate limit entries
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits() RETURNS void AS $$
BEGIN
    DELETE FROM patch_rate_limits 
    WHERE window_start < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE patch_audit_log IS 'Audit trail for all patch operations';
COMMENT ON TABLE patch_rate_limits IS 'Rate limiting for patch API endpoints';
COMMENT ON TABLE patch_locks IS 'Distributed locks for preventing race conditions';
COMMENT ON TABLE patch_user_permissions IS 'User permissions for patch operations';

COMMENT ON COLUMN patches.patch_signature IS 'SHA256 hash of normalized patch content for deduplication';
COMMENT ON COLUMN patches.security_issues IS 'JSON array of security issues detected in patch';
COMMENT ON COLUMN patches.risk_override_reason IS 'Reason if patch was merged despite high risk';
COMMENT ON COLUMN patches.risk_override_by IS 'User who overrode risk assessment';