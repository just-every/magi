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
import { createSearchAgent } from './common_agents/search_agent.js';
import { createShellAgent } from './common_agents/shell_agent.js';
import { createImageAgent } from './common_agents/image_agent.js';
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
    | 'image';

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
        case 'search':
            agent = createSearchAgent();
            break;
        case 'shell':
            agent = createShellAgent();
            break;
        case 'image':
            agent = createImageAgent();
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
    createSearchAgent,
    createShellAgent,
    createImageAgent,
};
