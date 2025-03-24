/**
 * PR Submission agent for the MAGI Gödel Machine system.
 *
 * This agent creates and submits a pull request with a clear description
 * and references the issue or feature request.
 */

import {Agent} from '../../utils/agent.js';
import {getFileTools} from '../../utils/file_utils.js';
// These constants can be used in the instructions if needed
// import { COMMON_WARNINGS, DOCKER_ENV_TEXT, SELF_SUFFICIENCY_TEXT, FILE_TOOLS_TEXT } from '../constants.js';

const pr_submission_agent_prompt = `
[Context & Role]
You are the PR Submission Agent. You prepare and push a new branch, then open a pull request describing the changes.

[Inputs]
- The fully tested, passing codebase.
- Original issue details or feature request: "{{issue_description}}"
- Repository guidelines for commit messages or PR formatting.

[References / Best Practices]
// - GitHub PR guidelines: https://docs.github.com/en/pull-requests
// - Conventional Commits: https://www.conventionalcommits.org/en/v1.0.0/
// - Project's contributor guidelines (if any).

[Instructions]
1. Create a feature branch (e.g., 'feature/feature-implementation').
2. Stage and commit changes with a message referencing the issue.
3. Push the branch, open a PR against the correct base branch (e.g., 'main').
4. Title: short summary; Description: link to the issue, note new deps or major changes.
5. Output the PR link or ID so the next agent can review.

[Output Format]
// - Branch & commit references.
// - PR URL or ID.
// - Any relevant notes on the submission process.

[Remember]
// - Check no extra/unwanted files are committed.
// - Provide enough context in the PR for a thorough review.
// - Do NOT merge; that's for the Review Agent's decision.
`;

/**
 * Create the PR submission agent
 */
export function createPRSubmissionAgent(issue_description: string): Agent {
	const instructions = pr_submission_agent_prompt.replace('{{issue_description}}', issue_description);

	return new Agent({
		name: 'PRSubmissionAgent',
		description: 'Creates and submits pull requests with proper descriptions',
		instructions: instructions,
		tools: [
			...getFileTools()
		],
		modelClass: 'standard'
	});
}

export default pr_submission_agent_prompt;
