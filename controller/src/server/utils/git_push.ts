/**
 * Git Push Utility (policy + risk aware)
 *
 * Pushes container‑generated branches to the host repository and decides
 * whether to auto‑merge based on:
 *   • AUTO_MERGE_MAGI_PROJECTS  (for generated projects)
 *   • AUTO_MERGE_EXISTING_PROJECTS (for external repos)
 *
 * Policies: none | low_risk | moderate_risk | all
 */

import { execSync, ExecSyncOptions } from 'child_process';
import fs from 'fs';
import path from 'path';
import { MergePolicy } from '../../types/index';
import { computeMetrics } from './../managers/commit_metrics';
import { getProject } from './db_utils';
import { PREventsManager } from '../managers/pr_events_manager';
import { getDefaultBranch } from './git_utils';
import { recordFailure, classifyRisk, decideMergeAction } from './git_push_helpers';
import { recordMerge } from './pr_event_utils';

interface GitCmdOpts extends ExecSyncOptions {
    quiet?: boolean;
}

function runGit(projectPath: string, cmd: string, opts: GitCmdOpts = {}): void {
    const { quiet, ...execOpts } = opts;
    execSync(`git -C "${projectPath}" ${cmd}`, {
        stdio: quiet ? 'pipe' : 'inherit',
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        ...execOpts,
    });
}

function dirExists(p: string): boolean {
    try {
        return fs.statSync(p).isDirectory();
    } catch {
        return false;
    }
}

/* -------------------------------------------------------------------------- */
/* Env helpers                                                                */
/* -------------------------------------------------------------------------- */

function envFloat(key: string, dflt: number) {
    const v = parseFloat(process.env[key] ?? '');
    return Number.isFinite(v) ? v : dflt;
}

/* -------------------------------------------------------------------------- */
/* Risk‑band checks                                                           */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Core git atomics                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Safely stashes any changes in the working directory
 * @param projectPath Path to the git repository
 * @returns True if changes were stashed, false if working directory was clean
 */
function stashSave(projectPath: string): boolean {
    try {
        // Check if there are any changes to stash
        const status = execSync(`git -C "${projectPath}" status --porcelain`, {
            encoding: 'utf8',
        }).trim();

        if (!status) {
            // Working directory is clean, nothing to stash
            return false;
        }

        // Stash changes including untracked files
        console.log('[git-push] stashing local changes before merge');
        runGit(
            projectPath,
            'stash push -u -m "Temporary stash before merge operation"'
        );
        return true;
    } catch (e) {
        console.warn('[git-push] failed to stash changes:', e);
        return false;
    }
}

/**
 * Restores previously stashed changes
 * @param projectPath Path to the git repository
 * @param hadStash Whether there were actually changes that were stashed
 */
function stashPop(projectPath: string, hadStash: boolean): void {
    if (!hadStash) {
        return; // Nothing was stashed, so nothing to restore
    }

    try {
        console.log('[git-push] restoring stashed changes');
        runGit(projectPath, 'stash pop');
    } catch (e) {
        console.warn(
            '[git-push] failed to restore stashed changes - they remain in the stash:',
            e
        );
    }
}

function checkoutBranch(projectPath: string, branch: string): void {
    console.log(`[git-push] checkout/create ${branch}`);
    runGit(projectPath, `checkout -B ${branch}`);
}

function fetchOrigin(projectPath: string): void {
    console.log('[git-push] fetch origin');
    runGit(projectPath, 'fetch origin');
}

function rebaseOntoDefault(projectPath: string): void {
    const defaultBranch = getDefaultBranch(projectPath);
    console.log(`[git-push] rebase onto ${defaultBranch}`);
    try {
        runGit(projectPath, `pull --rebase origin ${defaultBranch}`);
    } catch (err) {
        console.warn('[git-push] rebase failed — aborting:', err);
        try {
            runGit(projectPath, 'rebase --abort', { quiet: true });
        } catch (e) {
            console.debug('[git-push] failed to abort rebase:', e);
        }
    }
}

function pushBranch(projectPath: string, branch: string): void {
    console.log(`[git-push] push ${branch}`);
    try {
        runGit(projectPath, `push -u origin ${branch}`);
    } catch (e) {
        if (/rejected/.test(String(e))) {
            console.log(
                '[git-push] remote branch exists – retrying with --force-with-lease'
            );
            runGit(projectPath, `push -u --force-with-lease origin ${branch}`);
        } else {
            throw e;
        }
    }
}

function mergeIntoDefault(
    projectPath: string,
    branch: string,
    msg: string
): boolean {
    const defaultBranch = getDefaultBranch(projectPath);
    console.log(`[git-push] merge into ${defaultBranch}`);
    try {
        // Switch to default branch
        runGit(projectPath, `checkout ${defaultBranch}`);

        // Pull latest changes from origin
        runGit(projectPath, `pull origin ${defaultBranch}`);

        // Merge the feature branch with no-ff to maintain history
        runGit(
            projectPath,
            `merge --no-ff ${branch} -m "Merge ${branch}: ${msg}"`
        );

        // Push the merge commit to origin
        console.log(`[git-push] push ${defaultBranch}`);
        runGit(projectPath, `push origin ${defaultBranch}`);

        // Return to the feature branch
        runGit(projectPath, `checkout ${branch}`);

        return true;
    } catch (err) {
        console.error('[git-push] merge failed:', err);
        try {
            runGit(projectPath, 'merge --abort', { quiet: true });
        } catch (e) {
            console.debug('[git-push] failed to abort merge:', e);
        }
        try {
            runGit(projectPath, `checkout ${branch}`, { quiet: true });
        } catch (e) {
            console.debug('[git-push] failed to switch back to branch:', e);
        }
        return false;
    }
}

/* -------------------------------------------------------------------------- */
/* Public entry                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Push a branch & auto‑merge if the chosen policy + metrics allow.
 *
 * @param processId   MAGI process id
 * @param projectId   repo/project id
 * @param branchName  branch to push
 * @param commitMsg   message used when merging
 */
/**
 * Retry merging a previously failed pull request
 *
 * @param projectPath Path to the git repository
 * @param branchName Branch to merge
 * @param commitMsg Commit message to use for the merge
 * @returns True if merge successful, false otherwise
 */
export async function retryMerge(
    projectPath: string,
    branchName: string,
    commitMsg: string
): Promise<boolean> {
    try {
        console.log(`[git-push] Retrying merge of ${branchName}`);

        // First fetch any new changes
        fetchOrigin(projectPath);

        // Make sure we're on the branch to be merged
        try {
            checkoutBranch(projectPath, branchName);
        } catch (err) {
            console.error(
                `[git-push] Failed to checkout branch ${branchName}:`,
                err
            );
            return false;
        }

        // Safely stash any local changes before merge
        const hadStash = stashSave(projectPath);

        // Attempt the merge
        const mergeSucceeded = mergeIntoDefault(
            projectPath,
            branchName,
            commitMsg
        );

        // Restore stashed changes regardless of merge result
        stashPop(projectPath, hadStash);

        if (!mergeSucceeded) {
            console.error('[git-push] Manual merge attempt failed');
        }

        return mergeSucceeded;
    } catch (err) {
        console.error('[git-push] Unexpected error during merge retry:', err);
        return false;
    }
}

/**
 * Push a branch & auto‑merge if the chosen policy + metrics allow.
 *
 * @param processId   MAGI process id
 * @param projectId   repo/project id
 * @param branchName  branch to push
 * @param commitMsg   message used when merging
 * @param prEventsManager Optional PR events manager to use for recording and notifications
 */
export async function pushBranchAndOpenPR(
    processId: string,
    projectId: string,
    branchName: string,
    commitMsg: string,
    prEventsManager?: PREventsManager
): Promise<boolean> {
    const projectPath = path.join(
        '/magi_output',
        processId,
        'projects',
        projectId
    );
    if (!dirExists(projectPath)) {
        console.warn(`[git-push] project path missing: ${projectPath}`);
        return false;
    }

    const markerPath = path.join(projectPath, '.magi_pushed');
    if (fs.existsSync(markerPath)) {
        console.log('[git-push] branch already pushed (marker exists)');
        return false;
    }

    const project = await getProject(projectId);
    if (!project) {
        throw new Error(`Project ${projectId} not found in database`);
    }

    let metrics;
    const policy: MergePolicy = ((project.is_generated
        ? process.env.AUTO_MERGE_MAGI_PROJECTS
        : process.env.AUTO_MERGE_EXISTING_PROJECTS) ?? 'none') as MergePolicy;

    try {
        checkoutBranch(projectPath, branchName);
        fetchOrigin(projectPath);

        try {
            rebaseOntoDefault(projectPath);
        } catch (err) {
            // Record rebase failure
            await recordFailure(prEventsManager, {
                processId,
                projectId,
                branchName,
                commitMsg,
                errorMessage: `Rebase failed: ${err}`,
            });
            throw err; // Re-throw to exit the function
        }

        // Calculate metrics after rebase to get accurate picture of what will be pushed
        try {
            metrics = computeMetrics(projectPath);
        } catch (err) {
            console.warn('[git-push] failed to compute metrics:', err);
            // Continue without metrics - not a fatal error
            metrics = null;
        }

        // Calculate risk band from metrics and determine merge action
        const lowMax = envFloat('LOW_RISK_MAX', 0.25);
        const modMax = envFloat('MOD_RISK_MAX', 0.55);

        // Use helper to classify risk score into band
        const band = classifyRisk(metrics?.score ?? null, lowMax, modMax);

        if (metrics) {
            console.log(
                `[git-push] riskScore=${metrics.score.toFixed(3)} band=${band}`
            );
        }

        // Use helper to decide merge action based on policy and risk band
        const action = decideMergeAction(policy, band);

        console.log(
            `[git-push] process=${processId} project=${projectId} policy=${policy} action=${action}`
        );

        try {
            pushBranch(projectPath, branchName);
        } catch (err) {
            // Record push failure
            await recordFailure(prEventsManager, {
                processId,
                projectId,
                branchName,
                commitMsg,
                metrics,
                errorMessage: `Push failed: ${err}`,
            });
            throw err; // Re-throw to exit the function
        }

        // Use atomic file write to prevent race conditions
        try {
            fs.writeFileSync(markerPath, new Date().toISOString(), {
                flag: 'wx',
            });
        } catch (err) {
            if (err.code === 'EEXIST') {
                console.warn(
                    '[git-push] marker already present, possible concurrent update'
                );
            } else {
                throw err;
            }
        }

        if (action === 'merge') {
            // Safely stash any local changes before merge
            const hadStash = stashSave(projectPath);

            // Attempt the merge
            const mergeSucceeded = mergeIntoDefault(
                projectPath,
                branchName,
                commitMsg
            );

            // Restore stashed changes regardless of merge result
            stashPop(projectPath, hadStash);

            if (!mergeSucceeded) {
                console.error(
                    '[git-push] Auto-merge failed, PR created but not merged'
                );

                // Record merge failure for manual resolution
                await recordFailure(prEventsManager, {
                    processId,
                    projectId,
                    branchName,
                    commitMsg,
                    metrics,
                    errorMessage:
                        'Auto-merge failed, manual intervention required',
                });
            } else {
                // Record successful merge in the database
                try {
                    const mergeCommitSha = execSync(`git -C "${projectPath}" rev-parse HEAD`, {
                        encoding: 'utf8',
                    }).trim();

                    console.log(`[git-push] Successful merge with commit ${mergeCommitSha}`);

                    // Record merge event
                    await recordMerge({
                        processId,
                        projectId,
                        branchName,
                        commitMsg,
                        metrics,
                        mergeCommitSha,
                    });
                } catch (logErr) {
                    console.warn('[git-push] Failed to record merge event:', logErr);
                    // Don't throw here - we still want to return success even if logging fails
                }
            }
            return mergeSucceeded;
        } else {
            return true;
        }
    } catch (err) {
        console.error('[git-push] unexpected git error:', err);

        // Only record if not already recorded by a more specific handler
        if (
            err.message &&
            !err.message.includes('Rebase failed') &&
            !err.message.includes('Push failed')
        ) {
            await recordFailure(prEventsManager, {
                processId,
                projectId,
                branchName,
                commitMsg,
                metrics,
                errorMessage: `Git operation failed: ${err}`,
            });
        }

        return false;
    }
}
