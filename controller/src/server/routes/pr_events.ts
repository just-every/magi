/**
 * PR Events Routes
 *
 * API endpoints for managing pull request events
 */
import { Router } from 'express';
import { execSync } from 'child_process';
import path from 'path';
import {
    getPrEvents,
    getPrEventById,
    revertPrEvent,
} from '../utils/pr_event_utils';

const router = Router();

/**
 * Get all PR events, optionally filtered by project ID and status
 */
router.get('/', async (req, res) => {
    try {
        const { projectId, status } = req.query;
        const events = await getPrEvents(
            projectId as string | undefined,
            status as any
        );
        res.json(events);
    } catch (error) {
        console.error('Error fetching PR events:', error);
        res.status(500).json({ error: 'Failed to fetch PR events' });
    }
});

/**
 * Get a specific PR event by ID
 */
router.get('/:id', async (req: any, res: any) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid event ID' });
        }

        const event = await getPrEventById(id);
        if (!event) {
            return res.status(404).json({ error: 'PR event not found' });
        }

        res.json(event);
    } catch (error) {
        console.error(`Error fetching PR event ${req.params.id}:`, error);
        res.status(500).json({ error: 'Failed to fetch PR event' });
    }
});

/**
 * Revert a PR merge
 */
router.post('/:id/revert', async (req: any, res: any) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid event ID' });
        }

        // Get the PR event to check if it can be reverted
        const event = await getPrEventById(id);
        if (!event) {
            return res.status(404).json({ error: 'PR event not found' });
        }

        // Check if this is a merged PR that can be reverted
        if (event.status !== 'merged' || !event.merge_commit_sha) {
            return res.status(400).json({
                error: 'Only merged PRs with a commit SHA can be reverted',
            });
        }

        // Get user from request
        const userId = req.body.userId || (req as any).user?.email || 'Unknown';

        // Resolve project path
        // This assumes the same structure as used in git_push.ts
        const projectPath = path.join(
            '/magi_output',
            event.process_id,
            'projects',
            event.project_id
        );

        // Perform the git revert
        let revertCommitSha;
        try {
            // Check out default branch and pull latest
            execSync(
                `cd "${projectPath}" && git checkout main || git checkout master`,
                {
                    stdio: 'pipe',
                }
            );
            execSync(`cd "${projectPath}" && git pull`, {
                stdio: 'pipe',
            });

            // Do the revert
            execSync(
                `cd "${projectPath}" && git revert -m 1 ${event.merge_commit_sha} -m "Revert '${event.commit_msg}' (PR #${id})"`,
                { stdio: 'pipe' }
            );

            // Push the revert
            execSync(`cd "${projectPath}" && git push`, {
                stdio: 'pipe',
            });

            // Get the SHA of the revert commit
            revertCommitSha = execSync(
                `cd "${projectPath}" && git rev-parse HEAD`,
                {
                    encoding: 'utf8',
                    stdio: 'pipe',
                }
            ).trim();

            console.log(
                `[PR-Revert] Reverted PR ${id} with commit ${revertCommitSha}`
            );
        } catch (gitError) {
            console.error('Git error during revert:', gitError);
            return res.status(500).json({
                error: `Git operation failed: ${gitError.message || gitError}`,
            });
        }

        // Update event status in the database
        const updated = await revertPrEvent(id, userId, revertCommitSha);
        if (!updated) {
            return res.status(500).json({
                error: 'Git revert was successful but database update failed',
            });
        }

        // Get the updated event
        const updatedEvent = await getPrEventById(id);
        res.json(updatedEvent);
    } catch (error) {
        console.error(`Error reverting PR event ${req.params.id}:`, error);
        res.status(500).json({ error: 'Failed to revert PR event' });
    }
});

export default router;
