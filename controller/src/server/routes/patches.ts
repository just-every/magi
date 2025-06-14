/**
 * API routes for managing git patches
 */
import { Router, Request, Response } from 'express';
import path from 'path';
import { getDB } from '../utils/db.js';
import {
    getPatchesWithRiskAssessment,
    applyPatch,
    analyzePatchConflicts,
    processPendingPatches,
} from '../utils/patch_manager.js';
import {
    suggestConflictResolution,
    attemptAutoResolve,
    createConflictResolutionTask,
} from '../utils/conflict_resolver.js';

const router = Router();

// Get all patches with risk assessment
router.get('/', async (req: Request, res: Response) => {
    try {
        const { projectId } = req.query;
        const patches = await getPatchesWithRiskAssessment(projectId as string);

        res.json({
            success: true,
            data: patches,
        });
    } catch (error) {
        console.error('Error fetching patches:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch patches',
        });
    }
});

// Get a specific patch with its content
router.get('/:id', async (req: Request, res: Response) => {
    const { id } = req.params;

    const client = await getDB();
    try {
        const result = await client.query(
            'SELECT * FROM patches WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Patch not found',
            });
        }

        res.json({
            success: true,
            data: result.rows[0],
        });
    } catch (error) {
        console.error(`Error fetching patch ${id}:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch patch',
        });
    } finally {
        client.release();
    }
});

// Apply a patch (manual merge)
router.post('/:id/apply', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { projectId, processId } = req.body;

    if (!projectId || !processId) {
        return res.status(400).json({
            success: false,
            error: 'projectId and processId are required',
        });
    }

    // Validate IDs to prevent path traversal
    const validIdPattern = /^[a-zA-Z0-9_-]+$/;
    if (!validIdPattern.test(processId) || !validIdPattern.test(projectId)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid ID format',
        });
    }

    try {
        const patchId = parseInt(id);
        const projectPath = path.join(
            '/magi_output',
            processId,
            'projects',
            projectId
        );

        // Check for conflicts first
        const conflictCheck = await analyzePatchConflicts(patchId, projectPath);

        if (conflictCheck.hasConflicts) {
            return res.status(409).json({
                success: false,
                error: 'Patch has conflicts',
                conflicts: conflictCheck.conflictFiles,
                suggestion: conflictCheck.suggestion,
            });
        }

        // Apply the patch
        const result = await applyPatch(patchId, projectPath, false);

        if (result.success) {
            res.json({
                success: true,
                message: 'Patch applied successfully',
                mergeCommitSha: result.mergeCommitSha,
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error || 'Failed to apply patch',
            });
        }
    } catch (error) {
        console.error(`Error applying patch ${id}:`, error);
        res.status(500).json({
            success: false,
            error: `Failed to apply patch: ${error.message}`,
        });
    }
});

// Check patch conflicts
router.post('/:id/check-conflicts', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { projectId, processId } = req.body;

    if (!projectId || !processId) {
        return res.status(400).json({
            success: false,
            error: 'projectId and processId are required',
        });
    }

    // Validate IDs to prevent path traversal
    const validIdPattern = /^[a-zA-Z0-9_-]+$/;
    if (!validIdPattern.test(processId) || !validIdPattern.test(projectId)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid ID format',
        });
    }

    try {
        const patchId = parseInt(id);
        const projectPath = path.join(
            '/magi_output',
            processId,
            'projects',
            projectId
        );

        const conflictCheck = await analyzePatchConflicts(patchId, projectPath);

        res.json({
            success: true,
            hasConflicts: conflictCheck.hasConflicts,
            conflictFiles: conflictCheck.conflictFiles,
            suggestion: conflictCheck.suggestion,
        });
    } catch (error) {
        console.error(`Error checking conflicts for patch ${id}:`, error);
        res.status(500).json({
            success: false,
            error: `Failed to check conflicts: ${error.message}`,
        });
    }
});

// Reject a patch
router.post('/:id/reject', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body;

    const client = await getDB();
    try {
        await client.query(
            `UPDATE patches 
             SET status = 'rejected', 
                 rejection_reason = $2
             WHERE id = $1`,
            [id, reason || 'Rejected by user']
        );

        res.json({
            success: true,
            message: 'Patch rejected',
        });
    } catch (error) {
        console.error(`Error rejecting patch ${id}:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to reject patch',
        });
    } finally {
        client.release();
    }
});

// Process pending patches for auto-merge
router.post('/process-pending', async (req: Request, res: Response) => {
    const { projectId } = req.body;

    try {
        const result = await processPendingPatches(projectId);

        res.json({
            success: true,
            ...result,
        });
    } catch (error) {
        console.error('Error processing pending patches:', error);
        res.status(500).json({
            success: false,
            error: `Failed to process pending patches: ${error.message}`,
        });
    }
});

// Get conflict resolution suggestions
router.post(
    '/:id/conflict-suggestions',
    async (req: Request, res: Response) => {
        const { id } = req.params;
        const { projectId, processId, conflictFiles } = req.body;

        if (!projectId || !processId || !conflictFiles) {
            return res.status(400).json({
                success: false,
                error: 'projectId, processId, and conflictFiles are required',
            });
        }

        try {
            const patchId = parseInt(id);
            const projectPath = path.join(
                '/magi_output',
                processId,
                'projects',
                projectId
            );

            const suggestions = await suggestConflictResolution(
                patchId,
                projectPath,
                conflictFiles
            );

            res.json({
                success: true,
                suggestions,
            });
        } catch (error) {
            console.error(
                `Error getting conflict suggestions for patch ${id}:`,
                error
            );
            res.status(500).json({
                success: false,
                error: `Failed to get suggestions: ${error.message}`,
            });
        }
    }
);

// Attempt automatic conflict resolution
router.post('/:id/auto-resolve', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { projectId, processId } = req.body;

    if (!projectId || !processId) {
        return res.status(400).json({
            success: false,
            error: 'projectId and processId are required',
        });
    }

    // Validate IDs to prevent path traversal
    const validIdPattern = /^[a-zA-Z0-9_-]+$/;
    if (!validIdPattern.test(processId) || !validIdPattern.test(projectId)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid ID format',
        });
    }

    try {
        const patchId = parseInt(id);
        const projectPath = path.join(
            '/magi_output',
            processId,
            'projects',
            projectId
        );

        const result = await attemptAutoResolve(patchId, projectPath);

        if (result.success) {
            res.json({
                success: true,
                message: 'Conflicts resolved automatically',
                newPatchId: result.newPatchId,
            });
        } else {
            res.status(409).json({
                success: false,
                error: result.error || 'Auto-resolution failed',
            });
        }
    } catch (error) {
        console.error(`Error auto-resolving patch ${id}:`, error);
        res.status(500).json({
            success: false,
            error: `Failed to auto-resolve: ${error.message}`,
        });
    }
});

// Create conflict resolution task for agent
router.post(
    '/:id/create-resolution-task',
    async (req: Request, res: Response) => {
        const { id } = req.params;
        const { projectId, conflictFiles, strategy } = req.body;

        if (!projectId || !conflictFiles || !strategy) {
            return res.status(400).json({
                success: false,
                error: 'projectId, conflictFiles, and strategy are required',
            });
        }

        try {
            const patchId = parseInt(id);

            const taskDescription = await createConflictResolutionTask(
                patchId,
                projectId,
                conflictFiles,
                strategy
            );

            res.json({
                success: true,
                taskDescription,
            });
        } catch (error) {
            console.error(
                `Error creating resolution task for patch ${id}:`,
                error
            );
            res.status(500).json({
                success: false,
                error: `Failed to create task: ${error.message}`,
            });
        }
    }
);

export default router;
