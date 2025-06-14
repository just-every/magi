/**
 * Patch Security Module
 *
 * Provides security utilities and validations for the patch management system
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';

const execFileAsync = promisify(execFile);

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
}

/**
 * Track rate limits per user/IP
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Check rate limit for a given identifier
 */
export function checkRateLimit(
    identifier: string,
    config: RateLimitConfig = { maxRequests: 10, windowMs: 60000 }
): boolean {
    const now = Date.now();
    const record = rateLimitStore.get(identifier);

    if (!record || record.resetTime < now) {
        rateLimitStore.set(identifier, {
            count: 1,
            resetTime: now + config.windowMs,
        });
        return true;
    }

    if (record.count >= config.maxRequests) {
        return false;
    }

    record.count++;
    return true;
}

/**
 * Validate project and process IDs to prevent path traversal
 */
export function validateProjectPath(
    processId: string,
    projectId: string
): { valid: boolean; error?: string } {
    // Only allow alphanumeric, dash, and underscore
    const validPattern = /^[a-zA-Z0-9_-]+$/;

    if (!validPattern.test(processId)) {
        return { valid: false, error: 'Invalid process ID format' };
    }

    if (!validPattern.test(projectId)) {
        return { valid: false, error: 'Invalid project ID format' };
    }

    // Additional length limits
    if (processId.length > 100 || projectId.length > 100) {
        return { valid: false, error: 'ID too long' };
    }

    // Ensure the resulting path is within bounds
    const projectPath = path.join(
        '/magi_output',
        processId,
        'projects',
        projectId
    );
    const normalizedPath = path.normalize(projectPath);

    if (!normalizedPath.startsWith('/magi_output/')) {
        return { valid: false, error: 'Path traversal detected' };
    }

    return { valid: true };
}

/**
 * Create a secure temporary file with random name
 */
export async function createSecureTempFile(
    prefix: string,
    suffix: string = '.patch'
): Promise<{ path: string; cleanup: () => void }> {
    const tmpDir = '/tmp/magi-patches';

    // Create directory with restricted permissions
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { mode: 0o700, recursive: true });
    }

    // Generate cryptographically random filename
    const randomBytes = crypto.randomBytes(16).toString('hex');
    const filename = `${prefix}-${randomBytes}${suffix}`;
    const filepath = path.join(tmpDir, filename);

    // Create cleanup function
    const cleanup = () => {
        try {
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
            }
        } catch (err) {
            console.error(`Failed to cleanup temp file ${filepath}:`, err);
        }
    };

    return { path: filepath, cleanup };
}

/**
 * Execute git commands safely using execFile to prevent injection
 */
export async function execGitSafe(
    cwd: string,
    args: string[]
): Promise<{ stdout: string; stderr: string }> {
    try {
        const { stdout, stderr } = await execFileAsync('git', args, {
            cwd,
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
            maxBuffer: 10 * 1024 * 1024, // 10MB max output
        });
        return { stdout, stderr };
    } catch (error) {
        throw new Error(`Git command failed: ${error.message}`);
    }
}

/**
 * Sanitize commit messages to prevent injection
 */
export function sanitizeCommitMessage(message: string): string {
    // Remove any potentially dangerous characters
    // Allow: alphanumeric, space, common punctuation
    return message
        .replace(/[^a-zA-Z0-9\s\-_.,!?:;()\[\]{}'"#@/]/g, '')
        .trim()
        .substring(0, 1000); // Limit length
}

/**
 * Validate patch content for security issues
 */
export function validatePatchContent(patchContent: string): {
    valid: boolean;
    issues: string[];
} {
    const issues: string[] = [];
    const lines = patchContent.split('\n');

    // Check for suspicious patterns
    const suspiciousPatterns = [
        { pattern: /\0/, message: 'Null bytes detected' },
        { pattern: /\.\.\//g, message: 'Path traversal attempts detected' },
        {
            pattern: /^diff --git a\/\.\./m,
            message: 'Patch targets parent directory',
        },
        {
            pattern: /\bpassword\s*=\s*["'][^"']+["']/i,
            message: 'Hardcoded password detected',
        },
        {
            pattern:
                /\b(?:api[_-]?key|secret[_-]?key|private[_-]?key)\s*=\s*["'][^"']+["']/i,
            message: 'API key detected',
        },
    ];

    for (const { pattern, message } of suspiciousPatterns) {
        if (pattern.test(patchContent)) {
            issues.push(message);
        }
    }

    // Check patch size
    if (patchContent.length > 5 * 1024 * 1024) {
        // 5MB
        issues.push('Patch too large (>5MB)');
    }

    // Check line count
    if (lines.length > 10000) {
        issues.push('Too many lines in patch (>10000)');
    }

    // Validate patch format
    if (!patchContent.includes('diff --git')) {
        issues.push('Invalid patch format');
    }

    return {
        valid: issues.length === 0,
        issues,
    };
}

/**
 * Create audit log entry
 */
export interface AuditLogEntry {
    timestamp: Date;
    action: 'apply' | 'reject' | 'auto-merge' | 'conflict-resolve' | 'rollback';
    patchId: number;
    userId?: string;
    projectId: string;
    success: boolean;
    details?: string;
    ipAddress?: string;
}

/**
 * Log audit events
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
    const logDir = '/magi_output/audit-logs';

    // Create directory if it doesn't exist
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
    }

    const logFile = path.join(
        logDir,
        `patch-audit-${new Date().toISOString().split('T')[0]}.jsonl`
    );
    const logEntry = JSON.stringify(entry) + '\n';

    // Append to log file
    fs.appendFileSync(logFile, logEntry, { mode: 0o600 });
}

/**
 * Distributed lock manager for preventing race conditions
 */
export class DistributedLock {
    private locks: Map<string, { holder: string; expiry: number }> = new Map();
    private cleanupInterval: NodeJS.Timeout;

    constructor() {
        // Clean up expired locks every 10 seconds
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            for (const [key, lock] of this.locks.entries()) {
                if (lock.expiry < now) {
                    this.locks.delete(key);
                }
            }
        }, 10000);
    }

    async acquire(
        key: string,
        holder: string = crypto.randomBytes(16).toString('hex'),
        ttlMs: number = 30000
    ): Promise<{ acquired: boolean; holder?: string; release?: () => void }> {
        const now = Date.now();
        const existing = this.locks.get(key);

        if (existing && existing.expiry > now) {
            return { acquired: false };
        }

        const expiry = now + ttlMs;
        this.locks.set(key, { holder, expiry });

        const release = () => {
            const current = this.locks.get(key);
            if (current && current.holder === holder) {
                this.locks.delete(key);
            }
        };

        return { acquired: true, holder, release };
    }

    destroy(): void {
        clearInterval(this.cleanupInterval);
        this.locks.clear();
    }
}

// Global lock manager instance
export const lockManager = new DistributedLock();

/**
 * Validate git repository state
 */
export async function validateGitRepo(
    projectPath: string
): Promise<{ valid: boolean; error?: string }> {
    try {
        // Check if it's a git repository
        const { stdout: gitDir } = await execGitSafe(projectPath, [
            'rev-parse',
            '--git-dir',
        ]);

        if (!gitDir.trim()) {
            return { valid: false, error: 'Not a git repository' };
        }

        // Check for clean working tree
        const { stdout: status } = await execGitSafe(projectPath, [
            'status',
            '--porcelain',
        ]);

        if (status.trim()) {
            return { valid: false, error: 'Working tree not clean' };
        }

        // Check if there's an ongoing operation
        const gitPath = path.join(projectPath, '.git');
        const ongoingOps = [
            'MERGE_HEAD',
            'CHERRY_PICK_HEAD',
            'REVERT_HEAD',
            'BISECT_LOG',
            'rebase-merge',
            'rebase-apply',
        ];

        for (const op of ongoingOps) {
            if (fs.existsSync(path.join(gitPath, op))) {
                return { valid: false, error: `Ongoing git operation: ${op}` };
            }
        }

        return { valid: true };
    } catch (error) {
        return { valid: false, error: error.message };
    }
}

/**
 * Check if user has permission to perform action
 */
export interface UserPermissions {
    canApplyPatches: boolean;
    canRejectPatches: boolean;
    canAutoMerge: boolean;
    projectIds: string[]; // List of allowed project IDs, empty means all
}

export function checkUserPermission(
    userPermissions: UserPermissions,
    action: 'apply' | 'reject' | 'auto-merge',
    projectId: string
): boolean {
    // Check project access
    if (
        userPermissions.projectIds.length > 0 &&
        !userPermissions.projectIds.includes(projectId)
    ) {
        return false;
    }

    // Check action permission
    switch (action) {
        case 'apply':
            return userPermissions.canApplyPatches;
        case 'reject':
            return userPermissions.canRejectPatches;
        case 'auto-merge':
            return userPermissions.canAutoMerge;
        default:
            return false;
    }
}

/**
 * Calculate patch signature for deduplication
 */
export function calculatePatchSignature(patchContent: string): string {
    // Normalize patch content by removing timestamps and hashes
    const normalized = patchContent
        .split('\n')
        .filter(line => {
            // Remove index lines with hashes
            if (line.startsWith('index ')) return false;
            // Remove timestamps
            if (line.match(/^(---|\+\+\+).*\d{4}-\d{2}-\d{2}/)) {
                return false;
            }
            return true;
        })
        .join('\n');

    return crypto.createHash('sha256').update(normalized).digest('hex');
}
