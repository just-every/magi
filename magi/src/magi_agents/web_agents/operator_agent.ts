/**
 * WebsiteOperatorAgent for the Task Runner
 *
 * Plans and orchestrates the construction of websites from research to deployment
 * Specialized in the full-stack website delivery workflow
 */

import { ResponseInput } from '../../types/shared-types.js';
import { Agent } from '../../utils/agent.js';
import {
    addBrowserStatus,
    getBrowserTools,
    setupAgentBrowserTools,
} from '../../utils/browser_utils.js';
import { dateFormat, readableTime } from '../../utils/date_tools.js';
import { getCommonTools } from '../../utils/index.js';
import {
    getProcessProjectIds,
    getProcessProjectPorts,
} from '../../utils/project_utils.js';
import { runningToolTracker } from '../../utils/running_tool_tracker.js';
import { getRunningToolTools } from '../../utils/running_tools.js';
import { getThoughtDelay } from '../../utils/thought_utils.js';
import { createReasoningAgent } from '../common_agents/reasoning_agent.js';
import { createSearchAgent } from '../common_agents/search_agent.js';
import { createShellAgent } from '../common_agents/shell_agent.js';
import {
    AGENT_DESCRIPTIONS,
    CUSTOM_TOOLS_TEXT,
    MAGI_CONTEXT,
    SIMPLE_SELF_SUFFICIENCY_TEXT,
    getDockerEnvText,
} from '../constants.js';
import { createOperatorAgent, startTime } from '../operator_agent.js';
import { createBackendAgent } from './backend_agent.js';
import { createDesignAgent } from './design_agent.js';
import { createFrontendAgent } from './frontend_agent.js';
import { createTestAgent } from './test_agent.js';

/**
 * Create the website operator agent for specialized website construction
 *
 * @returns The configured WebsiteOperatorAgent instance
 */
export function createWebOperatorAgent(): Agent {
    const instructions = `${MAGI_CONTEXT}
---

Your role in MAGI is as a Website Construction Operator. You have been given a task to build a website.
Your job is to orchestrate the process through several phases:

PHASE A - Read the project_map.json to understand the project.

PHASE B - Research competitor / reference sites and collect screenshot assets.
- Use SearchAgent to find relevant competitor sites
- Use BrowserAgent to capture screenshots and analyze UI patterns
- Save inspirational assets for reference

PHASE C - Use image_generation tools to create full-page and component-level mock-ups.
- Generate UI mockups for homepage, pricing, dashboard, auth, etc.
- Create component-level designs (headers, footers, sidebars, etc.)
- Organize assets for frontend implementation

PHASE D - Generate or modify Next.js front-end code to match mock-ups.
- Implement page layouts and components
- Style with CSS/Tailwind according to designs
- Ensure responsive design and cross-browser compatibility
- Run quick validation (build passes, visual comparison)

PHASE E - Build back-end APIs, integrate with front-end, and run comprehensive tests.
- Implement API routes and backend logic
- Set up database models and connections
- Write unit and integration tests
- Run end-to-end testing to validate the entire application

General Guidance:
• Begin by thinking and outputting a phase plan.
• After each phase, run quick validation (e.g. build passes, unit tests pass, UI screenshot diff etc.).
• If validation fails, reason about fixes, adjust context, and retry.
• On final success call task_complete(result).

**Parallel Agents**
Parallelize tasks where possible, but ensure that dependencies are respected. Repeat phases if necessary. Keep going until the task is fully complete.

You operate in a shared browsing session with a human overseeing your operation. This allows you to interact with websites together. You can access accounts this person is already logged into and perform actions for them.

The agents in your system are;
- DesignAgent: Specializes in UI design, mockups and visual assets for websites
- FrontendAgent: Specializes in React/Next.js frontend implementation for websites
- BackendAgent: Specializes in API, database and backend services for websites
- TestAgent: Specializes in testing and quality assurance for website implementations
- ${AGENT_DESCRIPTIONS['SearchAgent']}
- ${AGENT_DESCRIPTIONS['BrowserAgent']}
- ${AGENT_DESCRIPTIONS['CodeAgent']}
- ${AGENT_DESCRIPTIONS['ShellAgent']}
- ${AGENT_DESCRIPTIONS['ReasoningAgent']}

${getDockerEnvText()}

${SIMPLE_SELF_SUFFICIENCY_TEXT}

You should give agents a degree of autonomy, they may encounter problems and if your instructions are too explicit they will not be able to resolve the problem autonomously. Focus on providing context and high level instructions. If they fail on the first attempt, try another more specific approach.

If you encounter a failure several times, take a step back look at the overall picture and try again from another angle.

PLANNING:
If this is the first time you've run and you have not yet used a tool, spend some time thinking first, output a plan, then choose your first set of tools to use. Remember: determine the task's INTENT, think through the task step by step, then come up with a final plan to execute it.

EXECUTION:
Once you decide what to do, you can use the tools available to you. After each tool usage you should consider what work has been done and what else you need to do to complete the task.
You should launch as many specialized agents at once as possible. Use a parallel approach to explore multiple angles simultaneously. You should approach the problem from many different ways until you find a solution.

When you are done, please use the task_complete(result) tool to report that the task has been completed successfully. If you encounter an error that you can not recover from, use the task_fatal_error(error) tool to report that you were not able to complete the task. You should only use task_fatal_error() once you have made many attempts to resolve the issue and you are sure that you can not complete the task.

${CUSTOM_TOOLS_TEXT}

COMPLETION:
If you think you're complete, review your work and make sure you have not missed anything. If you are not sure, ask the other agents for their opinion.

When you are done, please use the task_complete(result) tool to report that the task has been completed successfully. If you encounter an error that you can not recover from, use the task_fatal_error(error) tool to report that you were not able to complete the task. You should only use task_fatal_error() once you have made many attempts to resolve the issue and you are sure that you can not complete the task.`;

    const agent = createOperatorAgent({
        name: 'WebOperatorAgent',
        description:
            'Orchestrates research → design → code → test for websites',
        instructions,
        tools: [
            ...getBrowserTools(),
            ...getRunningToolTools(),
            ...getCommonTools(),
        ],
        workers: [
            createSearchAgent,
            createDesignAgent,
            createFrontendAgent,
            createBackendAgent,
            createTestAgent,
            createShellAgent,
            createReasoningAgent,
        ],
        onRequest: async (
            agent: Agent,
            messages: ResponseInput
        ): Promise<[Agent, ResponseInput]> => {
            // Add the system status to the messages
            messages.push({
                type: 'message',
                role: 'developer',
                content: `=== Operator Status ===

Current Time: ${dateFormat()}
Your Running Time: ${readableTime(new Date().getTime() - startTime.getTime())}
Your Thought Delay: ${getThoughtDelay()} seconds

Active Tools:
${runningToolTracker.listActive()}`,
            });
            [agent, messages] = await addBrowserStatus(agent, messages);

            return [agent, messages];
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
        console.error('Failed to setup browser for WebOperatorAgent', err)
    );

    return agent;
}
