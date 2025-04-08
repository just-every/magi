/**
 * ExecutionAgent for the Task Force
 *
 * This agent orchestrates other specialized agents to complete tasks.
 */

import {Agent} from '../../utils/agent.js';
import {createCodeAgent} from '../common_agents/code_agent.js';
import {createBrowserAgent} from '../common_agents/browser_agent.js';
import {createSearchAgent} from '../common_agents/search_agent.js';
import {createShellAgent} from '../common_agents/shell_agent.js';
import {AGENT_DESCRIPTIONS, DOCKER_ENV_TEXT, SELF_SUFFICIENCY_TEXT, FILE_TOOLS_TEXT} from '../constants.js';
import {getFileTools} from '../../utils/file_utils.js';
import {taskForceContext} from './index.js';

/**
 * Create the ExecutionAgent
 */
export function createExecutionAgent(): Agent {

	return new Agent({
		name: 'ExecutionAgent',
		description: 'Orchestrator of specialized agents for complex tasks',
		instructions: `You work autonomously on long lasting tasks, not just short conversations. You manage a large pool of highly advanced resources through your Agents. You can efficiently split both simple and complex tasks into parts to be managed by a range of AI agents.

You will be given a task and a plan to work through to execute your task.

YOUR AGENTS:
- ${AGENT_DESCRIPTIONS['SearchAgent']}
- ${AGENT_DESCRIPTIONS['BrowserAgent']}
- ${AGENT_DESCRIPTIONS['CodeAgent']}
- ${AGENT_DESCRIPTIONS['ShellAgent']}

You should execute your agents in the order and dependencies listed in the plan.
You should run multiple agents at once if requested and follow any dependencies required for the results from one execution to be used in another.
Synthesize the results from all your agents into a output as requested in the plan.

${DOCKER_ENV_TEXT}

${FILE_TOOLS_TEXT}

${SELF_SUFFICIENCY_TEXT}
Take however long you need to complete a task. Don't give up!`,
		tools: [
			...getFileTools(),
		],
		workers: [
			createSearchAgent,
			createBrowserAgent,
			createCodeAgent,
			createShellAgent
		],
		modelClass: 'standard',
		onRequest: taskForceContext,
	});
}
