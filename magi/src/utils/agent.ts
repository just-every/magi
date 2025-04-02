/**
 * Agent framework for the MAGI system.
 *
 * This module defines the Agent class and the runner for executing LLM agents
 * with tools.
 */

import {
	AgentDefinition,
	ModelSettings,
	AgentExportDefinition,
	ToolEvent,
	ToolFunction,
	WorkerFunction,
	StreamingEvent,
	ResponseInput,
	AgentInterface, ToolCall,
} from '../types.js';

import {v4 as uuid} from 'uuid';
import {getCommunicationManager} from './communication.js';
import {Runner} from './runner.js';
import {ModelClassID} from '../model_providers/model_data.js';


/**
 * Agent class representing an LLM agent with tools
 */
export class Agent implements AgentInterface {
	agent_id: string;
	name: string;
	description: string;
	instructions: string;
	parent?: Agent;
	workers?: Agent[];
	tools?: ToolFunction[];
	model?: string;
	modelClass?: ModelClassID;
	modelSettings?: ModelSettings;
	maxToolCalls: number;

	// Event handlers for tool calls and results
	onToolCall?: (toolCall: ToolCall) => Promise<void>;
	onToolResult?: (toolCall: ToolCall, result: string) => Promise<void>;

	// Event handlers for request and response
	onRequest?: (messages: ResponseInput, model: string) => Promise<[ResponseInput, string, number]>;
	onResponse?: (response: string) => Promise<string>;

	constructor(definition: AgentDefinition, modelSettings?: ModelSettings) {

		this.agent_id = definition.agent_id || uuid();
		this.name = definition.name.replace(' ', '_');
		this.description = definition.description;
		this.instructions = definition.instructions;
		this.tools = definition.tools || [];
		this.model = definition.model;
		this.modelClass = definition.modelClass;
		this.modelSettings = modelSettings;
		this.maxToolCalls = definition.maxToolCalls || 10; // Default to 10 if not specified

		this.onToolCall = definition.onToolCall;
		this.onToolResult = definition.onToolResult;
		this.onRequest = definition.onRequest;
		this.onResponse = definition.onResponse;

		if (definition.workers) {
			this.workers = definition.workers.map((createAgentFn: WorkerFunction) => {
				// Call the function with no arguments or adjust based on what ExecutableFunction expects
				const agent = createAgentFn() as Agent;
				agent.parent = this;
				return agent;
			});
			this.tools = this.tools.concat(this.workers.map((worker: Agent) => worker.asTool()));
		}
	}

	/**
	 * Create a tool from this agent that can be used by other agents
	 */
	asTool(): ToolFunction {
		let description = `An AI agent called ${this.name}.\n\n${this.description}`;
		if (this.tools) {
			description += '\n\nThis agent has access to the following tools:\n';
			this.tools.forEach(tool => {
				description += `- ${tool.definition.function.name}\n`;
			});
			description += '\nUse the tool list as a guide when to call the agent, but you should let the agent decide which tools to use.';
		}
		return {
			function: (...args: (string | number | boolean)[]) => runAgentTool(this, String(args[0])),
			definition: {
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
			}
		};
	}

	/**
	 * Export this agent for event passing
	 */
	export(): AgentExportDefinition {
		// Return a simplified representation of the agent
		const agentExport: AgentExportDefinition = {
			agent_id: this.agent_id,
			name: this.name,
		};
		if (this.model) {
			agentExport.model = this.model;
		}
		if (this.modelClass) {
			agentExport.modelClass = this.modelClass;
		}
		if (this.parent) {
			agentExport.parent = this.parent.export();
		}
		return agentExport;
	}
}


/**
 * Run an agent and capture its streamed response
 */
async function runAgentTool(
	agent: Agent,
	prompt: string,
): Promise<string> {
	const messages: ResponseInput = [{role: 'user', content: prompt}];
	let toolResultsToInclude = '';
	const toolCalls: any[] = [];

	try {
		const comm = getCommunicationManager();
		console.log(`runAgentTool using Runner.runStreamedWithTools for ${agent.name}`, prompt);

		// Set up handlers for the unified streaming function
		const handlers = {
			onToolCall: (toolCall: ToolCall) => {
				console.log(`${agent.name} intercepted tool call:`, toolCall);
				toolCalls.push(toolCall);
			},
			onToolResult: (toolCall: ToolCall, result: string) => {
				try {
					console.log(`${agent.name} intercepted tool result:`, result);
					if (result) {
						const resultString = typeof result === 'string'
							? result
							: JSON.stringify(result, null, 2);

						// Store results so we can include them in the response if needed
						toolResultsToInclude += resultString + '\n';
						console.log(`${agent.name} captured tool result: ${resultString.substring(0, 100)}...`);
					}
				} catch (err) {
					console.error(`Error processing intercepted tool result in ${agent.name}:`, err);
				}
			},
			onEvent: (event: StreamingEvent) => {
				comm.send(event);

				// Capture tool results from tool_done events
				if (event.type === 'tool_done') {
					try {
						const toolEvent = event as ToolEvent;
						const results = toolEvent.results;
						if (results) {
							const resultString = typeof results === 'string'
								? results
								: JSON.stringify(results, null, 2);

							// Only add to results if it's not already included
							if (!toolResultsToInclude.includes(resultString.substring(0, Math.min(50, resultString.length)))) {
								toolResultsToInclude += resultString + '\n';
								console.log(`${agent.name} captured tool result from stream: ${resultString.substring(0, 100)}...`);
							}
						}
					} catch (err) {
						console.error(`Error processing tool result in ${agent.name}:`, err);
					}
				}
			}
		};

		// Run the agent with the unified function
		let response = await Runner.runStreamedWithTools(agent, prompt, messages, handlers);

		// If we have a response but it doesn't seem to include tool results, append them
		if (response && toolResultsToInclude &&
			!response.includes(toolResultsToInclude.substring(0, Math.min(50, toolResultsToInclude.length)))) {
			// Only append if the tool results aren't already reflected in the response
			console.log(`${agent.name} appending tool results to response`);
			response += '\n\nTool Results:\n' + toolResultsToInclude;
		}

		console.log(`${agent.name} final response: ${response}`);
		return response || `No response from ${agent.name.toLowerCase()}`;
	} catch (error) {
		console.error(`Error in ${agent.name}: ${error}`);
		return `Error in ${agent.name}: ${error}`;
	}
}
