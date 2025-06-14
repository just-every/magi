/**
 * Patch Monitoring and Anomaly Detection Module
 * 
 * Provides real-time monitoring and anomaly detection for patch operations
 */

import { getDB } from './db.js';
import { EventEmitter } from 'events';

export interface PatchAnomalyEvent {
    type: 'high_volume' | 'unusual_pattern' | 'repeated_failure' | 'suspicious_content';
    severity: 'low' | 'medium' | 'high' | 'critical';
    details: string;
    recommendation: string;
    timestamp: Date;
    data?: any;
}

export class PatchMonitor extends EventEmitter {
    private metrics: {
        patchesPerHour: Map<string, number>;
        failureRate: Map<string, { success: number; failed: number }>;
        userActivity: Map<string, number>;
        suspiciousPatterns: Map<string, number>;
    };

    private readonly thresholds = {
        maxPatchesPerHour: parseInt(process.env.MAX_PATCHES_PER_HOUR || '50'),
        maxFailureRate: parseFloat(process.env.MAX_FAILURE_RATE || '0.3'),
        maxUserPatchesPerHour: parseInt(process.env.MAX_USER_PATCHES_PER_HOUR || '20'),
    };

    constructor() {
        super();
        this.metrics = {
            patchesPerHour: new Map(),
            failureRate: new Map(),
            userActivity: new Map(),
            suspiciousPatterns: new Map(),
        };

        // Reset hourly metrics
        setInterval(() => this.resetHourlyMetrics(), 60 * 60 * 1000);
        
        // Run anomaly detection every 5 minutes
        setInterval(() => this.detectAnomalies(), 5 * 60 * 1000);
    }

    /**
     * Record a patch operation
     */
    recordPatchOperation(
        projectId: string,
        userId: string | undefined,
        success: boolean,
        patchContent?: string
    ): void {
        const hour = new Date().toISOString().substring(0, 13);
        
        // Update patches per hour
        const hourKey = `${projectId}:${hour}`;
        this.metrics.patchesPerHour.set(
            hourKey,
            (this.metrics.patchesPerHour.get(hourKey) || 0) + 1
        );

        // Update failure rate
        const failureKey = projectId;
        const current = this.metrics.failureRate.get(failureKey) || {
            success: 0,
            failed: 0,
        };
        if (success) {
            current.success++;
        } else {
            current.failed++;
        }
        this.metrics.failureRate.set(failureKey, current);

        // Update user activity
        if (userId) {
            const userKey = `${userId}:${hour}`;
            this.metrics.userActivity.set(
                userKey,
                (this.metrics.userActivity.get(userKey) || 0) + 1
            );
        }

        // Check for suspicious patterns
        if (patchContent) {
            this.analyzePatchContent(patchContent, projectId);
        }
    }

    /**
     * Analyze patch content for suspicious patterns
     */
    private analyzePatchContent(content: string, projectId: string): void {
        const suspiciousPatterns = [
            { pattern: /exec\s*\(/g, name: 'exec_calls' },
            { pattern: /eval\s*\(/g, name: 'eval_calls' },
            { pattern: /base64/gi, name: 'base64_encoding' },
            { pattern: /\\x[0-9a-f]{2}/gi, name: 'hex_encoding' },
            { pattern: /127\.0\.0\.1:\d+/g, name: 'localhost_ports' },
            { pattern: /nc\s+-l/g, name: 'netcat_listener' },
            { pattern: /wget.*\|.*sh/gi, name: 'download_execute' },
            { pattern: /curl.*\|.*bash/gi, name: 'curl_pipe_bash' },
        ];

        for (const { pattern, name } of suspiciousPatterns) {
            const matches = content.match(pattern);
            if (matches && matches.length > 0) {
                const key = `${projectId}:${name}`;
                this.metrics.suspiciousPatterns.set(
                    key,
                    (this.metrics.suspiciousPatterns.get(key) || 0) + matches.length
                );
            }
        }
    }

    /**
     * Detect anomalies in patch operations
     */
    private async detectAnomalies(): Promise<void> {
        const hour = new Date().toISOString().substring(0, 13);

        // Check patch volume
        for (const [key, count] of this.metrics.patchesPerHour) {
            if (key.endsWith(hour) && count > this.thresholds.maxPatchesPerHour) {
                const [projectId] = key.split(':');
                this.emit('anomaly', {
                    type: 'high_volume',
                    severity: 'high',
                    details: `Project ${projectId} has ${count} patches in the last hour`,
                    recommendation: 'Review patch sources and consider temporary rate limiting',
                    timestamp: new Date(),
                    data: { projectId, count },
                } as PatchAnomalyEvent);
            }
        }

        // Check failure rates
        for (const [projectId, stats] of this.metrics.failureRate) {
            const total = stats.success + stats.failed;
            if (total > 10) { // Only check if we have enough data
                const failureRate = stats.failed / total;
                if (failureRate > this.thresholds.maxFailureRate) {
                    this.emit('anomaly', {
                        type: 'repeated_failure',
                        severity: 'medium',
                        details: `Project ${projectId} has ${Math.round(failureRate * 100)}% failure rate`,
                        recommendation: 'Investigate patch compatibility issues',
                        timestamp: new Date(),
                        data: { projectId, failureRate, stats },
                    } as PatchAnomalyEvent);
                }
            }
        }

        // Check user activity
        for (const [key, count] of this.metrics.userActivity) {
            if (key.endsWith(hour) && count > this.thresholds.maxUserPatchesPerHour) {
                const [userId] = key.split(':');
                this.emit('anomaly', {
                    type: 'high_volume',
                    severity: 'medium',
                    details: `User ${userId} submitted ${count} patches in the last hour`,
                    recommendation: 'Verify user activity is legitimate',
                    timestamp: new Date(),
                    data: { userId, count },
                } as PatchAnomalyEvent);
            }
        }

        // Check suspicious patterns
        const suspiciousThreshold = 5;
        for (const [key, count] of this.metrics.suspiciousPatterns) {
            if (count > suspiciousThreshold) {
                const [projectId, pattern] = key.split(':');
                this.emit('anomaly', {
                    type: 'suspicious_content',
                    severity: 'critical',
                    details: `Project ${projectId} has ${count} instances of ${pattern}`,
                    recommendation: 'Manual security review required',
                    timestamp: new Date(),
                    data: { projectId, pattern, count },
                } as PatchAnomalyEvent);
            }
        }

        // Check database for additional patterns
        await this.checkDatabaseAnomalies();
    }

    /**
     * Check database for anomalies
     */
    private async checkDatabaseAnomalies(): Promise<void> {
        const client = await getDB();
        
        try {
            // Check for patches from same source with different content
            const duplicateCheck = await client.query(`
                SELECT p1.project_id, p1.branch_name, COUNT(DISTINCT p1.patch_signature) as variants
                FROM patches p1
                WHERE p1.created_at > NOW() - INTERVAL '1 hour'
                  AND p1.status = 'pending'
                GROUP BY p1.project_id, p1.branch_name
                HAVING COUNT(DISTINCT p1.patch_signature) > 3
            `);

            for (const row of duplicateCheck.rows) {
                this.emit('anomaly', {
                    type: 'unusual_pattern',
                    severity: 'medium',
                    details: `Branch ${row.branch_name} has ${row.variants} different patch variants`,
                    recommendation: 'Review patch generation logic',
                    timestamp: new Date(),
                    data: row,
                } as PatchAnomalyEvent);
            }

            // Check for rapid status changes
            const rapidChanges = await client.query(`
                SELECT patch_id, COUNT(*) as change_count
                FROM patch_audit_log
                WHERE timestamp > NOW() - INTERVAL '10 minutes'
                GROUP BY patch_id
                HAVING COUNT(*) > 5
            `);

            for (const row of rapidChanges.rows) {
                this.emit('anomaly', {
                    type: 'unusual_pattern',
                    severity: 'high',
                    details: `Patch ${row.patch_id} has ${row.change_count} status changes in 10 minutes`,
                    recommendation: 'Investigate potential automation issue',
                    timestamp: new Date(),
                    data: row,
                } as PatchAnomalyEvent);
            }

        } catch (error) {
            console.error('Error checking database anomalies:', error);
        } finally {
            client.release();
        }
    }

    /**
     * Reset hourly metrics
     */
    private resetHourlyMetrics(): void {
        const currentHour = new Date().toISOString().substring(0, 13);
        
        // Clean up old hourly data
        for (const key of this.metrics.patchesPerHour.keys()) {
            if (!key.endsWith(currentHour)) {
                this.metrics.patchesPerHour.delete(key);
            }
        }

        for (const key of this.metrics.userActivity.keys()) {
            if (!key.endsWith(currentHour)) {
                this.metrics.userActivity.delete(key);
            }
        }

        // Reset failure rates if they're getting old
        if (this.metrics.failureRate.size > 100) {
            this.metrics.failureRate.clear();
        }

        // Clear old suspicious patterns
        if (this.metrics.suspiciousPatterns.size > 100) {
            this.metrics.suspiciousPatterns.clear();
        }
    }

    /**
     * Get current metrics summary
     */
    getMetricsSummary(): any {
        const hour = new Date().toISOString().substring(0, 13);
        const summary = {
            currentHour: {
                totalPatches: 0,
                activeProjects: new Set<string>(),
                activeUsers: new Set<string>(),
            },
            failureRates: {} as Record<string, number>,
            suspiciousPatterns: {} as Record<string, number>,
        };

        // Calculate current hour stats
        for (const [key, count] of this.metrics.patchesPerHour) {
            if (key.endsWith(hour)) {
                summary.currentHour.totalPatches += count;
                const [projectId] = key.split(':');
                summary.currentHour.activeProjects.add(projectId);
            }
        }

        for (const [key, count] of this.metrics.userActivity) {
            if (key.endsWith(hour)) {
                const [userId] = key.split(':');
                summary.currentHour.activeUsers.add(userId);
            }
        }

        // Calculate failure rates
        for (const [projectId, stats] of this.metrics.failureRate) {
            const total = stats.success + stats.failed;
            if (total > 0) {
                summary.failureRates[projectId] = stats.failed / total;
            }
        }

        // Aggregate suspicious patterns
        for (const [key, count] of this.metrics.suspiciousPatterns) {
            const [, pattern] = key.split(':');
            summary.suspiciousPatterns[pattern] = 
                (summary.suspiciousPatterns[pattern] || 0) + count;
        }

        return {
            ...summary,
            currentHour: {
                ...summary.currentHour,
                activeProjects: summary.currentHour.activeProjects.size,
                activeUsers: summary.currentHour.activeUsers.size,
            },
        };
    }
}

// Global monitor instance
export const patchMonitor = new PatchMonitor();

// Set up anomaly handling
patchMonitor.on('anomaly', (event: PatchAnomalyEvent) => {
    console.warn('[PATCH ANOMALY]', event);
    
    // Here you could:
    // - Send alerts to administrators
    // - Automatically increase rate limits
    // - Trigger additional security scans
    // - Block suspicious users/projects temporarily
});