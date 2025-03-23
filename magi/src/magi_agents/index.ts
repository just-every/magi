/**
 * Agent registry for the MAGI system.
 *
 * This module exports all available agents and provides functions to create them.
 */

import 'dotenv/config';
import {Agent} from '../utils/agent.js';
import {createSupervisorAgent} from './supervisor_agent.js';
import {createManagerAgent} from './workers/manager_agent.js';
import {createReasoningAgent} from './workers/reasoning_agent.js';
import {createCodeAgent} from './workers/code_agent.js';
import {createBrowserAgent} from './workers/browser_agent.js';
import {createBrowserVisionAgent} from './workers/browser_vision_agent.js';
import {createSearchAgent} from './workers/search_agent.js';
import {createShellAgent} from './workers/shell_agent.js';
import {
	createPlanningAgent,
	createWritingAgent,
	createTestingAgent,
	createPRSubmissionAgent,
	createPRReviewAgent,
	createGodelMachine,
	runGodelMachine,
	GodelStage
} from './godel_machine/index.js';

// Export all constants from the constants module
export * from './constants.js';

/**
 * Available agent types
 */
export type AgentType =
	| 'supervisor'
	| 'manager'
	| 'reasoning'
	| 'code'
	| 'browser'
	| 'browser_vision'
	| 'search'
	| 'shell'
	| 'godel_planning'
	| 'godel_writing'
	| 'godel_testing'
	| 'godel_pr_submission'
	| 'godel_pr_review';

/**
 * Create an agent of the specified type with optional model override
 */
export function createAgent(type: AgentType, model?: string, modelClass?: string): Agent {
	let agent: Agent;

	switch (type) {
		case 'supervisor':
			agent = createSupervisorAgent();
			break;
		case 'manager':
			agent = createManagerAgent();
			break;
		case 'reasoning':
			agent = createReasoningAgent();
			break;
		case 'code':
			agent = createCodeAgent();
			break;
		case 'browser':
			agent = createBrowserAgent();
			break;
		case 'browser_vision':
			agent = createBrowserVisionAgent();
			break;
		case 'search':
			agent = createSearchAgent();
			break;
		case 'shell':
			agent = createShellAgent();
			break;
		case 'godel_planning':
			agent = createPlanningAgent('Please provide an issue description.');
			break;
		case 'godel_writing':
			agent = createWritingAgent('Please provide a plan document.');
			break;
		case 'godel_testing':
			agent = createTestingAgent();
			break;
		case 'godel_pr_submission':
			agent = createPRSubmissionAgent('Please provide an issue description.');
			break;
		case 'godel_pr_review':
			agent = createPRReviewAgent('Please provide an issue description.');
			break;
		default:
			throw new Error(`Unknown agent type: ${type}`);
	}

	// Apply model override if specified
	if (model) {
		agent.model = model;
	}

	// Apply model class if specified
	if (modelClass) {
		agent.modelClass = modelClass;
	}

	return agent;
}

// Export all agent creation functions
export {
	createSupervisorAgent,
	createManagerAgent,
	createReasoningAgent,
	createCodeAgent,
	createBrowserAgent,
	createBrowserVisionAgent,
	createSearchAgent,
	createShellAgent,
	// Gödel Machine agents
	createPlanningAgent,
	createWritingAgent,
	createTestingAgent,
	createPRSubmissionAgent,
	createPRReviewAgent,
	createGodelMachine,
	runGodelMachine,
	GodelStage
};
