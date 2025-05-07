/**
 * Utility functions for making quick, ad-hoc LLM calls
 *
 * Provides standardized ways to call models while ensuring
 * proper model rotation, cost tracking, and quota management.
 */

import { Runner } from './runner.js';
import { createAgent, AgentType } from '../magi_agents/index.js';
import {
    ResponseInput,
    ToolFunction,
    ModelClassID,
    StreamEventType,
    type AgentDefinition,
} from '../types/shared-types.js';
import { Agent } from './agent.js';

/**
 * Options for quick LLM calls
 */
export interface QuickLlmOpts {
    parent?: Agent; // Optional parent agent for the call

    agent?: AgentType; // Optional agent type for the call

    /** High-level model class (e.g., 'reasoning', 'summary', 'writing'). Default is 'reasoning' */
    modelClass?: ModelClassID;

    /** Explicit model override (e.g., 'gpt-4o'). Takes precedence over modelClass if provided */
    model?: string;

    /** Tools to expose to the model */
    tools?: ToolFunction[];

    /** Model-specific settings (temperature, top_p, max_tokens, json options, etc.) */
    modelSettings?: {
        force_json?: boolean;
        json_schema?: object;
        temperature?: number;
        top_p?: number;
        max_tokens?: number;
        stop_sequence?: string;
        [key: string]: any;
    };

    /** Whitelist of stream event types (defaults to ['message_delta', 'message_complete']) */
    streamEvents?: StreamEventType[];
}

/**
 * Make a quick LLM call and return the result as a string
 *
 * This helper allows for easy, one-off calls to LLMs without manually creating
 * an agent and processing the stream. It uses the existing model rotation,
 * cost tracking, and quota management infrastructure.
 *
 * @param messages - Either a string (wrapped as user message) or a full ResponseInput array
 * @param opts - Optional configuration for the call
 * @param communicationManager - Optional communication manager instance to use
 * @returns A promise that resolves to the complete text response
 */
export async function quickLlmCall(
    agent: AgentType | AgentDefinition,
    messages?: ResponseInput | string,
    opts: QuickLlmOpts = {},
    communicationManager?: any // Add optional communicationManager parameter
): Promise<string> {
    const quickAgent =
        typeof agent === 'string'
            ? createAgent({ agent })
            : new Agent(agent as AgentDefinition);

    // Apply model override if provided
    if (opts.modelClass) {
        quickAgent.modelClass = opts.modelClass;
    }
    if (opts.model) {
        quickAgent.model = opts.model;
    }

    if (opts.parent) {
        quickAgent.parent = opts.parent;
    }

    // Set up historyThread for the agent
    quickAgent.historyThread = [];

    // Prepare messages array
    const messagesArray: ResponseInput = messages
        ? typeof messages === 'string'
            ? [{ type: 'message', role: 'user', content: messages }]
            : messages
        : [];

    // Add tools if provided
    if (opts.tools && opts.tools.length > 0) {
        quickAgent.tools = [...(quickAgent.tools || []), ...opts.tools];
    }

    // Add modelSettings if provided
    if (opts.modelSettings) {
        quickAgent.modelSettings = opts.modelSettings;
    }

    // Call the Runner with our agent and message array, passing the communicationManager
    // Runner.runStreamedWithTools already returns a string promise
    return await Runner.runStreamedWithTools(quickAgent, '', messagesArray, {}, undefined, 0, communicationManager);
}
