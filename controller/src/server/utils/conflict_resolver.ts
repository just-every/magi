/**
 * Conflict Resolution Module
 *
 * Provides intelligent suggestions for resolving patch conflicts
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getDB } from './db.js';
import { getDefaultBranch } from './git_utils.js';

export interface ConflictResolution {
    strategy: 'rebase' | 'merge' | 'regenerate' | 'manual';
    description: string;
    steps: string[];
    commands?: string[];
    confidence: 'high' | 'medium' | 'low';
}

/**
 * Analyze a patch and suggest conflict resolution strategies
 */
export async function suggestConflictResolution(
    patchId: number,
    projectPath: string,
    conflictFiles: string[]
): Promise<ConflictResolution[]> {
    const client = await getDB();
    const suggestions: ConflictResolution[] = [];

    try {
        // Get patch details
        const patchResult = await client.query(
            'SELECT * FROM patches WHERE id = $1',
            [patchId]
        );

        if (patchResult.rows.length === 0) {
            throw new Error('Patch not found');
        }

        const patch = patchResult.rows[0];
        const patchAge = Date.now() - new Date(patch.created_at).getTime();
        const ageInHours = patchAge / (1000 * 60 * 60);

        // Strategy 1: Rebase if patch is recent
        if (ageInHours < 24) {
            suggestions.push({
                strategy: 'rebase',
                description: 'Rebase the patch on the latest changes',
                steps: [
                    'Create a new branch from the patch',
                    'Pull latest changes from the default branch',
                    'Rebase the patch branch onto the default branch',
                    'Resolve conflicts during rebase',
                    'Create a new patch from the rebased changes',
                ],
                commands: [
                    `git checkout -b patch-${patchId}-rebase`,
                    `git apply --3way /tmp/patch-${patchId}.patch`,
                    `git rebase origin/${getDefaultBranch(projectPath)}`,
                    '# Resolve conflicts manually',
                    'git add .',
                    'git rebase --continue',
                    'git diff origin/main > new-patch.patch',
                ],
                confidence: ageInHours < 6 ? 'high' : 'medium',
            });
        }

        // Strategy 2: Regenerate if patch is old
        if (ageInHours > 24) {
            suggestions.push({
                strategy: 'regenerate',
                description: 'Regenerate the patch with latest codebase',
                steps: [
                    'Pull latest changes',
                    'Re-run the agent task that created this patch',
                    'The agent will generate a new patch based on current code',
                ],
                confidence: 'high',
            });
        }

        // Strategy 3: Three-way merge
        suggestions.push({
            strategy: 'merge',
            description: 'Use three-way merge to combine changes',
            steps: [
                'Create a temporary branch',
                'Apply patch with 3-way merge',
                'Git will create conflict markers',
                'Manually resolve conflicts',
                'Commit the resolved changes',
            ],
            commands: [
                `git checkout -b patch-${patchId}-merge`,
                `git apply --3way /tmp/patch-${patchId}.patch`,
                '# Resolve conflicts in conflicted files',
                'git add .',
                `git commit -m "Applied patch #${patchId} with conflict resolution"`,
            ],
            confidence: 'medium',
        });

        // Strategy 4: Manual resolution (always available)
        suggestions.push({
            strategy: 'manual',
            description: 'Manually apply changes from the patch',
            steps: [
                'Review the patch content',
                'Manually apply the changes to conflicted files',
                'This gives you full control over the merge',
                'Best for complex conflicts or when other strategies fail',
            ],
            confidence: 'low',
        });

        // Sort by confidence
        suggestions.sort((a, b) => {
            const confidenceOrder = { high: 3, medium: 2, low: 1 };
            return (
                confidenceOrder[b.confidence] - confidenceOrder[a.confidence]
            );
        });

        return suggestions;
    } catch (error) {
        console.error('Error suggesting conflict resolution:', error);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Create a conflict resolution task for an agent
 */
export async function createConflictResolutionTask(
    patchId: number,
    projectId: string,
    conflictFiles: string[],
    suggestion: ConflictResolution
): Promise<string> {
    const client = await getDB();

    try {
        // Get patch details
        const patchResult = await client.query(
            'SELECT * FROM patches WHERE id = $1',
            [patchId]
        );

        if (patchResult.rows.length === 0) {
            throw new Error('Patch not found');
        }

        const patch = patchResult.rows[0];

        // Create a detailed task description for the agent
        let taskDescription = `
Resolve conflicts for patch #${patchId} in project ${projectId}.

Original task: ${patch.commit_message}

The patch has conflicts in the following files:
${conflictFiles.map(f => `- ${f}`).join('\n')}

Recommended resolution strategy: ${suggestion.description}

Steps to resolve:
${suggestion.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}
`;

        if (suggestion.commands) {
            taskDescription += `\n\nSuggested commands:\n\`\`\`bash\n${suggestion.commands.join('\n')}\n\`\`\``;
        }

        taskDescription += `
        
Please resolve the conflicts and create a new patch that can be applied cleanly.
Make sure to preserve the original intent of the changes while adapting to the current codebase.
`;

        return taskDescription;
    } catch (error) {
        console.error('Error creating conflict resolution task:', error);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Attempt automatic conflict resolution for simple cases
 */
export async function attemptAutoResolve(
    patchId: number,
    projectPath: string
): Promise<{ success: boolean; newPatchId?: number; error?: string }> {
    const tmpBranch = `auto-resolve-${patchId}-${Date.now()}`;
    const client = await getDB();

    try {
        // Get patch content
        const patchResult = await client.query(
            'SELECT * FROM patches WHERE id = $1',
            [patchId]
        );

        if (patchResult.rows.length === 0) {
            return { success: false, error: 'Patch not found' };
        }

        const patch = patchResult.rows[0];
        const defaultBranch = getDefaultBranch(projectPath);

        // Save current branch
        const currentBranch = execSync(
            `git -C "${projectPath}" rev-parse --abbrev-ref HEAD`,
            { encoding: 'utf8' }
        ).trim();

        try {
            // Create temporary branch
            execSync(
                `git -C "${projectPath}" checkout -b ${tmpBranch} origin/${defaultBranch}`,
                { stdio: 'pipe' }
            );

            // Write patch to temp file
            const tmpFile = path.join('/tmp', `patch-${patchId}-auto.patch`);
            fs.writeFileSync(tmpFile, patch.patch_content);

            // Try to apply with 3-way merge
            execSync(`git -C "${projectPath}" apply --3way "${tmpFile}"`, {
                stdio: 'pipe',
            });

            // Check if there are conflicts
            const status = execSync(
                `git -C "${projectPath}" status --porcelain`,
                { encoding: 'utf8' }
            );

            const hasConflicts = status.includes('UU ');

            if (!hasConflicts) {
                // No conflicts after 3-way merge, create new patch
                const newPatch = execSync(
                    `git -C "${projectPath}" diff origin/${defaultBranch}`,
                    { encoding: 'utf8' }
                );

                // Save new patch to database
                const newPatchResult = await client.query(
                    `INSERT INTO patches (
                        process_id, project_id, branch_name, 
                        commit_message, patch_content, metrics, status
                    ) VALUES ($1, $2, $3, $4, $5, $6, 'pending') 
                    RETURNING id`,
                    [
                        patch.process_id,
                        patch.project_id,
                        patch.branch_name,
                        patch.commit_message + ' (auto-resolved)',
                        newPatch,
                        patch.metrics,
                    ]
                );

                // Mark original patch as superseded
                await client.query(
                    "UPDATE patches SET status = 'superseded' WHERE id = $1",
                    [patchId]
                );

                // Clean up
                fs.unlinkSync(tmpFile);
                execSync(`git -C "${projectPath}" checkout ${currentBranch}`, {
                    stdio: 'pipe',
                });
                execSync(`git -C "${projectPath}" branch -D ${tmpBranch}`, {
                    stdio: 'pipe',
                });

                return {
                    success: true,
                    newPatchId: newPatchResult.rows[0].id,
                };
            } else {
                // Has conflicts, cannot auto-resolve
                fs.unlinkSync(tmpFile);
                return {
                    success: false,
                    error: 'Conflicts require manual resolution',
                };
            }
        } catch (error) {
            // Clean up on error
            try {
                execSync(`git -C "${projectPath}" checkout ${currentBranch}`, {
                    stdio: 'pipe',
                });
                execSync(`git -C "${projectPath}" branch -D ${tmpBranch}`, {
                    stdio: 'pipe',
                });
            } catch (cleanupError) {
                console.error('Error during cleanup:', cleanupError);
            }

            throw error;
        }
    } catch (error) {
        console.error('Error in auto-resolve:', error);
        return {
            success: false,
            error: error.message || 'Auto-resolution failed',
        };
    } finally {
        client.release();
    }
}
