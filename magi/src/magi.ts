/**
 * Main entry point for the MAGI system (TypeScript version).
 *
 * This module handles command processing, agent initialization, and system setup.
 */

import 'dotenv/config';
import {parseArgs} from 'node:util';
import {Runner, handleToolCall} from './agent.js';
import {ToolCallEvent, MessageEvent, AgentUpdatedEvent} from './types.js';
import {createAgent, AgentType} from './magi_agents/index.js';
import {addInput, addOutput, loadMemory, getConversationHistory} from './utils/memory.js';

// Parse command line arguments
function parseCommandLineArgs() {
    const options = {
        test: {type: 'boolean' as const, short: 't', default: false},
        debug: {type: 'boolean' as const, short: 'd', default: false},
        agent: {type: 'string' as const, short: 'a', default: 'supervisor'},
        prompt: {type: 'string' as const, short: 'p'},
        base64: {type: 'string' as const, short: 'b'},
        model: {type: 'string' as const, short: 'm'},
        'list-models': {type: 'boolean' as const, default: false}
    };

    const {values} = parseArgs({options, allowPositionals: true});
    return values;
}

/**
 * Process a tool call from an agent
 */
async function processToolCall(toolCall: ToolCallEvent): Promise<string> {
    try {
        // Extract tool call data
        const {tool_calls} = toolCall;

        if (!tool_calls || tool_calls.length === 0) {
            return "No tool calls found in event";
        }

        // Process each tool call
        const results: any[] = [];

        for (const call of tool_calls) {
            try {
                // Validate tool call
                if (!call || !call.function || !call.function.name) {
                    console.error(`Invalid tool call structure:`, call);
                    results.push({error: "Invalid tool call structure"});
                    continue;
                }

                // Handle the tool call
                const result = await handleToolCall(call);
                results.push(result);

                // Log tool call
                const {function: {name}} = call;
                console.log(`[Tool] ${name} executed successfully`);
            } catch (error) {
                console.error(`Error executing tool:`, error);
                results.push({error: String(error)});
            }
        }

        // Return results as a JSON string
        return JSON.stringify(results, null, 2);
    } catch (error) {
        console.error(`Error processing tool call:`, error);
        return `{"error": "${String(error).replace(/"/g, '\\"')}"}`;
    }
}

/**
 * Execute a command using an agent and capture the results
 */
export async function runMagiCommand(
    command: string,
    agentType: AgentType = 'supervisor',
    model?: string
): Promise<string> {
    // Record command in system memory for context
    addInput(command);

    // Collection of all output chunks for final result
    const allOutput: string[] = [];

    // Run the command through the selected agent with streaming output
    console.log(`Running command with ${agentType} agent: ${command.substring(0, 100)}...`);

    try {
        // Create the agent with specified type and model
        if (model) {
            console.log(`Forcing model: ${model}`);
        }

        // Create the agent with model parameter
        const agent = createAgent(agentType, model);

        // Get conversation history
        const history = getConversationHistory();

        // Run the command with streaming
        const stream = Runner.runStreamed(agent, command, history);

        // Process streaming events
        for await (const event of stream) {
            // Handle different event types
            switch (event.type) {
                case 'message':
                    // Add the message content to output
                    const messageEvent = event as MessageEvent;
                    if (messageEvent.content && messageEvent.content.trim()) {
                        console.log(`[${agent.name}] Output: ${messageEvent.content.substring(0, 100)}...`);
                        allOutput.push(messageEvent.content);
                    }
                    break;

                case 'tool_calls':
                    // Process tool calls
                    const toolCallEvent = event as ToolCallEvent;

                    // Log tool call
                    const toolNames = toolCallEvent.tool_calls
                        .map(call => call.function.name)
                        .join(', ');

                    console.log(`[${agent.name}] Tool calls: ${toolNames}`);

                    // Process the tool calls
                    const toolResult = await processToolCall(toolCallEvent);

                    // Log result (truncated)
                    console.log(`[${agent.name}] Tool result: ${toolResult.substring(0, 100)}...`);

                    // Re-inject the tool result as part of the conversation
                    // (Done internally by the agent framework for streaming scenarios)
                    break;

                case 'agent_updated':
                    // Handle agent change
                    const agentEvent = event as AgentUpdatedEvent;
                    console.log(`[System] Agent updated to: ${agentEvent.agent.name} (${agentEvent.agent.model})`);
                    break;

                case 'error':
                    // Handle error
                    console.error(`[Error] ${event.error}`);
                    break;

                default:
                    // Handle unknown event type
                    console.warn(`[Unknown Event]`, event);
                    break;
            }
        }

        console.log('[System] Command execution completed');

        // Combine all captured output chunks
        const combinedOutput = allOutput.join('\n');

        // Store result in memory for context in future commands
        addOutput(combinedOutput);

        return combinedOutput;
    } catch (error: any) {
        // Handle any error that occurred during agent execution
        console.error(`Error running agent command: ${error?.message || String(error)}`);

        // Return error message as output
        const errorMessage = `Error executing command: ${error?.message || String(error)}`;

        // Store error result in memory
        addOutput(errorMessage);

        return errorMessage;
    }
}

/**
 * Process a command synchronously
 */
export function processCommand(
    command: string,
    agentType: AgentType = 'supervisor',
    model?: string
): Promise<string> {
    // Log the incoming command
    console.log(`> ${command}`);

    // Run the command
    return runMagiCommand(command, agentType, model);
}

/**
 * Main function - entry point for the application
 */
async function main() {
    // Parse command line arguments
    const args = parseCommandLineArgs();

    // Verify API key is available
    if (!process.env.OPENAI_API_KEY) {
        console.error('**Error** OPENAI_API_KEY environment variable not set');
        process.exit(1);
    }

    // Load previous conversation context from persistent storage
    loadMemory();

    // Handle listing models if requested
    if (args['list-models']) {
        console.log('\nAvailable models:');
        console.log('  - gpt-4o             (OpenAI - standard model)');
        console.log('  - gpt-4o-mini        (OpenAI - smaller model)');
        console.log('  - o3-mini            (OpenAI - reasoning model)');
        console.log('  - gpt-4o-vision      (OpenAI - vision model)');
        process.exit(0);
    }

    // Process prompt (either plain text or base64-encoded)
    let promptText: string;

    if (args.base64) {
        try {
            const buffer = Buffer.from(args.base64, 'base64');
            promptText = buffer.toString('utf-8');
        } catch (error) {
            console.error(`**Error** Failed to decode base64 prompt: ${error}`);
            process.exit(1);
        }
    } else if (args.prompt) {
        promptText = args.prompt;
    } else {
        console.error('**Error** Either --prompt or --base64 must be provided');
        process.exit(1);
    }

    // Run the command
    try {
        await processCommand(
            promptText,
            args.agent as AgentType,
            args.model
        );

        // When running in test mode, exit after completion
        if (args.test) {
            console.log('\nTesting complete. Exiting.');
            process.exit(0);
        }
    } catch (error) {
        console.error(`**Error** Failed to process command: ${error}`);
        process.exit(1);
    }
}

main();
