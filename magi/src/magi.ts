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
import {MODEL_GROUPS} from './magi_agents/constants.js';

// Parse command line arguments
function parseCommandLineArgs() {
    const options = {
        test: {type: 'boolean' as const, short: 't', default: false},
        debug: {type: 'boolean' as const, short: 'd', default: false},
        agent: {type: 'string' as const, short: 'a', default: 'supervisor'},
        prompt: {type: 'string' as const, short: 'p'},
        base64: {type: 'string' as const, short: 'b'},
        model: {type: 'string' as const, short: 'm'},
        'model-class': {type: 'string' as const, short: 'c'},
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
                    results.push({
                        tool: null,
                        error: "Invalid tool call structure",
                        input: call
                    });
                    continue;
                }

                // Parse arguments for better logging
                let parsedArgs = {};
                try {
                    if (call.function.arguments && call.function.arguments.trim()) {
                        parsedArgs = JSON.parse(call.function.arguments);
                    }
                } catch (parseError) {
                    console.error(`Error parsing arguments:`, parseError);
                    parsedArgs = { _raw: call.function.arguments };
                }

                // Handle the tool call
                const result = await handleToolCall(call);
                
                // Add structured response with tool name, input and output
                results.push({
                    tool: call.function.name,
                    input: parsedArgs,
                    output: result
                });

                // Log tool call
                const {function: {name}} = call;
                console.log(`[Tool] ${name} executed successfully`);
            } catch (error) {
                console.error(`Error executing tool:`, error);
                
                // Include tool name and input in error response
                let toolName = "unknown";
                let toolInput = {};
                
                if (call && call.function) {
                    toolName = call.function.name || "unknown";
                    try {
                        if (call.function.arguments && call.function.arguments.trim()) {
                            toolInput = JSON.parse(call.function.arguments);
                        }
                    } catch (e) {
                        toolInput = { _raw: call.function.arguments };
                    }
                }
                
                results.push({
                    tool: toolName,
                    input: toolInput,
                    error: String(error)
                });
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
    isTestMode: boolean = false,
    modelClass?: string
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

        // Create the agent with specified type, model, and modelClass
        if (model) {
            console.log(`Forcing model: ${model}`);
        }
        if (modelClass) {
            console.log(`Using model class: ${modelClass}`);
        }

        // Create the agent with model and modelClass parameters
        const agent = createAgent(agentType, model, modelClass);
        comm.send('running', { agent: { name: agent.name, model: agent.model, modelClass: agent.modelClass }, command });

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

                        // Send progress update via WebSocket with agent info
                        comm.send(
                            event.type,
                            { 
                                message,
                                agent: agent.name,
                                model: agent.model
                            }
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

                    // Format detailed tool calls for logging
                    const detailedToolCalls = toolCallEvent.tool_calls.map(call => {
                        let parsedArgs = {};
                        try {
                            if (call.function.arguments && call.function.arguments.trim()) {
                                parsedArgs = JSON.parse(call.function.arguments);
                            }
                        } catch (parseError) {
                            console.error(`Error parsing tool arguments:`, parseError);
                            parsedArgs = { _raw: call.function.arguments };
                        }
                        
                        return {
                            id: call.id,
                            name: call.function.name,
                            arguments: parsedArgs
                        };
                    });

                    // Send detailed tool call progress via WebSocket
                    comm.send(
                        'tool_call',
                        {
                            type: 'tool_call',
                            agent: agent.name,
                            model: agent.model,
                            calls: detailedToolCalls
                        }
                    );

                    // Process the tool calls
                    const toolResult = await processToolCall(toolCallEvent);

                    // Parse tool results for better logging
                    let parsedResults;
                    try {
                        parsedResults = JSON.parse(toolResult);
                    } catch (e) {
                        parsedResults = toolResult;
                    }

                    // Log result (truncated)
                    console.log(`[${agent.name}] Tool result: ${toolResult.substring(0, 100)}...`);

                    // Send detailed tool result via WebSocket
                    comm.send(
                        'tool_result',
                        {
                            type: 'tool_result',
                            agent: agent.name,
                            model: agent.model,
                            results: parsedResults,
                            calls: detailedToolCalls
                        }
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
    isTestMode: boolean = false,
    modelClass?: string
): Promise<void> {
    // Log the incoming command
    console.log(`> ${command}`);

    // Run the command
    return runMagiCommand(command, agentType, model, isTestMode, modelClass);
}

/**
 * Check environment variables for model provider API keys
 */
function checkModelProviderApiKeys(): boolean {
    let hasValidKey = false;
    
    // Check OpenAI API key
    if (process.env.OPENAI_API_KEY) {
        console.log('✓ OpenAI API key found');
        hasValidKey = true;
    } else {
        console.warn('⚠ OPENAI_API_KEY environment variable not set');
    }
    
    // Check Anthropic (Claude) API key
    if (process.env.ANTHROPIC_API_KEY) {
        console.log('✓ Anthropic API key found');
        hasValidKey = true;
    } else {
        console.warn('⚠ ANTHROPIC_API_KEY environment variable not set');
    }
    
    // Check Google API key for Gemini
    if (process.env.GOOGLE_API_KEY) {
        console.log('✓ Google API key found');
        hasValidKey = true;
    } else {
        console.warn('⚠ GOOGLE_API_KEY environment variable not set');
    }
    
    // Check X.AI API key for Grok
    if (process.env.XAI_API_KEY) {
        console.log('✓ X.AI API key found');
        hasValidKey = true;
    } else {
        console.warn('⚠ XAI_API_KEY environment variable not set');
    }
    
    return hasValidKey;
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

    // Verify API keys for model providers
    if (!checkModelProviderApiKeys()) {
        console.error('**Error** No valid API keys found for any model provider');

        // Send error via WebSocket
        comm.send('error', { error: 'No valid API keys found for any model provider' });
        process.exit(1);
    }

    // Handle listing models if requested
    if (args['list-models']) {
        console.log('\nAvailable Model Classes:');
        console.log('=== standard ===');
        for (const model of MODEL_GROUPS.standard) {
            console.log(`  - ${model}`);
        }
        
        console.log('\n=== mini ===');
        for (const model of MODEL_GROUPS.mini) {
            console.log(`  - ${model}`);
        }
        
        console.log('\n=== reasoning ===');
        for (const model of MODEL_GROUPS.reasoning) {
            console.log(`  - ${model}`);
        }
        
        console.log('\n=== vision ===');
        for (const model of MODEL_GROUPS.vision) {
            console.log(`  - ${model}`);
        }
        
        console.log('\n=== search ===');
        for (const model of MODEL_GROUPS.search) {
            console.log(`  - ${model}`);
        }
        
        console.log('\n=== Individual Models by Provider ===');
        console.log('=== OpenAI Models ===');
        console.log('  - gpt-4o             (standard model)');
        console.log('  - gpt-4o-mini        (smaller model)');
        console.log('  - o3-mini            (reasoning model)');
        console.log('  - computer-use-preview (vision model)');
        
        console.log('\n=== Claude Models ===');
        console.log('  - claude-3-7-sonnet-latest (advanced model)');
        console.log('  - claude-3-5-haiku-latest  (faster model)');
        
        console.log('\n=== Gemini Models ===');
        console.log('  - gemini-pro         (standard model)');
        console.log('  - gemini-pro-vision  (vision model)');
        console.log('  - gemini-2.0-pro     (latest model)');
        console.log('  - gemini-2.0-flash   (faster model)');
        
        console.log('\n=== Grok Models ===');
        console.log('  - grok-2             (latest model)');
        console.log('  - grok-1.5-vision    (vision model)');
        
        console.log('\n=== Usage ===');
        console.log('Specify a model class:');
        console.log('  ./test/magi-node.sh -p "your prompt" -c standard');
        console.log('Specify a specific model:');
        console.log('  ./test/magi-node.sh -p "your prompt" -m gpt-4o');
        console.log('Specify both (model takes precedence):');
        console.log('  ./test/magi-node.sh -p "your prompt" -m claude-3-7-sonnet-latest -c reasoning');
        
        console.log('\n=== Agent-Specific Default Models ===');
        console.log('  - MAGI_SUPERVISOR_MODEL  (default: gpt-4o)');
        console.log('  - MAGI_MANAGER_MODEL     (default: gpt-4o)');
        console.log('  - MAGI_REASONING_MODEL   (default: gpt-4o)');
        console.log('  - MAGI_CODE_MODEL        (default: gpt-4o)');
        console.log('  - MAGI_BROWSER_MODEL     (default: gpt-4o)');
        console.log('  - MAGI_VISION_MODEL      (default: gpt-4o)');
        console.log('  - MAGI_SEARCH_MODEL      (default: gpt-4o)');
        console.log('  - MAGI_SHELL_MODEL       (default: gpt-4o)');
        
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
            args.test === true,
            args["model-class"]
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