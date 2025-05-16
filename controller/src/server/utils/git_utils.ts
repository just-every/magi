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
    // 1. Ask git for the symbolic ref of origin/HEAD
    try {
        const ref = execSync(
            'git symbolic-ref --quiet refs/remotes/origin/HEAD',
            { cwd: repoPath, encoding: 'utf8' }
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
        });
        return 'main';
    } catch {
        /* fall through to next fallback */
    }

    // 3. Default to master as last resort
    return 'master';
}
