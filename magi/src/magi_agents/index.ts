/**
 * Agent registry for the MAGI system.
 * 
 * This module exports all available agents and provides functions to create them.
 */

import 'dotenv/config';
import { Agent } from '../agent.js';
import { createSupervisorAgent } from './supervisor_agent.js';
import { createManagerAgent } from './workers/manager_agent.js';
import { createReasoningAgent } from './workers/reasoning_agent.js';
import { createCodeAgent } from './workers/code_agent.js';

// Export all constants from the constants module
export * from './constants.js';

/**
 * Available agent types
 */
export type AgentType = 
  | 'supervisor' 
  | 'manager' 
  | 'reasoning' 
  | 'code';

/**
 * Create an agent of the specified type with optional model override
 */
export function createAgent(type: AgentType, model?: string): Agent {
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
    default:
      throw new Error(`Unknown agent type: ${type}`);
  }
  
  // Apply model override if specified
  if (model) {
    agent.model = model;
  }
  
  return agent;
}

// Export all agent creation functions
export {
  createSupervisorAgent,
  createManagerAgent,
  createReasoningAgent,
  createCodeAgent
};