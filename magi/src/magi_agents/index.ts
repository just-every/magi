/**
 * Agent registry for the MAGI system.
 *
 * This module exports all available agents and provides functions to create them.
 */

import { Agent } from '../utils/agent.js';
import { createManagerAgent } from './common_agents/manager_agent.js';
import { createReasoningAgent } from './common_agents/reasoning_agent.js';
import { createCodeAgent } from './common_agents/code_agent.js';
import { createBrowserAgent } from './common_agents/browser_agent.js';
import { createBrowserCodeAgent } from './common_agents/browser_code_agent.js';
import { createSearchAgent } from './common_agents/search_agent.js';
import { createShellAgent } from './common_agents/shell_agent.js';
import {
    createPlanningAgent,
    createWritingAgent,
    createTestingAgent,
    createPRSubmissionAgent,
    createPRReviewAgent,
    createGodelMachine,
    runGodelMachine,
    GodelStage,
} from './godel_machine/index.js';
import {
    createTaskDecompositionAgent,
    createWebSearchAgent,
    createContentExtractionAgent,
    createSynthesisAgent,
    createCodeGenerationAgent,
    createValidationAgent,
    createUnderstandingEngine,
    runResearchEngine,
    UnderstandingStage,
} from './research_engine/index.js';
import { createOverseerAgent } from './overseer_agent.js';
import { ModelClassID } from '../model_providers/model_data.js';
import { createOperatorAgent } from './operator_agent.js';

// Export all constants from the constants module
export * from './constants.js';

/**
 * Available agent types
 */
export type AgentType =
    | 'overseer'
    | 'operator'
    | 'supervisor'
    | 'manager'
    | 'reasoning'
    | 'code'
    | 'browser'
    | 'browser_code'
    | 'search'
    | 'shell'
    | 'godel_planning'
    | 'godel_writing'
    | 'godel_testing'
    | 'godel_pr_submission'
    | 'godel_pr_review'
    | 'understanding_task_decomposition'
    | 'understanding_web_search'
    | 'understanding_content_extraction'
    | 'understanding_synthesis'
    | 'understanding_code_generation'
    | 'understanding_validation';

/**
 * Create an agent of the specified type with optional model override and agent_id
 */
export function createAgent(args: Record<string, unknown>): Agent {
    const {
        agent: type,
        model,
        modelClass,
        agent_id,
    } = args as {
        agent: AgentType;
        model?: string;
        modelClass?: ModelClassID;
        agent_id?: string;
    };
    let agent: Agent;

    switch (type) {
        case 'overseer':
            agent = createOverseerAgent();
            break;
        case 'operator':
            agent = createOperatorAgent();
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
        case 'browser_code':
            agent = createBrowserCodeAgent();
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
            agent = createPRSubmissionAgent(
                'Please provide an issue description.'
            );
            break;
        case 'godel_pr_review':
            agent = createPRReviewAgent('Please provide an issue description.');
            break;
        // Research Engine agents
        case 'understanding_task_decomposition':
            agent = createTaskDecompositionAgent(
                'Please provide a research query.'
            );
            break;
        case 'understanding_web_search':
            agent = createWebSearchAgent('Please provide a research plan.');
            break;
        case 'understanding_content_extraction':
            agent = createContentExtractionAgent([]);
            break;
        case 'understanding_synthesis':
            agent = createSynthesisAgent(
                'Please provide a research query.',
                []
            );
            break;
        case 'understanding_code_generation':
            agent = createCodeGenerationAgent(
                'Please provide synthesis results.'
            );
            break;
        case 'understanding_validation':
            agent = createValidationAgent(
                'Please provide a research query.',
                'Please provide synthesis results.'
            );
            break;
        default:
            throw new Error(`Unknown agent type: ${type}`);
    }

    agent.args = args;

    // Override agent_id if specified
    if (agent_id) {
        agent.agent_id = agent_id;
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
    createManagerAgent,
    createReasoningAgent,
    createCodeAgent,
    createBrowserAgent,
    createBrowserCodeAgent,
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
    GodelStage,
    // Research Engine agents
    createTaskDecompositionAgent,
    createWebSearchAgent,
    createContentExtractionAgent,
    createSynthesisAgent,
    createCodeGenerationAgent,
    createValidationAgent,
    createUnderstandingEngine,
    runResearchEngine,
    UnderstandingStage,
};
