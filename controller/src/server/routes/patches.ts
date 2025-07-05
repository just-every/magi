/**
 * API routes for managing git patches
 */
import { Router, Request, Response } from 'express';
import path from 'path';
import { getDB } from '../utils/db.js';
import { getProject } from '../utils/db_utils.js';
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
import { computeMetrics } from '../managers/commit_metrics.js';
import { exec } from 'child_process';
import { promisify } from 'util';
const execPromise = promisify(exec);

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

// Get extended information for a patch
router.get('/:id/extended', async (req: Request, res: Response) => {
    const { id } = req.params;

    const client = await getDB();
    try {
        // Get patch details
        const patchResult = await client.query(
            'SELECT * FROM patches WHERE id = $1',
            [id]
        );

        if (patchResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Patch not found',
            });
        }

        const patch = patchResult.rows[0];
        const projectPath = path.join('/external/host', patch.project_id);

        // Initialize extended info object
        const extendedInfo: any = {};

        // Get test results if available
        try {
            // Check if tests have been run for this patch
            const testResult = await client.query(
                `SELECT test_status, test_summary, test_details, created_at 
                 FROM patch_test_results 
                 WHERE patch_id = $1 
                 ORDER BY created_at DESC 
                 LIMIT 1`,
                [id]
            );

            if (testResult.rows.length > 0) {
                const test = testResult.rows[0];
                extendedInfo.testResults = {
                    status: test.test_status,
                    summary: test.test_summary,
                    details: test.test_details,
                    timestamp: test.created_at,
                };
            }
        } catch (_err) {
            console.log('No test results table or data available');
        }

        // Get code quality metrics
        try {
            const metrics = await computeMetrics(projectPath);
            extendedInfo.codeQualityMetrics = {
                entropyNormalised: metrics.entropyNormalised,
                churnRatio: metrics.churnRatio,
                cyclomaticDelta: metrics.cyclomaticDelta,
                developerUnfamiliarity: metrics.developerUnfamiliarity,
                secretRegexHits: metrics.secretRegexHits,
                apiSignatureEdits: metrics.apiSignatureEdits,
                controlFlowEdits: metrics.controlFlowEdits,
            };
        } catch (err) {
            console.error('Failed to compute code quality metrics:', err);
        }

        // Get affected files with detailed stats
        try {
            const { stdout: diffNumstat } = await execPromise(
                `cd "${projectPath}" && git diff --numstat ${patch.base_commit || 'HEAD~1'} HEAD`,
                { maxBuffer: 10 * 1024 * 1024 }
            );

            const affectedFiles = [];
            const lines = diffNumstat.trim().split('\n').filter(Boolean);

            for (const line of lines) {
                const [adds, dels, filePath] = line.split('\t');
                if (filePath) {
                    // Get number of hunks for this file
                    const { stdout: hunksOutput } = await execPromise(
                        `cd "${projectPath}" && git diff -U0 ${patch.base_commit || 'HEAD~1'} HEAD -- "${filePath}" | grep -c "^@@" || true`,
                        { maxBuffer: 1024 * 1024 }
                    );

                    affectedFiles.push({
                        path: filePath,
                        additions: adds === '-' ? 0 : parseInt(adds, 10),
                        deletions: dels === '-' ? 0 : parseInt(dels, 10),
                        hunks: parseInt(hunksOutput.trim()) || 0,
                    });
                }
            }

            extendedInfo.affectedFiles = affectedFiles;
        } catch (err) {
            console.error('Failed to get affected files:', err);
        }

        // Get PR description from process logs or patch message
        try {
            // Try to get PR description from process logs
            const prDescResult = await client.query(
                `SELECT message FROM process_logs 
                 WHERE process_id = $1 
                 AND message LIKE '%PR Description:%' 
                 ORDER BY created_at DESC 
                 LIMIT 1`,
                [patch.process_id]
            );

            if (prDescResult.rows.length > 0) {
                const prDescMatch = prDescResult.rows[0].message.match(
                    /PR Description:\s*([\s\S]*?)(?=\n\n|$)/
                );
                if (prDescMatch) {
                    extendedInfo.prDescription = prDescMatch[1].trim();
                }
            } else {
                // Fallback to commit message if no PR description
                extendedInfo.prDescription = patch.commit_message;
            }
        } catch (err) {
            console.error('Failed to get PR description:', err);
        }

        // Get base and head commits
        extendedInfo.baseCommit = patch.base_commit;
        extendedInfo.headCommit = patch.head_commit;

        // Check for conflicts
        try {
            const conflictAnalysis = await analyzePatchConflicts(
                parseInt(id),
                projectPath
            );
            extendedInfo.conflictAnalysis = conflictAnalysis;
        } catch (err) {
            console.error('Failed to analyze conflicts:', err);
        }

        res.json({
            success: true,
            data: extendedInfo,
        });
    } catch (error) {
        console.error(`Error fetching extended info for patch ${id}:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch extended patch information',
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

        // Get project details to determine path
        const projectPath = path.join('/external/host', projectId);

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

        // Get project details to determine path
        const projectPath = path.join('/external/host', projectId);

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

            // Get project details to determine path
            const projectPath = path.join('/external/host', projectId);

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

        const projectPath = path.join('/external/host', projectId);

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

// Get file content from project directory
router.get('/:id/file-content', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { filePath } = req.query;

    if (!filePath || typeof filePath !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'File path is required',
        });
    }

    const client = await getDB();
    try {
        // Get patch details to find project ID
        const patchResult = await client.query(
            'SELECT project_id FROM patches WHERE id = $1',
            [id]
        );

        if (patchResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Patch not found',
            });
        }

        const patch = patchResult.rows[0];
        const projectPath = path.join('/external/host', patch.project_id);
        const fullFilePath = path.join(projectPath, filePath);

        // Security check: ensure the file path doesn't escape the project directory
        const resolvedPath = path.resolve(fullFilePath);
        const resolvedProjectPath = path.resolve(projectPath);

        if (!resolvedPath.startsWith(resolvedProjectPath)) {
            return res.status(403).json({
                success: false,
                error: 'Access denied: Invalid file path',
            });
        }

        // Read file content
        const fs = await import('fs/promises');

        try {
            const content = await fs.readFile(resolvedPath, 'utf-8');
            res.json({
                success: true,
                data: {
                    filePath,
                    content,
                },
            });
        } catch (fileError: any) {
            if (fileError.code === 'ENOENT') {
                return res.status(404).json({
                    success: false,
                    error: 'File not found',
                });
            }
            throw fileError;
        }
    } catch (error) {
        console.error(`Error fetching file content for patch ${id}:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch file content',
        });
    } finally {
        client.release();
    }
});

export default router;
