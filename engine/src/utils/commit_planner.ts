/**
 * MAGI CommitPlanner - Patch-based version
 *
 * Delegates commit planning to a CodeAgent, which analyzes changes
 * and generates patches that are stored in the database for review
 */

import { Agent } from '@just-every/ensemble';
import { execSync } from 'child_process';
import { sendStreamEvent } from './communication.js';
import { quick_llm_call } from './llm_call_utils.js';
import { get_output_dir } from './file_utils.js';
import { getDB } from './db.js';
// import { computeMetrics } from '../../controller/src/server/managers/commit_metrics.js';

/**
 * Plan and generate a patch for meaningful project changes
 *
 * Uses a CodeAgent to analyze changes and generate a git patch
 * that is stored in the database for later review and application
 *
 * @param agent - The agent context
 * @param projectId - The ID of the project
 * @returns Promise that resolves when the operation is complete
 */
export async function planAndCommitChanges(
    agent: Agent,
    projectId: string
): Promise<void> {
    const processId = process.env.PROCESS_ID;
    // Projects are now symlinked to /app/projects by the entrypoint
    const projectPath = `/app/projects/${projectId}`;

    try {
        console.log(`[commit-planner] Analyzing changes in ${projectId}...`);

        // Check if the current branch has commits that haven't been pushed to main/master
        let mainBranch = 'main';
        try {
            // Check if 'main' exists, otherwise use 'master'
            execSync(`git -C "${projectPath}" rev-parse --verify main`, { stdio: 'pipe' });
        } catch (e) {
            try {
                execSync(`git -C "${projectPath}" rev-parse --verify master`, { stdio: 'pipe' });
                mainBranch = 'master';
            } catch (e2) {
                console.warn(`[commit-planner] Could not find main or master branch`);
            }
        }

        // Get the current branch name
        let currentBranch = mainBranch;
        try {
            currentBranch = execSync(
                `git -C "${projectPath}" rev-parse --abbrev-ref HEAD`,
                { encoding: 'utf8' }
            ).trim();
        } catch (e) {
            console.warn(`[commit-planner] Could not determine current branch, using '${mainBranch}'`);
        }

        // Check if there are commits on the current branch that aren't on main/master
        let hasExistingCommits = false;
        let commitCount = 0;
        if (currentBranch !== mainBranch) {
            try {
                const commitList = execSync(
                    `git -C "${projectPath}" rev-list ${mainBranch}..HEAD`,
                    { encoding: 'utf8' }
                ).trim();
                if (commitList) {
                    hasExistingCommits = true;
                    commitCount = commitList.split('\n').filter(Boolean).length;
                    console.log(`[commit-planner] Found ${commitCount} existing commits on branch ${currentBranch}`);
                }
            } catch (e) {
                console.log(`[commit-planner] Could not compare with ${mainBranch} branch`);
            }
        }

        // If there are existing commits, generate a patch from them
        if (hasExistingCommits) {
            console.log(`[commit-planner] Creating patch from existing commits...`);
            
            // Get the commit messages
            let commitMessages = '';
            try {
                commitMessages = execSync(
                    `git -C "${projectPath}" log ${mainBranch}..HEAD --pretty=format:"%s%n%n%b" --reverse`,
                    { encoding: 'utf8' }
                ).trim();
            } catch (e) {
                console.error(`[commit-planner] Failed to get commit messages: ${e}`);
            }

            // Generate patch from the commits
            let patchContent = '';
            try {
                patchContent = execSync(
                    `git -C "${projectPath}" diff ${mainBranch}..HEAD`,
                    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 } // 50MB max
                );

                if (!patchContent.trim()) {
                    console.log(`[commit-planner] Generated patch is empty`);
                    return;
                }
            } catch (e) {
                console.error(`[commit-planner] Failed to generate patch from commits: ${e}`);
                return;
            }

            // Use the existing commit messages as the patch description
            const commitMessage = commitCount > 1 
                ? `Combined ${commitCount} commits from branch ${currentBranch}\n\n${commitMessages}`
                : commitMessages || `Changes from branch ${currentBranch}`;

            // Calculate metrics from the existing commits
            let metrics = null;
            try {
                const numstat = execSync(
                    `git -C "${projectPath}" diff --numstat ${mainBranch}..HEAD`,
                    { encoding: 'utf8' }
                ).trim().split('\n').filter(Boolean);
                
                let totalAdds = 0;
                let totalDels = 0;
                
                for (const line of numstat) {
                    const [adds, dels] = line.split('\t');
                    totalAdds += parseInt(adds) || 0;
                    totalDels += parseInt(dels) || 0;
                }
                
                metrics = {
                    filesChanged: numstat.length,
                    totalLines: totalAdds + totalDels,
                    additions: totalAdds,
                    deletions: totalDels
                };
            } catch (err) {
                console.warn('[commit-planner] Failed to compute metrics:', err);
            }

            // Save patch to database
            const client = await getDB();
            try {
                const result = await client.query(
                    `INSERT INTO patches 
                    (process_id, project_id, branch_name, commit_message, patch_content, metrics, status)
                    VALUES ($1, $2, $3, $4, $5, $6, 'pending')
                    RETURNING id`,
                    [processId, projectId, currentBranch, commitMessage, patchContent, metrics]
                );

                const patchId = result.rows[0].id;

                // Send git pull request event with patch reference
                console.log(
                    `[commit-planner] Sending git_pull_request event for ${projectId} with patch #${patchId} (from existing commits)`
                );

                await sendStreamEvent({
                    type: 'git_pull_request',
                    processId,
                    projectId,
                    branch: currentBranch,
                    message: commitMessage,
                    patchId,
                    timestamp: new Date().toISOString(),
                });

                console.log(`[commit-planner] Patch #${patchId} created successfully from existing commits for ${projectId}`);
            } finally {
                client.release();
            }
            return;
        }

        // If no existing commits, check for uncommitted changes
        const statusOutput = execSync(
            `git -C "${projectPath}" status --porcelain`
        ).toString();
        if (!statusOutput.trim()) {
            console.log(`[commit-planner] No changes detected in ${projectId}`);
            return;
        }

        console.log(
            `[commit-planner] Delegating git analysis for ${projectId} to CodeAgent...`
        );

        // Call CodeAgent to analyze and stage changes
        const response = await quick_llm_call(
            `Please analyze and stage the meaningful changes in the ${projectPath} repository`,
            null,
            {
                name: 'PatchAgent',
                description: 'Analyze changes and prepare a patch',
                cwd: projectPath, // Set the working directory for git operations
                instructions: `You are the **PatchAgent** for "${projectPath}"
Current branch: **${currentBranch}**

---

### Goal
Stage only *meaningful* changes produced by upstream AI agents; ignore noise (artifacts, cache, throw-away tests).

Meaningful:
• Source code that changes behavior
• Legit new tests tied to that code
• Docs / config developers care about

Noise (must not be staged):
build/, dist/, out/, node_modules/, vendor/, venv/, coverage, log files, IDE folders (.vscode, .idea), swap files, *.DS_Store, AI scratch files like \`temp_output.json\`, etc.

---

### Steps

1. **Diff** - list files changed since last commit (\`git status --porcelain\`).

2. **Evaluate** each diff. If none are meaningful, output exactly:

[no-changes]

3. **Stage** meaningful files only.
• Add ignore patterns to \`.gitignore\` when you spot recurring junk; stage the updated \`.gitignore\`.
• Double-check nothing from the noise list is staged.

4. **Generate commit message** following Conventional Commit format:
   *Header* → \`type(scope?): description\` (≤ 72 chars)
   *Body* → why + what (optional but recommended)
   *Footer* → breaking-change notice or issue refs (optional)

5. Output the commit message at the end starting with:

[commit-message]
<your commit message here>

Do NOT actually commit the changes - just stage them and provide the message.`,
                modelClass: 'code',
            },
            agent.agent_id
        );

        // Check if there were no meaningful changes
        if (response.includes('[no-changes]')) {
            console.log(`[commit-planner] No meaningful changes to commit for ${projectId}`);
            return;
        }

        // Extract commit message from response
        const commitMessageMatch = response.match(/\[commit-message\]\s*([\s\S]+?)$/);
        if (!commitMessageMatch) {
            console.error(`[commit-planner] Could not extract commit message from response`);
            return;
        }
        const commitMessage = commitMessageMatch[1].trim();

        // Generate the patch from staged changes
        let patchContent = '';
        try {
            // First check if there are staged changes
            const stagedFiles = execSync(
                `git -C "${projectPath}" diff --cached --name-only`,
                { encoding: 'utf8' }
            ).trim();
            
            if (!stagedFiles) {
                console.log(`[commit-planner] No changes were staged by the agent`);
                return;
            }

            // Generate patch from staged changes
            patchContent = execSync(
                `git -C "${projectPath}" diff --cached`,
                { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 } // 50MB max
            );

            if (!patchContent.trim()) {
                console.log(`[commit-planner] Generated patch is empty`);
                return;
            }
        } catch (e) {
            console.error(`[commit-planner] Failed to generate patch: ${e}`);
            return;
        }

        // Calculate simple metrics for the patch
        let metrics = null;
        try {
            // Count files and lines changed
            const fileList = execSync(
                `git -C "${projectPath}" diff --cached --name-only`,
                { encoding: 'utf8' }
            ).trim().split('\n').filter(Boolean);
            
            const numstat = execSync(
                `git -C "${projectPath}" diff --cached --numstat`,
                { encoding: 'utf8' }
            ).trim().split('\n').filter(Boolean);
            
            let totalAdds = 0;
            let totalDels = 0;
            
            for (const line of numstat) {
                const [adds, dels] = line.split('\t');
                totalAdds += parseInt(adds) || 0;
                totalDels += parseInt(dels) || 0;
            }
            
            metrics = {
                filesChanged: fileList.length,
                totalLines: totalAdds + totalDels,
                additions: totalAdds,
                deletions: totalDels
            };
        } catch (err) {
            console.warn('[commit-planner] Failed to compute metrics:', err);
            // Continue without metrics - not a fatal error
        }

        // Save patch to database
        const client = await getDB();
        try {
            const result = await client.query(
                `INSERT INTO patches 
                (process_id, project_id, branch_name, commit_message, patch_content, metrics, status)
                VALUES ($1, $2, $3, $4, $5, $6, 'pending')
                RETURNING id`,
                [processId, projectId, currentBranch, commitMessage, patchContent, metrics]
            );

            const patchId = result.rows[0].id;

            // Send git pull request event with patch reference
            console.log(
                `[commit-planner] Sending git_pull_request event for ${projectId} with patch #${patchId}`
            );

            await sendStreamEvent({
                type: 'git_pull_request',
                processId,
                projectId,
                branch: currentBranch,
                message: commitMessage,
                patchId, // Include patch ID in the event
                timestamp: new Date().toISOString(),
            });

            console.log(`[commit-planner] Patch #${patchId} created successfully for ${projectId}`);
        } finally {
            client.release();
        }

        // Reset staged changes to clean up
        try {
            execSync(`git -C "${projectPath}" reset`, { stdio: 'pipe' });
        } catch (e) {
            console.warn(`[commit-planner] Failed to reset staged changes: ${e}`);
        }
    } catch (error) {
        console.error(
            `[commit-planner] Error during patch generation for ${projectId}:`,
            error
        );
    }
}