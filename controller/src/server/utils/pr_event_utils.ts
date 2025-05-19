/**
 * Utilities for working with pull request events (successes, failures, reverts)
 */
import { getDB } from './db.js';
import {
    PullRequestEvent,
    PullRequestEventInput,
    PRResolution,
    PRStatus,
} from '../../types/index';
import { addProjectHistory } from './db_utils';

/**
 * Record a pull request event (success, failure, or revert)
 * @param eventData Information about the PR event
 * @returns Promise resolving to the ID of the new record, or null if recording failed
 */
export async function recordPrEvent(
    eventData: PullRequestEventInput
): Promise<number | null> {
    const db = await getDB();
    try {
        const { rows } = await db.query(
            `INSERT INTO pull_request_events
            (process_id, project_id, branch_name, commit_msg, metrics,
             error_message, merge_commit_sha, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id`,
            [
                eventData.processId,
                eventData.projectId,
                eventData.branchName,
                eventData.commitMsg,
                eventData.metrics ? JSON.stringify(eventData.metrics) : null,
                eventData.errorMessage || null,
                eventData.mergeCommitSha || null,
                eventData.status,
            ]
        );

        console.log(
            `[PR-Event] Recorded ${eventData.status} event ID ${rows[0].id} for branch ${eventData.branchName}`
        );

        // Also add to project history
        let actionType = 'PR_EVENT';
        switch (eventData.status) {
            case 'merged':
                actionType = 'PR_MERGED';
                break;
            case 'failed':
                actionType = 'PR_FAILURE';
                break;
            case 'reverted':
                actionType = 'PR_REVERTED';
                break;
        }

        await addProjectHistory(eventData.projectId, actionType, {
            branch: eventData.branchName,
            status: eventData.status,
            message: eventData.errorMessage
                ? eventData.errorMessage.substring(0, 100) +
                  (eventData.errorMessage.length > 100 ? '...' : '')
                : `Branch '${eventData.branchName}' ${eventData.status}`,
            eventId: rows[0].id,
        });

        return rows[0].id;
    } catch (error) {
        console.error('Error recording PR event:', error);
        return null;
    } finally {
        db.release();
    }
}

/**
 * Convenience function to record a successful merge
 */
export async function recordMerge(
    data: Omit<PullRequestEventInput, 'status' | 'errorMessage'> & {
        mergeCommitSha: string;
    }
): Promise<number | null> {
    return recordPrEvent({
        ...data,
        status: 'merged',
    });
}

/**
 * Convenience function to record a PR failure, for backward compatibility
 */
export async function recordPrFailure(
    data: Omit<PullRequestEventInput, 'status' | 'mergeCommitSha'> & {
        errorMessage: string;
    }
): Promise<number | null> {
    return recordPrEvent({
        ...data,
        status: 'failed',
    });
}

/**
 * Get all pull request events, optionally filtered by project ID
 * @param projectId Optional project ID to filter by
 * @param status Optional status to filter by
 * @returns Promise resolving to an array of PullRequestEvent objects
 */
export async function getPrEvents(
    projectId?: string,
    status?: PRStatus
): Promise<PullRequestEvent[]> {
    const db = await getDB();
    try {
        let query = 'SELECT * FROM pull_request_events';
        const params: any[] = [];

        if (projectId || status) {
            query += ' WHERE';

            if (projectId) {
                query += ' project_id = $1';
                params.push(projectId);
            }

            if (status) {
                if (params.length > 0) {
                    query += ' AND';
                }
                query += ` status = $${params.length + 1}`;
                params.push(status);
            }
        }

        query += ' ORDER BY created_at DESC';

        const { rows } = await db.query(query, params);
        return rows;
    } catch (error) {
        console.error('Error fetching PR events:', error);
        return [];
    } finally {
        db.release();
    }
}

/**
 * Get details of a specific pull request event
 * @param id The ID of the PR event
 * @returns Promise resolving to the PullRequestEvent or null if not found
 */
export async function getPrEventById(
    id: number
): Promise<PullRequestEvent | null> {
    const db = await getDB();
    try {
        const { rows } = await db.query(
            'SELECT * FROM pull_request_events WHERE id = $1',
            [id]
        );
        if (rows.length > 0) {
            return rows[0];
        } else {
            return null;
        }
    } catch (error) {
        console.error(`Error getting PR event ${id}:`, error);
        return null;
    } finally {
        db.release();
    }
}

/**
 * Update a pull request event with new status and additional info
 * @param id The ID of the PR event to update
 * @param userId The ID/email of the user updating the PR
 * @param status The new status
 * @param resolution Optional resolution status
 * @param commitSha Optional commit SHA (for reverts)
 * @returns Promise resolving to true if the update succeeded
 */
export async function updatePrEvent(
    id: number,
    userId: string,
    status: PRStatus,
    resolution?: PRResolution,
    commitSha?: string
): Promise<boolean> {
    const db = await getDB();
    try {
        const updates: string[] = [
            'status = $1',
            'resolved_at = NOW()',
            'resolved_by = $2',
        ];
        const params: any[] = [status, userId];

        let paramIndex = 3;

        // Set resolution if provided
        if (resolution !== undefined) {
            updates.push(`resolution = $${paramIndex}`);
            params.push(resolution);
            paramIndex++;
        }

        // Set commit SHA if provided
        if (commitSha) {
            updates.push(`merge_commit_sha = $${paramIndex}`);
            params.push(commitSha);
            paramIndex++;
        }

        params.push(id); // Last parameter is always the ID

        await db.query(
            `UPDATE pull_request_events
                SET ${updates.join(', ')}
                WHERE id = $${paramIndex}`,
            params
        );

        // Get the project_id to update history
        const { rows } = await db.query(
            'SELECT project_id, branch_name FROM pull_request_events WHERE id = $1',
            [id]
        );

        if (rows.length > 0) {
            await addProjectHistory(rows[0].project_id, 'PR_STATUS_UPDATED', {
                branch: rows[0].branch_name,
                newStatus: status,
                resolution,
                updatedBy: userId,
            });
        }

        return true;
    } catch (error) {
        console.error(`Error updating PR event ${id}:`, error);
        return false;
    } finally {
        db.release();
    }
}

/**
 * Revert a previously merged PR
 * @param id The ID of the PR event to revert
 * @param userId The ID/email of the user reverting the PR
 * @param revertCommitSha The SHA of the revert commit
 * @returns Promise resolving to true if the revert succeeded
 */
export async function revertPrEvent(
    id: number,
    userId: string,
    revertCommitSha: string
): Promise<boolean> {
    return updatePrEvent(
        id,
        userId,
        'reverted',
        null, // No resolution needed
        revertCommitSha
    );
}
