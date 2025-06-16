/**
 * Git utility functions
 */
import { execSync } from 'child_process';

/**
 * Determines the default branch for a repository by checking:
 * 1. The symbolic reference of origin/HEAD
 * 2. If main branch exists
 * 3. Falling back to master if nothing else works
 *
 * @param repoPath Path to the repository
 * @returns The name of the default branch (e.g., 'main', 'master', 'develop')
 */
export function getDefaultBranch(repoPath: string): string {
    // Check if repository has any commits first
    try {
        const hasCommits = execSync('git rev-list --count HEAD', {
            cwd: repoPath,
            encoding: 'utf8',
            stdio: 'pipe',
        }).trim();

        if (parseInt(hasCommits) === 0) {
            // Empty repository - return configured default
            try {
                const defaultBranch = execSync(
                    'git config init.defaultBranch',
                    {
                        cwd: repoPath,
                        encoding: 'utf8',
                        stdio: 'pipe',
                    }
                ).trim();
                return defaultBranch || 'main';
            } catch {
                return 'main'; // Default for new repos
            }
        }
    } catch {
        // Repository might be empty or uninitialized
    }

    // Get current branch if we're on one
    try {
        const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
            cwd: repoPath,
            encoding: 'utf8',
            stdio: 'pipe',
        }).trim();

        if (currentBranch && currentBranch !== 'HEAD') {
            return currentBranch;
        }
    } catch {
        /* fall through to other methods */
    }

    // 1. Ask git for the symbolic ref of origin/HEAD
    try {
        const ref = execSync(
            'git symbolic-ref --quiet refs/remotes/origin/HEAD',
            { cwd: repoPath, encoding: 'utf8', stdio: 'pipe' }
        ).trim(); // → refs/remotes/origin/main
        const m = ref.match(/refs\/remotes\/origin\/(.+)$/);
        if (m) return m[1];
    } catch {
        /* fall through to fallbacks */
    }

    // 2. Fallbacks: check if main exists
    try {
        execSync('git show-ref --verify --quiet refs/heads/main', {
            cwd: repoPath,
            stdio: 'pipe',
        });
        return 'main';
    } catch {
        /* fall through to next fallback */
    }

    // 3. Check if master exists
    try {
        execSync('git show-ref --verify --quiet refs/heads/master', {
            cwd: repoPath,
            stdio: 'pipe',
        });
        return 'master';
    } catch {
        /* fall through to final default */
    }

    // 4. Default to main for new repos
    return 'main';
}
