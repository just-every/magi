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
import {addHistory, getHistory} from './utils/history.js';
import {initCommunication, CommandMessage} from './utils/communication.js';

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
    model?: string,
    isTestMode: boolean = false
): Promise<void> {
    // Record command in system memory for context
    addHistory({
        role: "user",
        content: command,
    });

    try {
        // Initialize communication system with process ID from env
        const processId = process.env.PROCESS_ID || `magi-${Date.now()}`;
        const comm = initCommunication(processId, isTestMode);
        comm.send('command', {command});

        // Create the agent with specified type and model
        if (model) {
            console.log(`Forcing model: ${model}`);
        }

        // Create the agent with model parameter
        const agent = createAgent(agentType, model);
        comm.send('running', { agent: { name: agent.name, model: agent.model }, command });

        // Run the command with streaming
        const history = getHistory();
        const stream = Runner.runStreamed(agent, command, history);

        // Process streaming events
        for await (const event of stream) {
            // Handle different event types
            switch (event.type) {
                case 'message_delta':
                case 'message_complete':
                    // Add the message content to output
                    const message = event as MessageEvent;
                    if (message.content && message.content.trim()) {

                        if( event.type === 'message_complete') {
                            addHistory({
                                role: "assistant",
                                content: message.content,
                            });
                        }

                        // Send progress update via WebSocket
                        comm.send(
                            event.type,
                            { message }
                        );
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

                    // Send tool call progress via WebSocket
                    comm.send(
                        'tool_call',
                        {toolCallEvent}
                    );

                    // Process the tool calls
                    const toolResult = await processToolCall(toolCallEvent);

                    // Log result (truncated)
                    console.log(`[${agent.name}] Tool result: ${toolResult.substring(0, 100)}...`);

                    // Send tool result via WebSocket
                    comm.send(
                        'tool_result',
                        {toolResult}
                    );

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

        // Send a final result through WebSocket
        comm.send('command_complete', { command });
    } catch (error: any) {
        // Handle any error that occurred during agent execution
        console.error(`Error running agent command: ${error?.message || String(error)}`);

        // Return error message as output
        const errorMessage = `Error executing command: ${error?.message || String(error)}`;

        // Send error through WebSocket
        try {
            const processId = process.env.PROCESS_ID || `magi-${Date.now()}`;
            const comm = initCommunication(processId);
            comm.send('error', { error });
        } catch (commError) {
            console.error('Failed to send error via WebSocket:', commError);
        }
    }
}

/**
 * Process a command synchronously
 */
export function processCommand(
    command: string,
    agentType: AgentType = 'supervisor',
    model?: string,
    isTestMode: boolean = false
): Promise<void> {
    // Log the incoming command
    console.log(`> ${command}`);

    // Run the command
    return runMagiCommand(command, agentType, model, isTestMode);
}

/**
 * Main function - entry point for the application
 */
async function main() {
    // Parse command line arguments
    const args = parseCommandLineArgs();

    // Set up process ID from env var
    const processId = process.env.PROCESS_ID || `magi-${Date.now()}`;
    console.log(`Initializing with process ID: ${processId}`);

    // Set up WebSocket communication (pass test flag from args)
    const comm = initCommunication(processId, args.test);

    // Set up command listener
    comm.onCommand((cmd: CommandMessage) => {
        console.log(`Received command via WebSocket: ${cmd.command}`);
        if (cmd.command === 'stop') {
            console.log('Received stop command, terminating...');
            process.exit(0);
        }
    });

    // Verify API key is available
    if (!process.env.OPENAI_API_KEY) {
        console.error('**Error** OPENAI_API_KEY environment variable not set');

        // Send error via WebSocket
        comm.send('error', { error: 'OPENAI_API_KEY environment variable not set' });
        process.exit(1);
    }

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
            args.model,
            args.test === true
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
