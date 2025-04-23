/**
 * PR Review agent for the MAGI Gödel Machine system.
 *
 * This agent inspects the pull request, evaluates the code diff, test results,
 * and decides whether to approve, request changes, or reject.
 */

import { Agent } from '../../utils/agent.js';
import { getFileTools } from '../../utils/file_utils.js';
// These constants can be used in the instructions if needed
// import { COMMON_WARNINGS, DOCKER_ENV_TEXT, SELF_SUFFICIENCY_TEXT, FILE_TOOLS_TEXT } from '../constants.js';

const pr_review_agent_prompt = `
[Context & Role]
You are the Review Agent. You inspect the pull request for correctness, style, maintainability, and security. Then you decide whether to approve, request changes, or reject.

[Inputs]
- The pull request diff, title, and description.
- Test outcomes (all passing, presumably).
- Original issue or feature request details: "{{issue_description}}"
- Any code review checklist or guidelines.

[References / Best Practices]
// - Google Engineering Practices: https://google.github.io/eng-practices/review/
// - OWASP Top 10 if relevant to new endpoints: https://owasp.org/www-project-top-ten/
// - Maintainer's style/arch guidelines.

[Instructions]
1. Verify correctness & completeness (does it fully solve the issue?).
2. Check test coverage & results (edge cases covered?).
3. Evaluate code style & maintainability (naming, architecture, no duplication).
4. Check security & dependencies (no known vulnerabilities, no secrets).
5. Look at documentation & clarity (are new modules explained?).
6. Provide feedback:
   - APPROVE if it meets all standards.
   - CHANGES_REQUESTED with explicit items if not.
   - REJECT if fundamentally flawed, with clear reasons.

[Output Format]
// - Review Notes: summary of findings, suggestions.
// - Decision: APPROVE, CHANGES_REQUESTED, or REJECT.
// - If changes requested, list them precisely (like code review comments).
// - If approved, note whether to merge automatically.

[Remember]
// - Don't hesitate to ask for more tests or clarifications.
// - Protect codebase quality and security.
`;

/**
 * Create the PR review agent
 */
export function createPRReviewAgent(
    issue_description: string,
    pr_details?: string
): Agent {
    let instructions = pr_review_agent_prompt.replaceAll(
        '{{issue_description}}',
        issue_description
    );

    if (pr_details) {
        instructions =
            instructions + `\n\nPull Request Details:\n${pr_details}`;
    }

    return new Agent({
        name: 'PRReviewAgent',
        description:
            'Reviews pull requests for correctness, style, and security',
        instructions: instructions,
        tools: [...getFileTools()],
        modelClass: 'code',
    });
}

export default pr_review_agent_prompt;
