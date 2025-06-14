/**
 * Patch Rollback System
 *
 * Provides automatic rollback capabilities for problematic patches
 */

import { execSync } from 'child_process';
import { getDB } from './db.js';
import {
    execGitSafe,
    logAuditEvent,
    validateProjectPath,
} from './patch_security.js';
import { patchMonitor } from './patch_monitor.js';

export interface RollbackResult {
    success: boolean;
    error?: string;
    rollbackCommitSha?: string;
}

export interface RollbackOptions {
    reason: string;
    userId?: string;
    automatic?: boolean;
}

/**
 * Create a rollback point before applying patches
 */
export async function createRollbackPoint(
    projectPath: string,
    patchId: number
): Promise<{ tag: string; commit: string }> {
    try {
        // Get current commit
        const { stdout: currentCommit } = await execGitSafe(projectPath, [
            'rev-parse',
            'HEAD',
        ]);

        // Create a lightweight tag for the rollback point
        const tag = `rollback-patch-${patchId}-${Date.now()}`;
        await execGitSafe(projectPath, [
            'tag',
            '-a',
            tag,
            '-m',
            `Rollback point before applying patch #${patchId}`,
            currentCommit.trim(),
        ]);

        return {
            tag,
            commit: currentCommit.trim(),
        };
    } catch (error) {
        throw new Error(`Failed to create rollback point: ${error.message}`);
    }
}

/**
 * Rollback a specific patch
 */
export async function rollbackPatch(
    patchId: number,
    processId: string,
    projectId: string,
    options: RollbackOptions
): Promise<RollbackResult> {
    // Validate inputs
    const pathValidation = validateProjectPath(processId, projectId);
    if (!pathValidation.valid) {
        return { success: false, error: pathValidation.error };
    }

    const projectPath = `/magi_output/${processId}/projects/${projectId}`;
    const client = await getDB();

    try {
        // Get patch information
        const patchResult = await client.query(
            `SELECT * FROM patches 
             WHERE id = $1 AND status = 'applied' AND project_id = $2`,
            [patchId, projectId]
        );

        if (patchResult.rows.length === 0) {
            return {
                success: false,
                error: 'Patch not found or not applied',
            };
        }

        const patch = patchResult.rows[0];

        // Find the rollback tag
        const { stdout: tags } = await execGitSafe(projectPath, [
            'tag',
            '-l',
            `rollback-patch-${patchId}-*`,
        ]);

        const rollbackTags = tags.trim().split('\n').filter(Boolean);
        if (rollbackTags.length === 0) {
            return {
                success: false,
                error: 'No rollback point found for this patch',
            };
        }

        // Use the most recent rollback tag
        const rollbackTag = rollbackTags[rollbackTags.length - 1];

        // Check current status
        const { stdout: currentCommit } = await execGitSafe(projectPath, [
            'rev-parse',
            'HEAD',
        ]);

        // Perform the rollback
        await execGitSafe(projectPath, ['reset', '--hard', rollbackTag]);

        // Create a revert commit for audit trail
        const revertMessage = `Revert patch #${patchId}: ${options.reason}`;
        await execGitSafe(projectPath, [
            'commit',
            '--allow-empty',
            '-m',
            revertMessage,
        ]);

        // Get the revert commit SHA
        const { stdout: revertCommit } = await execGitSafe(projectPath, [
            'rev-parse',
            'HEAD',
        ]);

        // Update patch status
        await client.query(
            `UPDATE patches 
             SET status = 'superseded',
                 rejection_reason = $2
             WHERE id = $1`,
            [patchId, `Rolled back: ${options.reason}`]
        );

        // Create rollback record
        await client.query(
            `INSERT INTO patch_audit_log 
             (action, patch_id, user_id, project_id, success, details)
             VALUES ('rollback', $1, $2, $3, true, $4)`,
            [
                patchId,
                options.userId || (options.automatic ? 'system' : 'unknown'),
                projectId,
                JSON.stringify({
                    reason: options.reason,
                    fromCommit: patch.merge_commit_sha,
                    toCommit: revertCommit.trim(),
                    automatic: options.automatic || false,
                }),
            ]
        );

        // Log audit event
        await logAuditEvent({
            timestamp: new Date(),
            action: 'rollback',
            patchId,
            userId: options.userId,
            projectId,
            success: true,
            details: `Rolled back from ${currentCommit.trim()} to ${rollbackTag}`,
        });

        // Clean up old rollback tags
        await cleanupOldRollbackTags(projectPath, patchId);

        return {
            success: true,
            rollbackCommitSha: revertCommit.trim(),
        };
    } catch (error) {
        console.error('Rollback failed:', error);

        // Log failure
        await logAuditEvent({
            timestamp: new Date(),
            action: 'rollback',
            patchId,
            userId: options.userId,
            projectId,
            success: false,
            details: error.message,
        });

        return {
            success: false,
            error: `Rollback failed: ${error.message}`,
        };
    } finally {
        client.release();
    }
}

/**
 * Clean up old rollback tags
 */
async function cleanupOldRollbackTags(
    projectPath: string,
    patchId: number
): Promise<void> {
    try {
        const { stdout: tags } = await execGitSafe(projectPath, [
            'tag',
            '-l',
            `rollback-patch-${patchId}-*`,
        ]);

        const rollbackTags = tags.trim().split('\n').filter(Boolean);

        // Keep only the most recent tag
        if (rollbackTags.length > 1) {
            const tagsToDelete = rollbackTags.slice(0, -1);
            for (const tag of tagsToDelete) {
                await execGitSafe(projectPath, ['tag', '-d', tag]);
            }
        }
    } catch (error) {
        console.warn('Failed to cleanup rollback tags:', error);
    }
}

/**
 * Automatic rollback detection and execution
 */
export class AutomaticRollbackService {
    private rollbackThresholds = {
        buildFailures: 3,
        testFailures: 5,
        runtimeErrors: 10,
        performanceDegradation: 0.2, // 20% degradation
    };

    constructor() {
        // Monitor for anomalies that might trigger rollback
        patchMonitor.on('anomaly', async event => {
            if (event.severity === 'critical' && event.data?.patchId) {
                await this.evaluateRollback(event.data.patchId, event.details);
            }
        });
    }

    /**
     * Evaluate if a patch should be rolled back
     */
    async evaluateRollback(patchId: number, reason: string): Promise<void> {
        const client = await getDB();

        try {
            // Get patch details
            const patchResult = await client.query(
                "SELECT * FROM patches WHERE id = $1 AND status = 'applied'",
                [patchId]
            );

            if (patchResult.rows.length === 0) {
                return;
            }

            const patch = patchResult.rows[0];

            // Check recent failures related to this patch
            const recentFailures = await client.query(
                `SELECT COUNT(*) as failure_count
                 FROM patch_audit_log
                 WHERE patch_id = $1 
                   AND success = false
                   AND timestamp > NOW() - INTERVAL '1 hour'`,
                [patchId]
            );

            const failureCount = parseInt(recentFailures.rows[0].failure_count);

            // Decide if rollback is needed
            if (failureCount >= this.rollbackThresholds.buildFailures) {
                console.warn(
                    `Initiating automatic rollback for patch ${patchId} due to ${failureCount} failures`
                );

                await rollbackPatch(
                    patchId,
                    patch.process_id,
                    patch.project_id,
                    {
                        reason: `Automatic rollback: ${reason} (${failureCount} failures)`,
                        automatic: true,
                    }
                );
            }
        } catch (error) {
            console.error('Error evaluating rollback:', error);
        } finally {
            client.release();
        }
    }

    /**
     * Monitor build/test results after patch application
     */
    async monitorPostPatchHealth(
        patchId: number,
        projectId: string,
        checkInterval: number = 5 * 60 * 1000, // 5 minutes
        maxChecks: number = 6 // 30 minutes total
    ): Promise<void> {
        let checks = 0;

        const intervalId = setInterval(async () => {
            checks++;

            try {
                // Check various health indicators
                const health = await this.checkProjectHealth(projectId);

                if (!health.healthy) {
                    console.warn(
                        `Project ${projectId} unhealthy after patch ${patchId}: ${health.issues.join(', ')}`
                    );

                    // Record the health check failure
                    patchMonitor.recordPatchOperation(
                        projectId,
                        'system',
                        false,
                        `Health check failed: ${health.issues.join(', ')}`
                    );

                    // Evaluate if rollback is needed
                    await this.evaluateRollback(
                        patchId,
                        `Project health degraded: ${health.issues.join(', ')}`
                    );
                }

                if (checks >= maxChecks) {
                    clearInterval(intervalId);
                }
            } catch (error) {
                console.error('Error checking project health:', error);
            }
        }, checkInterval);

        // Stop monitoring after max time
        setTimeout(() => {
            clearInterval(intervalId);
        }, checkInterval * maxChecks);
    }

    /**
     * Check project health indicators
     */
    private async checkProjectHealth(
        projectId: string
    ): Promise<{ healthy: boolean; issues: string[] }> {
        const issues: string[] = [];

        // This is a placeholder - implement actual health checks based on your system
        // Examples:
        // - Check if build passes
        // - Check if tests pass
        // - Check application metrics
        // - Check error rates
        // - Check performance metrics

        try {
            // Example: Check recent error count
            const client = await getDB();
            try {
                const errorCheck = await client.query(
                    `SELECT COUNT(*) as error_count
                     FROM patch_audit_log
                     WHERE project_id = $1
                       AND success = false
                       AND timestamp > NOW() - INTERVAL '10 minutes'`,
                    [projectId]
                );

                const errorCount = parseInt(errorCheck.rows[0].error_count);
                if (errorCount > 5) {
                    issues.push(
                        `High error rate: ${errorCount} errors in 10 minutes`
                    );
                }
            } finally {
                client.release();
            }

            // Add more health checks here
        } catch (error) {
            issues.push(`Health check error: ${error.message}`);
        }

        return {
            healthy: issues.length === 0,
            issues,
        };
    }
}

// Global rollback service instance
export const rollbackService = new AutomaticRollbackService();
