/**
 * Test Agent for Website Construction
 *
 * Specializes in testing and validating website implementations:
 * - Running unit tests for components and functions
 * - Performing integration tests for API endpoints
 * - Executing end-to-end tests with Playwright
 * - Validating UI against design mockups
 */

import { Agent } from '../../utils/agent.js';
import { getCommonTools } from '../../utils/index.js';
import { MAGI_CONTEXT } from '../constants.js';
import { createCodeAgent } from '../common_agents/code_agent.js';
import { createBrowserAgent } from '../common_agents/browser_agent.js';
import { createShellAgent } from '../common_agents/shell_agent.js';
import { createReasoningAgent } from '../common_agents/reasoning_agent.js';
import {
    addBrowserStatus,
    setupAgentBrowserTools,
} from '../../utils/browser_utils.js';
import { addDesignAssetsStatus } from '../../utils/design_assets.js';
import {
    getProcessProjectIds,
    getProcessProjectPorts,
} from '../../utils/project_utils.js';
import { ResponseInput } from '@just-every/ensemble';

/**
 * Create the test agent for specialized validation and QA
 *
 * @returns The configured TestAgent instance
 */
export function createTestAgent(): Agent {
    const agent = new Agent({
        name: 'WebTestAgent',
        description:
            'Specializes in testing and quality assurance for website implementations',
        instructions: `${MAGI_CONTEXT}
---

You are a Test Agent specializing in validating website implementations through comprehensive testing.
Your primary responsibilities are:

1. UNIT TESTING
   - Write and run tests for React components using Jest/React Testing Library
   - Test utility functions and hooks
   - Ensure proper mocking of dependencies and external services
   - Verify edge cases and error handling

2. INTEGRATION TESTING
   - Test API endpoints with appropriate request validation
   - Verify database interactions with test fixtures
   - Test authentication flows and authorization checks
   - Ensure proper error responses and status codes

3. END-TO-END TESTING
   - Create Playwright/Cypress tests for critical user journeys
   - Test responsive behavior across different device sizes
   - Validate form submissions and user interactions
   - Test navigation and routing

4. VISUAL TESTING & VALIDATION
   - Compare implemented UI against design mockups
   - Verify consistent styling and component rendering
   - Check accessibility compliance (contrast, semantic markup, etc.)
   - Test cross-browser compatibility

TESTING BEST PRACTICES:
• Write clear, descriptive test names that explain what's being tested
• Follow the AAA pattern (Arrange-Act-Assert) for test clarity
• Isolate tests to prevent interdependencies
• Prioritize testing business-critical paths first
• Proper setup and teardown between tests
• Use appropriate assertions for different test scenarios

TESTING TOOLS:
• Unit/Component Testing: Jest, React Testing Library
• API Testing: Supertest, Jest
• E2E Testing: Playwright, Cypress
• Visual Testing: Screenshot comparison, visual regression tools
• Accessibility: axe-core, Lighthouse

DO NOT:
• Write brittle tests that fail on minor UI changes
• Test implementation details rather than behavior
• Skip validation of edge cases and error states
• Rely exclusively on E2E tests when unit/integration tests would be more appropriate

Your goal is to validate that the website implementation meets requirements, performs correctly, and provides a good user experience. Report issues clearly with specific actionable feedback.
`,
        tools: [...getCommonTools()],
        workers: [
            createShellAgent,
            createBrowserAgent,
            createCodeAgent,
            createReasoningAgent,
        ],
        modelClass: 'reasoning_mini',
        onRequest: async (
            a: Agent,
            m: ResponseInput
        ): Promise<[Agent, ResponseInput]> => {
            [a, m] = await addBrowserStatus(a, m);
            return addDesignAssetsStatus(a, m);
        },
    });

    const ports = getProcessProjectPorts();
    const ids = getProcessProjectIds();
    let startUrl: string | undefined;
    for (const id of ids) {
        if (ports[id]) {
            startUrl = `http://localhost:${ports[id]}`;
            break;
        }
    }
    void setupAgentBrowserTools(agent, startUrl).catch(err =>
        console.error('Failed to setup browser for WebTestAgent', err)
    );

    return agent;
}
