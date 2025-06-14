/**
 * API routes for managing git patches
 */
import { Router, Request, Response } from 'express';
import { getDB } from '../utils/db';

const router = Router();

// Get all patches
router.get('/', async (req: Request, res: Response) => {
    const client = await getDB();
    try {
        const result = await client.query(
            `SELECT id, process_id, project_id, branch_name, commit_message, 
                    metrics, status, created_at, applied_at, applied_by
             FROM patches 
             ORDER BY created_at DESC 
             LIMIT 100`
        );

        res.json({
            success: true,
            data: result.rows,
        });
    } catch (error) {
        console.error('Error fetching patches:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch patches',
        });
    } finally {
        client.release();
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

// Apply a patch
router.post('/:id/apply', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { projectPath } = req.body;

    if (!projectPath) {
        return res.status(400).json({
            success: false,
            error: 'projectPath is required',
        });
    }

    const client = await getDB();
    try {
        // Get the patch content
        const patchResult = await client.query(
            "SELECT * FROM patches WHERE id = $1 AND status = 'pending'",
            [id]
        );

        if (patchResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Patch not found or already applied',
            });
        }

        const patch = patchResult.rows[0];

        // Apply the patch using git apply
        const { execSync } = require('child_process');
        try {
            // Write patch to temporary file
            const fs = require('fs');
            const path = require('path');
            const tmpFile = path.join('/tmp', `patch-${id}.patch`);
            fs.writeFileSync(tmpFile, patch.patch_content);

            // Apply the patch
            execSync(`git -C "${projectPath}" apply "${tmpFile}"`, {
                stdio: 'pipe',
            });

            // Clean up temp file
            fs.unlinkSync(tmpFile);

            // Update patch status in database
            await client.query(
                `UPDATE patches 
                 SET status = 'applied', 
                     applied_at = NOW(), 
                     applied_by = $2
                 WHERE id = $1`,
                [id, 'user'] // TODO: Get actual user from session
            );

            res.json({
                success: true,
                message: 'Patch applied successfully',
            });
        } catch (error) {
            console.error(`Error applying patch ${id}:`, error);
            res.status(500).json({
                success: false,
                error: `Failed to apply patch: ${error.message}`,
            });
        }
    } catch (error) {
        console.error(`Error processing patch ${id}:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to process patch',
        });
    } finally {
        client.release();
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

export default router;
