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
import lockfile from 'proper-lockfile';
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
/* Locking mechanism to prevent concurrent operations on same branch          */
/* -------------------------------------------------------------------------- */

/**
 * Execute a task with exclusive lock on a project branch using filesystem locking
 * Works across processes and containers that share the magi_output volume
 * @param projectId Project identifier
 * @param branch Branch name
 * @param task Function to execute while holding the lock
 * @returns Result of the task
 */
/**
 * Ensure locks directory exists with proper permissions for all containers
 * @param projectId Project identifier
 * @returns Path to the locks directory
 */
function ensureLocksDir(projectId: string): string {
    // Create parent locks directory if it doesn't exist
    const parentLocksDir = path.join('/magi_output', 'locks');

    if (!fs.existsSync(parentLocksDir)) {
        fs.mkdirSync(parentLocksDir, { recursive: true });

        try {
            // Set sticky bit + rwxrwxrwx permissions so all containers can create locks
            fs.chmodSync(parentLocksDir, 0o1777);
            console.log(`[git-push] Set shared permissions on locks directory: ${parentLocksDir}`);
        } catch (err) {
            // Non-fatal - containers with same UID will still work
            console.warn(`[git-push] Failed to set permissions on locks directory: ${err}`);
        }
    }

    // Create project-specific locks directory
    const locksDir = path.join(parentLocksDir, projectId);
    fs.mkdirSync(locksDir, { recursive: true });

    return locksDir;
}

/**
 * Execute a task with exclusive lock on a project branch using filesystem locking
 * Works across processes and containers that share the magi_output volume
 * @param projectId Project identifier
 * @param branch Branch name
 * @param task Function to execute while holding the lock
 * @param isLongRunning Whether this is expected to be a long-running operation
 * @returns Result of the task
 */
async function withBranchLock<T>(
    projectId: string,
    branch: string,
    task: () => Promise<T>,
    isLongRunning: boolean = false
): Promise<T> {
    // Ensure the locks directory exists with proper permissions
    const locksDir = ensureLocksDir(projectId);

    // Create a lockfile path that's safe for filesystem
    const lockPath = path.join(locksDir, `${branch.replace(/[^a-zA-Z0-9-_]/g, '_')}.lock`);

    console.log(`[git-push] Acquiring filesystem lock at ${lockPath}`);

    // Use longer stale timeout for operations expected to take time (like merges)
    // This reduces the chance of orphaned locks causing problems
    const staleTimeout = isLongRunning ? 300000 : 60000; // 5 minutes or 1 minute

    let release: () => Promise<void>;
    try {
        // Acquire the lock - this will wait if another process holds it
        release = await lockfile.lock(lockPath, {
            retries: 120,         // Try for up to 2 minutes
            retryWait: 1000,      // Wait 1 second between retries
            stale: staleTimeout,  // Consider lock stale after timeout
            realpath: false       // Don't follow symlinks
        });

        console.log(`[git-push] Lock acquired for ${projectId}:${branch}`);

        // Execute the task while holding the lock
        return await task();
    } finally {
        // Release the lock when done
        if (release) {
            try {
                await release();
                console.log(`[git-push] Lock released for ${projectId}:${branch}`);
            } catch (err) {
                console.warn(`[git-push] Failed to release lock: ${err}`);
            }
        }
    }
}

/* -------------------------------------------------------------------------- */
/* Helper functions                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Checks if a merge is in progress in the given repository
 * @param repo Path to the git repository
 * @returns Boolean indicating if a merge is in progress
 */
function mergeInProgress(repo: string): boolean {
    return fs.existsSync(path.join(repo, '.git', 'MERGE_HEAD'));
}

/**
 * Checks if a rebase is in progress in the given repository
 * @param repo Path to the git repository
 * @returns Boolean indicating if a rebase is in progress
 */
function rebaseInProgress(repo: string): boolean {
    return fs.existsSync(path.join(repo, '.git', 'rebase-merge')) ||
           fs.existsSync(path.join(repo, '.git', 'rebase-apply'));
}

/**
 * Gets the host repository path deterministically from the project path
 * @param projectPath Path to the git working copy
 * @returns Host repository path
 */
function hostRepoPath(projectPath: string): string {
    // Extract the project ID from the path (last directory component)
    const projectId = path.basename(projectPath);
    return path.join('/external/host', projectId);
}

/**
 * Safely fast-forwards the host repository to match the mirror
 * Protects against:
 * 1. Uncommitted local changes
 * 2. Divergent commits that would be lost
 *
 * @param hostPath Path to the host repository
 * @param mirrorPath Path to the mirror repository
 * @param branch Branch to fetch
 */
function safeFastForward(hostPath: string, mirrorPath: string, branch: string): void {
    console.log(`[git-push] Safely fast-forwarding host repo at ${hostPath}`);

    // Step 1: Fetch the branch from the mirror
    try {
        runGit(hostPath, `fetch '${mirrorPath}' ${branch}`);
        console.log(`[git-push] Fetched ${branch} from mirror`);
    } catch (err) {
        console.error(`[git-push] Failed to fetch from mirror: ${err}`);
        throw err;
    }

    // Step 2: Check if there are uncommitted changes
    try {
        const dirtyCheck = execSync(`git -C "${hostPath}" status --porcelain`, {
            encoding: 'utf8',
        }).trim();

        if (dirtyCheck) {
            console.warn('[git-push] Host repository has uncommitted changes, skipping fast-forward');
            console.warn('[git-push] Creating branch magi-incoming instead');
            const timestamp = Date.now();
            runGit(hostPath, `branch magi-incoming-${timestamp} FETCH_HEAD`);
            console.log(`[git-push] Created branch magi-incoming-${timestamp} pointing to FETCH_HEAD`);
            return;
        }
    } catch (err) {
        console.error(`[git-push] Failed to check work-tree status: ${err}`);
        throw err;
    }

    // Step 3: Check if fast-forward is possible (HEAD is ancestor of FETCH_HEAD)
    try {
        runGit(hostPath, 'merge-base --is-ancestor HEAD FETCH_HEAD', { quiet: true });

        // Fast-forward is possible, do it
        runGit(hostPath, 'reset --hard FETCH_HEAD');
        console.log('[git-push] Successfully fast-forwarded host work-tree');
    } catch (err) {
        // Not an ancestor - local and remote have diverged
        console.warn('[git-push] Local and MAGI commits have diverged, cannot fast-forward');
        console.warn('[git-push] Creating branch magi-incoming instead');
        const timestamp = Date.now();
        runGit(hostPath, `branch magi-incoming-${timestamp} FETCH_HEAD`);
        console.log(`[git-push] Created branch magi-incoming-${timestamp} pointing to FETCH_HEAD`);
    }
}

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
        if (rebaseInProgress(projectPath)) {
            try {
                runGit(projectPath, 'rebase --abort', { quiet: true });
            } catch (e) {
                console.debug('[git-push] failed to abort rebase:', e);
            }
        } else {
            console.debug('[git-push] no rebase in progress to abort');
        }
    }
}

/**
 * Get the mirror path corresponding to a working copy path
 * @param projectPath Path to the working copy
 * @returns Path to the mirror repository
 */
function getMirrorPath(projectPath: string): string {
    try {
        // Project path format: /magi_output/<processId>/projects/<projectId>
        const pathParts = projectPath.split('/');
        const projectsIndex = pathParts.indexOf('projects');

        if (projectsIndex === -1 || projectsIndex === pathParts.length - 1) {
            throw new Error(`Invalid project path format: ${projectPath}`);
        }

        const processId = pathParts[projectsIndex - 1];
        const projectId = pathParts[projectsIndex + 1];

        // Mirror path format: /magi_output/<processId>/projects/<projectId>.mirror.git
        return path.join('/magi_output', processId, 'projects', `${projectId}.mirror.git`);
    } catch (error) {
        // Fallback: assume the mirror is alongside the working copy with a .mirror.git suffix
        console.warn(`[git-push] Failed to parse project path (${error}), using fallback mirror path calculation`);
        const projectDir = path.dirname(projectPath);
        const projectName = path.basename(projectPath);
        return path.join(projectDir, `${projectName}.mirror.git`);
    }
}

function pushBranch(projectPath: string, branch: string, hostPath?: string): void {
    console.log(`[git-push] push ${branch}`);
    try {
        runGit(projectPath, `push -u origin ${branch}`);

        // Forward update to host repo by fetch + safe fast-forward
        if (hostPath) {
            // Get the mirror path for fetch operation
            const mirrorPath = getMirrorPath(projectPath);

            // Use safe fast-forward that protects local changes
            safeFastForward(hostPath, mirrorPath, branch);
        }
    } catch (e) {
        if (/rejected/.test(String(e))) {
            console.log(
                '[git-push] remote branch exists – retrying with --force-with-lease'
            );
            runGit(projectPath, `push -u --force-with-lease origin ${branch}`);

            // Try to update host repo after force push
            if (hostPath) {
                try {
                    // Get the mirror path for fetch operation
                    const mirrorPath = getMirrorPath(projectPath);

                    console.log('[git-push] Safe fast-forward host work-tree after force push');

                    // Use safe fast-forward that protects local changes
                    safeFastForward(hostPath, mirrorPath, branch);
                } catch (hostErr) {
                    console.error('[git-push] failed to update host repo:', hostErr);
                    // Continue without throwing as the primary push succeeded
                }
            }
        } else {
            throw e;
        }
    }
}

function mergeIntoDefault(
    projectPath: string,
    branch: string,
    msg: string,
    hostPath?: string
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

        if (hostPath) {
            const mirrorPath = getMirrorPath(projectPath);
            safeFastForward(hostPath, mirrorPath, defaultBranch);
        }

        // Return to the feature branch
        runGit(projectPath, `checkout ${branch}`);

        return true;
    } catch (err) {
        console.error('[git-push] merge failed:', err);
        if (mergeInProgress(projectPath)) {
            try {
                runGit(projectPath, 'merge --abort', { quiet: true });
            } catch (e) {
                console.debug('[git-push] failed to abort merge:', e);
            }
        } else {
            console.debug('[git-push] no merge in progress to abort');
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

        // Get the default branch to use for locking
        const defaultBranch = getDefaultBranch(projectPath);
        const projectId = path.basename(projectPath); // Extract project ID from path

        // Get the host repo path for fast-forwarding
        const hostPath = hostRepoPath(projectPath);

        // Execute merge with a lock on the default branch to prevent concurrent merges
        console.log(`[git-push] Acquiring lock on ${projectId}:${defaultBranch} before merge retry operation`);
        return await withBranchLock(projectId, defaultBranch, async () => {
            // Safely stash any local changes before merge
            const hadStash = stashSave(projectPath);

            try {
                // Attempt the merge
                const mergeSucceeded = mergeIntoDefault(
                    projectPath,
                    branchName,
                    commitMsg,
                    hostPath
                );

                // Push changes to branch after merge attempt
                if (mergeSucceeded) {
                    // Push changes to branch & sync with host
                    pushBranch(projectPath, branchName, hostPath);
                } else {
                    console.error('[git-push] Manual merge attempt failed');
                }

                return mergeSucceeded;
            } finally {
                // Restore stashed changes regardless of merge result
                stashPop(projectPath, hadStash);
            }
        });
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
            // Get the host repo path for fast-forwarding
            const hostPath = hostRepoPath(projectPath);

            // Acquire lock on branch to prevent concurrent force-push operations to the same branch
            await withBranchLock(projectId, branchName, async () => {
                pushBranch(projectPath, branchName, hostPath);
                return true;
            });
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
            // Get the default branch to use for locking
            const defaultBranch = getDefaultBranch(projectPath);
            console.log(`[git-push] Acquiring lock on ${projectId}:${defaultBranch} before merge operation`);

            // Execute merge with a lock on the default branch to prevent concurrent merges
            return await withBranchLock(projectId, defaultBranch, async () => {
                // Safely stash any local changes before merge
                const hadStash = stashSave(projectPath);

                try {
                    // Attempt the merge
                    const mergeSucceeded = mergeIntoDefault(
                        projectPath,
                        branchName,
                        commitMsg,
                        hostPath
                    );

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
                } finally {
                    // Restore stashed changes regardless of merge result
                    stashPop(projectPath, hadStash);
                }
            });
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
