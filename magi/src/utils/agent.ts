/**
 * Agent framework for the MAGI system.
 *
 * This module defines the Agent class and the runner for executing LLM agents
 * with tools.
 */

import {
  AgentDefinition,
  ToolDefinition,
  ModelSettings,
  AgentExportDefinition
} from '../types.js';

import {v4 as uuid} from 'uuid';

/**
 * Agent class representing an LLM agent with tools
 */
export class Agent {
  agent_id: string;
  name: string;
  description: string;
  instructions: string;
  parent?: Agent;
  workers?: Agent[];
  tools?: ToolDefinition[];
  model?: string;
  modelClass?: string;
  modelSettings?: ModelSettings;

  // Event handlers for tool calls and results
  onToolCall?: (toolCall: any) => void;
  onToolResult?: (result: any) => void;

  constructor(definition: AgentDefinition, modelSettings?: ModelSettings) {
    this.agent_id = definition.agent_id || uuid();
    this.name = definition.name;
    this.description = definition.description;
    this.instructions = definition.instructions;
    this.tools = definition.tools || [];
    this.model = definition.model;
    this.modelClass = definition.modelClass;
    this.modelSettings = modelSettings;
    if(definition.workers) {
        this.workers = definition.workers.map((createAgent: Function) => {
          let agent = createAgent();
          agent.parent = this;
          return agent;
        });
        this.tools = this.tools.concat(this.workers.map((worker: Agent) => worker.asTool()));
    }
  }

  /**
   * Create a tool from this agent that can be used by other agents
   */
  asTool(): ToolDefinition {
    let description = `An AI agent called ${this.name}.\n\n${this.description}`;
    if(this.tools) {
        description += `\n\nThis agent has access to the following tools:\n`;
        this.tools.forEach(tool => {
            description += `- ${tool.function.name}: ${tool.function.description}\n`;
        });
        description += `\nUse the tool list as a guide when to call the agent, but generally you should let the agent decide which tools to use. You do not need to specify the tools in the prompt, as the agent will automatically choose the best tool for the task.`;
    }
    return {
      type: 'function',
      function: {
        name: this.name,
        description,
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The task or question for the agent to process. The agent only has the information you provide in this prompt. They have no other context beyond this. As all your agents are AI agents, you should provide them with sufficient context to complete their tasks. The best approach is to give them an overall view of the general task and their specific goal within that task. Agents are expected to work autonomously, so will rarely ask additional questions.'
            }
          },
          required: ['prompt']
        }
      }
    };
  }

  /**
   * Export this agent for event passing
   */
  export(): AgentExportDefinition {
    // Return a simplified representation of the agent
    let agentExport: AgentExportDefinition = {
      agent_id: this.agent_id,
      name: this.name,
    };
    if(this.model) {
      agentExport.model = this.model;
    }
    if(this.parent) {
      agentExport.parent = this.parent.export();
    }
    return agentExport;
  }
}
