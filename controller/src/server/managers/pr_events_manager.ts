/**
 * Pull Request Events Manager
 *
 * Handles the interface between PR event recording (successes, failures, reverts)
 * and UI notifications.
 */
import { Server as SocketIOServer } from 'socket.io';
import {
    PRResolution,
    PRStatus,
    PullRequestEventInput,
} from '../../types/index';
import {
    recordPrEvent,
    recordPrFailure,
    recordMerge,
    updatePrEvent,
    revertPrEvent,
} from '../utils/pr_event_utils';

export class PREventsManager {
    private io: SocketIOServer;

    constructor(io: SocketIOServer) {
        this.io = io;
    }

    /**
     * Record a new PR event and emit socket event
     */
    async recordEvent(
        eventData: PullRequestEventInput
    ): Promise<number | null> {
        try {
            const eventId = await recordPrEvent(eventData);

            if (eventId) {
                // Notify all clients based on event type
                this.io.emit('pull_request_event', {
                    id: eventId,
                    status: eventData.status,
                    project: eventData.projectId,
                    branch: eventData.branchName,
                });

                // For failures, also emit the waiting notification for backward compatibility
                if (eventData.status === 'failed') {
                    this.io.emit('pull_request_waiting');
                }

                console.log(
                    `[PR-Event] Broadcasting ${eventData.status} notification for ID ${eventId}`
                );
            }

            return eventId;
        } catch (error) {
            console.error('Error in recordEvent:', error);
            return null;
        }
    }

    /**
     * Record a PR failure (convenience method, backward compatible)
     */
    async recordFailure(
        failureData: Omit<PullRequestEventInput, 'status'> & {
            errorMessage: string;
        }
    ): Promise<number | null> {
        try {
            // Forward to existing recordPrFailure function for now to maintain compatibility
            const failureId = await recordPrFailure(failureData);

            if (failureId) {
                // Notify all clients that a new PR failure is waiting
                this.io.emit('pull_request_waiting');
                this.io.emit('pull_request_event', {
                    id: failureId,
                    status: 'failed',
                    project: failureData.projectId,
                    branch: failureData.branchName,
                });

                console.log(
                    `[PR-Failure] Broadcasting failure notification for ID ${failureId}`
                );
            }

            return failureId;
        } catch (error) {
            console.error('Error in recordFailure:', error);
            return null;
        }
    }

    /**
     * Record a PR success (convenience method)
     */
    async recordMerge(
        mergeData: Omit<PullRequestEventInput, 'status' | 'errorMessage'> & {
            mergeCommitSha: string;
        }
    ): Promise<number | null> {
        try {
            const eventId = await recordMerge(mergeData);

            if (eventId) {
                // Notify all clients about the merge
                this.io.emit('pull_request_event', {
                    id: eventId,
                    status: 'merged',
                    project: mergeData.projectId,
                    branch: mergeData.branchName,
                    sha: mergeData.mergeCommitSha,
                });

                console.log(
                    `[PR-Merge] Broadcasting merge notification for ID ${eventId}`
                );
            }

            return eventId;
        } catch (error) {
            console.error('Error in recordMerge:', error);
            return null;
        }
    }

    /**
     * Update a PR event status and emit socket event
     */
    async updateEvent(
        id: number,
        userId: string,
        status: PRStatus,
        resolution?: PRResolution,
        commitSha?: string
    ): Promise<boolean> {
        try {
            const result = await updatePrEvent(
                id,
                userId,
                status,
                resolution,
                commitSha
            );

            if (result) {
                // Notify all clients that a PR event has been updated
                this.io.emit('pull_request_updated', {
                    id,
                    status,
                    resolution,
                    updatedBy: userId,
                });

                console.log(
                    `[PR-Event] Broadcasting update notification for ID ${id} to ${status}`
                );
            }

            return result;
        } catch (error) {
            console.error(`Error updating PR event ${id}:`, error);
            return false;
        }
    }

    /**
     * Revert a PR merge and emit socket event
     */
    async revertMerge(
        id: number,
        userId: string,
        revertCommitSha: string
    ): Promise<boolean> {
        try {
            const result = await revertPrEvent(id, userId, revertCommitSha);

            if (result) {
                // Notify all clients that a PR has been reverted
                this.io.emit('pull_request_updated', {
                    id,
                    status: 'reverted',
                    revertedBy: userId,
                    revertCommitSha,
                });

                console.log(
                    `[PR-Event] Broadcasting revert notification for ID ${id}`
                );
            }

            return result;
        } catch (error) {
            console.error(`Error reverting PR ${id}:`, error);
            return false;
        }
    }

    /**
     * Resolve a PR failure (for backward compatibility)
     */
    async resolveFailure(
        id: number,
        userId: string,
        resolution: PRResolution
    ): Promise<boolean> {
        return this.updateEvent(id, userId, 'resolved', resolution);
    }
}
