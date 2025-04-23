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

function expandInstructions(definition: AgentDefinition): string {
    // Expand the instructions to include the context
    let instructions = definition.instructions;

    // Add confidence signaling instructions if enabled
    if (definition.modelSettings?.enableConfidenceMonitoring) {
        instructions += `

AGENT CONFIDENCE MONITORING
When receiving results from worker agents, look for a 'Confidence [0-100]: X' score at the end of their responses. These scores indicate how confident the agent is in its result:
- High confidence (75-100): The agent is very sure of its answer/solution
- Medium confidence (40-74): The agent has a reasonable answer but isn't completely certain
- Low confidence (0-39): The agent is unsure or encountered significant issues
Use these confidence scores to guide your decision-making process. When an agent reports low confidence, consider seeking additional information, validation from another agent, or trying a different approach.

REFLECTIVE SYNTHESIS
For complex tasks, especially when using multiple worker agents, take time to critically evaluate and synthesize their outputs before proceeding:
1. Explicitly compare and contrast the results from different agents
2. Identify any conflicts, inconsistencies, or gaps in the information
3. For crucial decision points or when facing conflicting information of similar confidence, invoke the ReasoningAgent to validate your approach or help resolve discrepancies
4. Clearly document your synthesis process and reasoning in your response

This reflective process is especially important when:
- Multiple agents return conflicting results
- An agent reports low confidence in its solution
- You're making a critical decision that affects the entire task`;
    }

    if (definition.modelSettings?.enableConfidenceSignaling) {
        instructions += `

CONFIDENCE SIGNALING:
At the very end of your response, please include a self-assessment of your confidence in your analysis and conclusions.
Rate your confidence on a scale of 0-100, formatted exactly as: Confidence [0-100]: [your score]

Use the following guidelines when assigning your confidence score:
- 75-100: Very confident - You have a strong logical basis, sufficient information, and clear reasoning path
- 40-74: Moderately confident - Some uncertainty exists due to assumptions, limited information, or multiple valid interpretations
- 0-39: Low confidence - Significant uncertainty, missing critical information, or highly speculative reasoning

For example: "Confidence [0-100]: 85" would indicate high confidence in your answer.`;
    }

    return instructions;
}

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
    parent?: Agent;
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
        this.instructions = expandInstructions(definition);
        this.tools = definition.tools || [];
        this.model = definition.model;
        this.modelClass = definition.modelClass;
        this.jsonSchema = definition.jsonSchema;
        this.params = definition.params;
        this.modelSettings = definition.modelSettings || {};
        this.maxToolCalls = definition.maxToolCalls || 10; // Default to 10 if not specified
        this.maxToolCallRoundsPerTurn = definition.maxToolCallRoundsPerTurn; // No default, undefined means no limit
        this.processParams = definition.processParams;

        this.onToolCall = definition.onToolCall;
        this.onToolResult = definition.onToolResult;
        this.onRequest = definition.onRequest;
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
                    agent.parent = this;

                    if (definition.modelSettings?.enableConfidenceMonitoring) {
                        // Force worker agents to use confidence signaling
                        agent.modelSettings = agent.modelSettings || {};
                        if (
                            !agent.modelSettings.json_schema &&
                            !agent.modelSettings.force_json
                        ) {
                            agent.modelSettings.enableConfidenceSignaling =
                                true;
                        }
                    }
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
        if (this.parent) {
            // Make sure parent is an Agent with an export method
            try {
                agentExport.parent = this.parent.export();
            } catch (err) {
                console.error(`Error exporting parent for ${this.name}:`, err);
                // Fall back to a basic export without parent to avoid breaking the chain
                agentExport.parent = {
                    agent_id: this.parent.agent_id || 'unknown',
                    name: this.parent.name || 'unknown_parent',
                };
            }
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

    const messages: ResponseInput = [{ role: 'user', content: prompt }];
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
                        result
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

        // Check for confidence signaling if enabled for the calling agent
        // The confidence score will be propagated to the calling agent if it's enabled for confidence signaling
        if (agent.parent?.modelSettings?.enableConfidenceSignaling) {
            // Extract confidence score using regex pattern - format: "Confidence [0-100]: X"
            const confidenceMatch = response.match(
                /Confidence\s*\[0-100\]:\s*(\d{1,3})$/m
            );
            if (confidenceMatch && confidenceMatch[1]) {
                const confidenceScore = parseInt(confidenceMatch[1], 10);
                if (confidenceScore >= 0 && confidenceScore <= 100) {
                    console.log(
                        `${agent.name} reported confidence score: ${confidenceScore}`
                    );

                    // Option 1: Prepend the confidence to the response for visibility
                    // This keeps the original confidence signal at the end and adds a more visible marker at the beginning
                    response = `[Agent confidence: ${confidenceScore}/100] ${response}`;

                    // Option 2: (Alternative) Remove the original confidence line and add a standardized format
                    // This would make the response cleaner but might interfere with the original formatting
                    // Uncommenting this would replace Option 1
                    /*
					// Remove the original confidence line
					response = response.replaceAll(/Confidence\s*\[0-100\]:\s*\d{1,3}$/m, '').trim();
					// Add confidence in a standardized format
					response += `\n\n[Confidence: ${confidenceScore}/100]`;
					*/
                }
            }
        }

        console.log(`${agent.name} final response: ${response}`);
        return response || `No response from ${agent.name.toLowerCase()}`;
    } catch (error) {
        console.error(`Error in ${agent.name}: ${error}`);
        return `Error in ${agent.name}: ${error}`;
    }
}
