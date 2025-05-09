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
    AgentInterface,
    ToolCall,
    ResponseThinkingMessage,
    ToolParameterMap,
} from '../types/shared-types.js';
import { createToolFunction } from './tool_call.js';

import { v4 as uuid } from 'uuid';
// Import removed to fix lint error
import { Runner } from './runner.js';
import { ModelClassID } from '../model_providers/model_data.js';
import { attachAgentSpecificTools } from './index.js';
import { truncateLargeValues } from './file_utils.js';

/**
 * Create a clone of an agent instance that properly handles functions
 * @param agent The agent to clone
 * @returns A new agent instance with copied properties and preserved function references
 */
export function cloneAgent(agent: Agent): Agent {
    // Create a new object with the same prototype
    const copy = Object.create(Object.getPrototypeOf(agent)) as Agent;

    // Copy own enumerable properties
    Object.entries(agent).forEach(([key, value]) => {
        // Keep original function references, don't try to duplicate them
        if (typeof value === 'function') {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore - we know the index type here
            copy[key] = value;
        } else if (key === 'parent' && value instanceof Agent) {
            // For parent, keep the reference intact to preserve prototype chain
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            copy[key] = value;
        } else if (Array.isArray(value)) {
            // Shallow copy array (its elements can include functions - we keep refs)
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            copy[key] = [...value];
        } else if (value && typeof value === 'object') {
            // Shallow copy object (deep copy is rarely needed for config objects)
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            copy[key] = { ...value };
        } else {
            // Copy primitive
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            copy[key] = value;
        }
    });

    return copy;
}

/**
 * Agent class representing an LLM agent with tools
 */
export class Agent implements AgentInterface {
    agent_id: string;
    name: string;
    description: string;
    instructions: string;
    parent_id?: string;
    workers?: Agent[];
    tools?: ToolFunction[];
    model?: string;
    modelClass?: ModelClassID;
    modelSettings?: ModelSettings;
    intelligence?: 'low' | 'standard' | 'high'; // Used to select the model
    maxToolCalls: number;
    maxToolCallRoundsPerTurn?: number; // Maximum number of tool call rounds per turn
    args: any;
    jsonSchema?: object; // JSON schema for structured output
    historyThread?: ResponseInput | undefined;

    // Optional callback to preprocess parameters before runAgentTool
    params?: ToolParameterMap; // Map of parameter names to their definitions
    processParams?: (
        agent: AgentInterface,
        params: Record<string, any>
    ) => Promise<{
        prompt: string;
        intelligence?: 'low' | 'standard' | 'high';
    }>;

    // Event handlers for tool calls and results
    onToolCall?: (toolCall: ToolCall) => Promise<void>;
    onToolResult?: (toolCall: ToolCall, result: string) => Promise<void>;

    // Event handlers for request and response
    onRequest?: (
        agent: Agent,
        messages: ResponseInput
    ) => Promise<[Agent, ResponseInput]>;
    onResponse?: (response: string) => Promise<string>;
    onThinking?: (message: ResponseThinkingMessage) => Promise<void>;
    tryDirectExecution?: (
        messages: ResponseInput
    ) => Promise<ResponseInput | null>; // Add this line

    constructor(definition: AgentDefinition) {
        this.agent_id = definition.agent_id || uuid();
        this.name = definition.name.replaceAll(' ', '_');
        this.description = definition.description;
        this.instructions = definition.instructions;
        this.tools = definition.tools || [];

        // Ensure agent-specific tools are attached once ID is assigned
        attachAgentSpecificTools(this);
        this.model = definition.model;
        this.modelClass = definition.modelClass;
        this.jsonSchema = definition.jsonSchema;
        this.params = definition.params;
        this.modelSettings = definition.modelSettings || {};
        this.maxToolCalls = definition.maxToolCalls || 200; // Default to 10 if not specified
        this.maxToolCallRoundsPerTurn = definition.maxToolCallRoundsPerTurn; // No default, undefined means no limit
        this.processParams = definition.processParams;

        this.onToolCall = definition.onToolCall;
        this.onToolResult = definition.onToolResult;
        // Assert the type to match the class property
        this.onRequest = definition.onRequest as (
            agent: Agent,
            messages: ResponseInput
        ) => Promise<[Agent, ResponseInput]>;
        this.onThinking = definition.onThinking;
        this.onResponse = definition.onResponse;
        this.tryDirectExecution = definition.tryDirectExecution; // Add this line

        // Configure JSON formatting if schema is provided
        if (this.jsonSchema) {
            if (!this.modelSettings) this.modelSettings = {};
            this.modelSettings.json_schema = this.jsonSchema;
        }

        if (definition.workers) {
            this.workers = definition.workers.map(
                (createAgentFn: WorkerFunction) => {
                    // Call the function with no arguments or adjust based on what ExecutableFunction expects
                    const agent = createAgentFn() as Agent;
                    agent.parent_id = this.agent_id;
                    return agent;
                }
            );
            this.tools = this.tools.concat(
                this.workers.map((worker: Agent) => worker.asTool())
            );
        }
    }

    /**
     * Create a tool from this agent that can be used by other agents
     */
    asTool(): ToolFunction {
        let description = `An agent called ${this.name}.\n\n${this.description}`;
        if (this.tools) {
            description += `\n\n${this.name} has access to the following tools:\n`;
            this.tools.forEach(tool => {
                description += `- ${tool.definition.function.name}\n`;
            });
            description +=
                '\nUse this as a guide when to call the agent, but let the agent decide which tools to use.';
        }
        return createToolFunction(
            async (...args: any[]) => {
                // Create a copy of the agent for this particular tool run with a unique ID
                const agent = cloneAgent(this);
                agent.agent_id = uuid();

                if (agent.processParams) {
                    let paramsObj: Record<string, any>;

                    // Handle single object argument vs positional arguments
                    if (
                        args.length === 1 &&
                        typeof args[0] === 'object' &&
                        args[0] !== null
                    ) {
                        // Already using named parameters
                        paramsObj = args[0] as Record<string, any>;
                    } else {
                        // Convert positional arguments to named parameters based on agent.params keys
                        paramsObj = {};
                        const paramKeys = Object.keys(agent.params || {});
                        paramKeys.forEach((key, idx) => {
                            if (idx < args.length) paramsObj[key] = args[idx];
                        });
                    }

                    const { prompt, intelligence } = await agent.processParams(
                        agent,
                        paramsObj
                    );
                    return runAgentTool(agent, prompt, intelligence);
                }

                // If we have standard positional arguments, convert them to a parameters object
                let task: string = typeof args[0] === 'string' ? args[0] : '';
                let context: string | undefined =
                    typeof args[1] === 'string' ? args[1] : undefined;
                let warnings: string | undefined =
                    typeof args[2] === 'string' ? args[2] : undefined;
                let goal: string | undefined =
                    typeof args[3] === 'string' ? args[3] : undefined;
                let intelligence: ('low' | 'standard' | 'high') | undefined =
                    args[4] as any;

                // If we have a single object argument with named parameters (from createToolFunction's validation),
                // extract the parameters
                if (
                    args.length === 1 &&
                    typeof args[0] === 'object' &&
                    args[0] !== null
                ) {
                    const params = args[0] as Record<string, any>;
                    task = params.task || task;
                    context = params.context || context;
                    warnings = params.warnings || warnings;
                    goal = params.goal || goal;
                    intelligence = params.intelligence || intelligence;
                }

                let prompt = `**Task:** ${task}`;
                if (context) {
                    prompt += `\n\n**Context:** ${context}`;
                }
                if (warnings) {
                    prompt += `\n\n**Warnings:** ${warnings}`;
                }
                if (goal) {
                    prompt += `\n\n**Goal:** ${goal}`;
                }

                // Standard parameter passing
                return runAgentTool(agent, prompt, intelligence);
            },
            description,
            this.params || {
                task: {
                    type: 'string',
                    description: `What should ${this.name} work on? Generally you should leave the way the task is performed up to the agent unless the agent previously failed. Agents are expected to work mostly autonomously.`,
                },
                context: {
                    type: 'string',
                    description: `What else might the ${this.name} need to know? Explain why you are asking for this - summarize the task you were given or the project you are working on. Please make it comprehensive. A couple of paragraphs is ideal.`,
                    optional: true,
                },
                warnings: {
                    type: 'string',
                    description: `Is there anything the ${this.name} should avoid or be aware of? You can leave this as a blank string if there's nothing obvious.`,
                    optional: true,
                },
                goal: {
                    type: 'string',
                    description: `This is the final goal/output or result you expect from the task. Try to focus on the overall goal and allow the ${this.name} to make it's own decisions on how to get there. One sentence is ideal.`,
                    optional: true,
                },
                intelligence: {
                    type: 'string',
                    description: `What level of intelligence do you recommend for this task?
					- low: (under 90 IQ) Mini model used.
					- standard: (90 - 110 IQ)
					- high: (110+ IQ) Reasoning used.`,
                    enum: ['low', 'standard', 'high'],
                    optional: true,
                },
            },
            undefined,
            this.name
        );
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
        if (this.parent_id) {
            // Make sure parent is an Agent with an export method
            agentExport.parent_id = this.parent_id;
        }
        return agentExport;
    }
}

/**
 * Run an agent and capture its streamed response, including any confidence signals
 */
async function runAgentTool(
    agent: Agent,
    prompt: string,
    intelligence?: 'low' | 'standard' | 'high'
): Promise<string> {
    // Ensure these values are set to undefined if not provided
    agent.intelligence = intelligence || undefined;

    const modelClass = agent.modelClass || 'standard';
    switch (agent.intelligence) {
        case 'low':
            if (['standard'].includes(modelClass)) {
                agent.modelClass = 'mini';
            }
            if (['code', 'reasoning'].includes(modelClass)) {
                agent.modelClass = 'standard';
            }
            break;
        case 'standard':
            // No change needed?
            break;
        case 'high':
            if (['mini'].includes(modelClass)) {
                agent.modelClass = 'standard';
            }
            if (['standard'].includes(modelClass)) {
                agent.modelClass = 'reasoning';
            }
            break;
    }

    const messages: ResponseInput = [];
    let toolResultsToInclude = '';
    const toolCalls: any[] = [];

    try {
        console.log(
            `runAgentTool using Runner.runStreamedWithTools for ${agent.name}`,
            prompt
        );

        // Set up handlers for the unified streaming function
        const handlers = {
            onToolCall: (toolCall: ToolCall) => {
                console.log(`${agent.name} intercepted tool call:`, toolCall);
                toolCalls.push(toolCall);
            },
            onToolResult: (toolCall: ToolCall, result: string) => {
                try {
                    console.log(
                        `${agent.name} intercepted tool result:`,
                        truncateLargeValues(result)
                    );
                    if (result) {
                        const resultString =
                            typeof result === 'string'
                                ? result
                                : JSON.stringify(result, null, 2);

                        // Store results so we can include them in the response if needed
                        toolResultsToInclude += resultString + '\n';
                        console.log(
                            `${agent.name} captured tool result: ${resultString.substring(0, 100)}...`
                        );
                    }
                } catch (err) {
                    console.error(
                        `Error processing intercepted tool result in ${agent.name}:`,
                        err
                    );
                }
            },
            onEvent: (event: StreamingEvent) => {
                // Capture tool results from tool_done events
                if (event.type === 'tool_done') {
                    try {
                        const toolEvent = event as ToolEvent;
                        const results = toolEvent.results;
                        if (results) {
                            const resultString =
                                typeof results === 'string'
                                    ? results
                                    : JSON.stringify(results, null, 2);

                            // Only add to results if it's not already included
                            if (
                                !toolResultsToInclude.includes(
                                    resultString.substring(
                                        0,
                                        Math.min(50, resultString.length)
                                    )
                                )
                            ) {
                                toolResultsToInclude += resultString + '\n';
                                console.log(
                                    `${agent.name} captured tool result from stream: ${resultString.substring(0, 100)}...`
                                );
                            }
                        }
                    } catch (err) {
                        console.error(
                            `Error processing tool result in ${agent.name}:`,
                            err
                        );
                    }
                }
            },
        };

        // Run the agent with the unified function
        let response = await Runner.runStreamedWithTools(
            agent,
            prompt,
            messages,
            handlers
        );

        // If we have a response but it doesn't seem to include tool results, append them
        if (
            response &&
            toolResultsToInclude &&
            !response.includes(
                toolResultsToInclude.substring(
                    0,
                    Math.min(50, toolResultsToInclude.length)
                )
            )
        ) {
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
