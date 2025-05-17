/**
 * MAGI CommitPlanner
 *
 * Delegates commit planning and execution to a CodeAgent,
 * which analyzes, stages, and commits meaningful changes.
 */

import { execSync } from 'child_process';
import { sendStreamEvent } from './communication.js';
import { quick_llm_call } from './llm_call_utils.js';
import { get_output_dir } from './file_utils.js';
import type { Agent } from './agent.js';

/**
 * Plan and execute a Git commit for meaningful project changes
 *
 * Uses a CodeAgent to handle all git operations including analysis,
 * branch switching, staging, and committing
 *
 * @param projectId - The ID of the project
 * @returns Promise that resolves when the operation is complete
 */
export async function planAndCommitChanges(
    agent: Agent,
    projectId: string
): Promise<void> {
    const processId = process.env.PROCESS_ID;
    const projectPath = get_output_dir(`projects/${projectId}`);

    try {
        console.log(`[commit-planner] Analyzing changes in ${projectId}...`);

        // Ensure we're on the correct branch before proceeding
        const targetBranch = `magi/${processId}`;
        try {
            // Get current branch name
            const currentBranch = execSync(
                `git -C "${projectPath}" rev-parse --abbrev-ref HEAD`,
                { encoding: 'utf8' }
            ).trim();

            // Switch to target branch if not already on it
            if (currentBranch !== targetBranch) {
                console.log(
                    `[commit-planner] Switching to branch ${targetBranch}`
                );
                execSync(
                    `git -C "${projectPath}" checkout -B ${targetBranch}`,
                    { stdio: 'inherit' }
                );
            }
        } catch (e) {
            console.log(`[commit-planner] Creating new branch ${targetBranch}`);
            execSync(`git -C "${projectPath}" checkout -B ${targetBranch}`, {
                stdio: 'inherit',
            });
        }

        // Check if any files have changed
        const statusOutput = execSync(
            `git -C "${projectPath}" status --porcelain`
        ).toString();
        if (!statusOutput.trim()) {
            console.log(`[commit-planner] No changes detected in ${projectId}`);
            return;
        }

        // Capture current HEAD to detect if a commit happened
        let oldHead = '';
        try {
            oldHead = execSync(`git -C "${projectPath}" rev-parse HEAD`, {
                encoding: 'utf8',
            }).trim();
        } catch (e) {
            // Repository may exist but have no commits yet, which is fine - oldHead stays empty
        }

        console.log(
            `[commit-planner] Delegating git commit for ${projectId} to CodeAgent...`
        );

        // Call CodeAgent to handle all git operations
        await quick_llm_call(
            `Please execute the commit (if needed) in the ${projectPath} repository`,
            null,
            {
                name: 'CommitAgent',
                description: 'Plan and execute a git commit',
                cwd: projectPath, // Set the working directory for git operations
                instructions: `You are the **CommitAgent** for "${projectPath}"
Current branch: **${targetBranch}**

---

### Goal
Commit only *meaningful* changes produced by upstream AI agents; ignore noise (artifacts, cache, throw-away tests).

Meaningful:
• Source code that changes behavior
• Legit new tests tied to that code
• Docs / config developers care about

Noise (must not be committed):
build/, dist/, out/, node_modules/, vendor/, venv/, coverage, log files, IDE folders (.vscode, .idea), swap files, *.DS_Store, AI scratch files like \`temp_output.json\`, etc.

---

### Steps

1. **Diff** - list files changed since last commit (\`git status --porcelain\`).

2. **Evaluate** each diff. If none are meaningful, output exactly:

[complete]

3. **Stage** meaningful files only.
• Add ignore patterns to \`.gitignore\` when you spot recurring junk; stage the updated \`.gitignore\`.
• Double-check nothing from the noise list is staged.

4. **Commit** (do *not* push) with a Conventional Commit message:
   *Header* → \`type(scope?): description\` (≤ 72 chars)
   *Body* → why + what (optional but recommended)
   *Footer* → breaking-change notice or issue refs (optional)

5. On completion, output exactly:

[complete]`,
                modelClass: 'code',
            },
            agent.agent_id
        );

        // Check if commit was created by comparing HEAD
        let committed = false;
        let newHead = '';
        try {
            newHead = execSync(`git -C "${projectPath}" rev-parse HEAD`, {
                encoding: 'utf8',
            }).trim();
            committed = oldHead !== newHead && newHead !== '';
        } catch (e) {
            // Error getting HEAD, assume no commit was made
            committed = false;
        }

        if (!committed) {
            console.log(`[commit-planner] No commit created for ${projectId}`);
            return;
        }

        // Get commit details from git log
        let commitMessage = 'Commit changes';
        let commitDescription = '';
        try {
            commitMessage = execSync(
                `git -C "${projectPath}" log -1 --pretty=%s`,
                { encoding: 'utf8' }
            ).trim();

            commitDescription = execSync(
                `git -C "${projectPath}" log -1 --pretty=%b`,
                { encoding: 'utf8' }
            ).trim();
        } catch (e) {
            // Use default values if we can't get the actual commit message
        }

        // Send git pull request event with actual commit details
        console.log(
            `[commit-planner] Sending git_pull_request event for ${projectId}`
        );
        // Include the commit description in the message if available
        const fullMessage = commitDescription
            ? `${commitMessage}\n\n${commitDescription}`
            : commitMessage;

        await sendStreamEvent({
            type: 'git_pull_request',
            processId,
            projectId,
            branch: targetBranch,
            message: fullMessage,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error(
            `[commit-planner] Error during commit operation for ${projectId}:`,
            error
        );
    }
}
