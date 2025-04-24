/**
 * OpenAI model provider for the MAGI system.
 *
 * This module provides an implementation of the ModelProvider interface
 * for OpenAI's models and handles streaming responses.
 */

import {
    ModelProvider,
    ToolFunction,
    ModelSettings,
    StreamingEvent,
    ToolCall,
    ResponseInput,
    ResponseInputMessage,
} from '../types/shared-types.js';
import OpenAI from 'openai';
// import {v4 as uuidv4} from 'uuid';
import { costTracker } from '../utils/cost_tracker.js';
import { log_llm_request } from '../utils/file_utils.js';
import { isPaused } from '../utils/communication.js';
import { Agent } from '../utils/agent.js';
import { extractBase64Image } from '../utils/image_utils.js';

// Convert our tool definition to OpenAI's format
function convertToOpenAITools(requestParams: any): any {
    requestParams.tools = requestParams.tools.map((tool: ToolFunction) => {
        if (tool.definition.function.name === 'web_search') {
            requestParams.model = 'gpt-4o'; // Force model for web_search
            return {
                type: 'web_search_preview',
                search_context_size: 'high',
            };
        }

        // Clone parameters to avoid modifying the original
        const paramSchema = JSON.parse(
            JSON.stringify(tool.definition.function.parameters)
        );

        // Recursively:
        // 1. Set additionalProperties: false ONLY for objects with defined properties.
        // 2. Remove internal 'optional' flags.
        const processSchemaRecursively = (schema: any) => {
            if (!schema || typeof schema !== 'object') return;

            // Remove optional flag if present at this level
            if (schema.optional === true) {
                delete schema.optional;
            }

            if (schema.type === 'object') {
                // Only add additionalProperties: false if properties are defined
                if (
                    schema.properties &&
                    schema.additionalProperties === undefined
                ) {
                    schema.additionalProperties = false;
                }
                // Recurse into properties if they exist
                if (schema.properties) {
                    for (const propName in schema.properties) {
                        processSchemaRecursively(schema.properties[propName]);
                    }
                }
                // DO NOT modify schema.required here
            } else if (schema.type === 'array' && schema.items) {
                // Recurse for array items
                processSchemaRecursively(schema.items);
            }
        };

        // Apply the recursive processing
        processSchemaRecursively(paramSchema);

        // Rebuild the top-level required array based on the *original* definition's optional flags
        // This ensures 'commandParams' (optional: true) is correctly excluded.
        const topLevelRequired: string[] = [];
        const originalProperties =
            tool.definition.function.parameters.properties;
        if (originalProperties) {
            for (const propName in originalProperties) {
                // Check the *original* property definition for the optional flag
                if (!originalProperties[propName].optional) {
                    topLevelRequired.push(propName);
                }
            }
        }
        paramSchema.required = topLevelRequired; // Overwrite required list

        return {
            type: 'function',
            name: tool.definition.function.name,
            description: tool.definition.function.description,
            parameters: paramSchema,
            strict: true,
        };
    });
    if (requestParams.model === 'computer-use-preview') {
        requestParams.tools.push({
            type: 'computer_use_preview',
            display_width: 1024,
            display_height: 768,
            environment: 'browser',
        });
        requestParams.truncation = 'auto';
    }
    return requestParams;
}

/**
 * OpenAI model provider implementation
 */
export class OpenAIProvider implements ModelProvider {
    private client: OpenAI;

    constructor(apiKey?: string) {
        this.client = new OpenAI({
            apiKey: apiKey || process.env.OPENAI_API_KEY,
        });

        if (!this.client) {
            throw new Error(
                'Failed to initialize OpenAI client. Make sure OPENAI_API_KEY is set.'
            );
        }
    }

    /**
     * Create a streaming completion using OpenAI's API
     */
    async *createResponseStream(
        model: string,
        messages: ResponseInput,
        agent?: Agent
    ): AsyncGenerator<StreamingEvent> {
        const tools: ToolFunction[] | undefined = agent?.tools;
        const settings: ModelSettings | undefined = agent?.modelSettings;

        try {
            // Use a more compatible approach with reduce to build the array
            const input: ResponseInput = [];

            // Process all messages
            for (const message of messages) {
                // Handle thinking messages
                if (message.type === 'thinking') {
                    // Openai does not support thinking messages
                    // Convert to normal message and add to input
                    input.push({
                        type: 'message',
                        role: 'user', // Use 'user' as it's a valid type
                        content: message.content,
                        status: message.status || 'completed',
                    });
                    continue;
                }

                // Handle function call output messages
                if (message.type === 'function_call_output') {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { name, ...messageWithoutName } = message;

                    if (typeof message.output === 'string') {
                        const extracted = extractBase64Image(message.output);

                        if (extracted.found) {
                            // If the output contains an image, we need to convert it to a file
                            // Add the modified message with placeholder - preserve all original properties
                            input.push({
                                ...messageWithoutName, // Keep all properties including 'name'
                                output: extracted.replaceContent, // Already contains [image ID] placeholders
                            });

                            // Add developer messages for each image
                            for (const [image_id, imageData] of Object.entries(
                                extracted.images
                            )) {
                                input.push({
                                    role: 'user',
                                    content: [
                                        {
                                            type: 'input_text',
                                            text: `Image ${image_id} from function call output of ${message.name}`,
                                        },
                                        {
                                            type: 'input_image',
                                            image_url: imageData,
                                            detail: 'high', // Add required 'detail' property
                                        },
                                    ],
                                });
                            }
                        } else {
                            // Add the original message without modification
                            input.push(messageWithoutName);
                        }
                    } else {
                        // Add the original message without modification
                        input.push(messageWithoutName);
                    }
                    continue;
                }

                // Handle standard message types (user, assistant, etc.)
                // Also handle messages without a type property (treat as 'message' type)
                if (
                    (message.type ?? 'message') === 'message' &&
                    'content' in message
                ) {
                    // Check if the message content contains an image
                    if (typeof message.content === 'string') {
                        const extracted = extractBase64Image(message.content);

                        if (extracted.found) {
                            // Add modified message with placeholder
                            input.push({
                                ...message,
                                type: 'message', // Ensure type property is set
                                content: extracted.replaceContent, // Already contains [image ID] placeholders
                            });

                            // Add developer messages for each image
                            for (const [image_id, imageData] of Object.entries(
                                extracted.images
                            )) {
                                input.push({
                                    role: 'user',
                                    content: [
                                        {
                                            type: 'input_text',
                                            text: `Image ${image_id} from ${message.role} message`,
                                        },
                                        {
                                            type: 'input_image',
                                            image_url: imageData,
                                            detail: 'high', // Add required 'detail' property
                                        },
                                    ],
                                });
                            }
                        } else {
                            // Add the original message (ensure type is set only if it's a valid message)
                            if (
                                message.type === undefined &&
                                'role' in message &&
                                'content' in message
                            ) {
                                // Only add type:'message' to objects that have content and role properties
                                input.push({ ...message, type: 'message' });
                            } else {
                                // Otherwise keep original
                                input.push(message);
                            }
                        }
                    } else {
                        // Add the original message (ensure type is set only if it's a valid message)
                        if (
                            message.type === undefined &&
                            'role' in message &&
                            'content' in message
                        ) {
                            // Only add type:'message' to objects that have content and role properties
                            input.push({ ...message, type: 'message' });
                        } else {
                            // Otherwise keep original
                            input.push(message);
                        }
                    }
                    continue;
                }

                // Default: add the original message
                // Only add type:'message' if it's a valid message with role and content
                if (
                    message.type === undefined &&
                    'role' in message &&
                    'content' in message
                ) {
                    input.push({ ...message, type: 'message' });
                } else {
                    input.push(message);
                }
            }

            // Format the request according to the Responses API specification
            let requestParams: any = {
                model,
                stream: true,
                input,
            };

            // Add model-specific parameters
            // o3 models don't support temperature and top_p
            if (!model.startsWith('o3-')) {
                if (settings?.temperature !== undefined) {
                    requestParams.temperature = settings.temperature;
                }

                if (settings?.top_p !== undefined) {
                    requestParams.top_p = settings.top_p;
                }
            }

            // Add other settings that work across models
            if (settings?.tool_choice) {
                if (
                    typeof settings.tool_choice === 'object' &&
                    settings.tool_choice?.type === 'function' &&
                    settings.tool_choice?.function?.name
                ) {
                    // If it's an object, we assume it's a function call
                    requestParams.tool_choice = {
                        type: settings.tool_choice.type,
                        name: settings.tool_choice.function.name,
                    };
                } else {
                    requestParams.tool_choice = settings.tool_choice;
                }
            }

            // Set JSON response format if a schema is provided
            if (settings?.json_schema) {
                // For OpenAI, we use text.format to specify JSON output (previously response_format)
                requestParams.text = { format: 'json_object' };

                // Modify the system message to include the JSON schema
                // Find the first system or developer message to add schema info
                const systemMessageIndex = input.findIndex(
                    msg =>
                        msg.type === 'message' &&
                        'role' in msg &&
                        (msg.role === 'system' || msg.role === 'developer')
                );

                if (systemMessageIndex !== -1) {
                    const systemMessage = input[systemMessageIndex];
                    // Make sure we're dealing with a message that has content
                    if ('content' in systemMessage) {
                        let content =
                            typeof systemMessage.content === 'string'
                                ? systemMessage.content
                                : JSON.stringify(systemMessage.content);

                        // Add JSON schema instructions at the end of the system message
                        content += `\n\nYour response MUST be a valid JSON object that conforms to this schema:\n${JSON.stringify(settings.json_schema, null, 2)}`;

                        // Update the system message with the new content
                        input[systemMessageIndex] = {
                            ...systemMessage,
                            content: content,
                        };

                        console.log(
                            `[OpenAI] Added JSON schema to system message for model ${model}`
                        );
                    }
                } else {
                    // If no system message exists, create one with the schema
                    const schemaMessage: ResponseInputMessage = {
                        role: 'system',
                        type: 'message',
                        content: `Your response MUST be a valid JSON object that conforms to this schema:\n${JSON.stringify(settings.json_schema, null, 2)}`,
                        status: 'completed',
                    };

                    // Insert at the beginning of the input array
                    input.unshift(schemaMessage);
                    console.log(
                        `[OpenAI] Created new system message with JSON schema for model ${model}`
                    );
                }
            }

            // Add tools if provided
            if (tools && tools.length > 0) {
                // Convert our tools to OpenAI format
                requestParams.tools = tools;
                requestParams = convertToOpenAITools(requestParams);
            }

            // Log the request for debugging
            log_llm_request('openai', model, requestParams);

            const stream = await this.client.responses.create(requestParams);

            // Track delta positions for each message_id
            const messagePositions = new Map<string, number>();

            const toolCallStates = new Map<string, ToolCall>();

            try {
                // @ts-expect-error - OpenAI's stream might be AsyncIterable but TypeScript definitions might need adjustment
                for await (const event of stream) {
                    // Check if the system was paused during the stream
                    if (isPaused()) {
                        console.log(
                            `[OpenAI] System paused during stream for model ${model}. Aborting processing.`
                        );
                        yield {
                            type: 'message_delta', // Or a specific 'stream_aborted' event
                            content: '\n⏸️ Stream paused by user.',
                            message_id: 'pause-notification-stream', // Use a distinct ID
                            order: 999, // Ensure it appears last if needed
                        };
                        break; // Exit the loop to stop processing further chunks
                    }

                    // --- Computer Use Preview Events ---
                    if (
                        event.type === 'response.computer_call.in_progress' &&
                        event.item
                    ) {
                        console.log(
                            `Computer call in progress for item ${event.item_id}`
                        );
                    } else if (
                        event.type === 'response.computer_call.done' &&
                        event.item
                    ) {
                        console.log(
                            `Computer call done for item ${event.item_id}, action:`,
                            event.item.action
                        );

                        // Handle computer call actions by converting to browser actions
                        if (event.item.action && 'type' in event.item.action) {
                            const action = event.item.action;
                            const actionType = action.type;

                            // Define a tool call for browser actions
                            const toolCall: ToolCall = {
                                id:
                                    event.item_id ||
                                    `computer_call_${Date.now()}`,
                                type: 'function',
                                function: {
                                    name: '',
                                    arguments: '{}',
                                },
                            };

                            // Map computer actions to browser tool functions
                            switch (actionType) {
                                case 'click': {
                                    const { x, y, button = 'left' } = action;
                                    toolCall.function.name = 'click_at';
                                    toolCall.function.arguments =
                                        JSON.stringify({ x, y, button });
                                    break;
                                }

                                case 'scroll': {
                                    const { scrollX, scrollY } = action;
                                    toolCall.function.name = 'scroll_to';
                                    toolCall.function.arguments =
                                        JSON.stringify({
                                            x: scrollX,
                                            y: scrollY,
                                        });
                                    break;
                                }

                                case 'keypress': {
                                    const { keys } = action;
                                    toolCall.function.name = 'press_keys';
                                    toolCall.function.arguments =
                                        JSON.stringify({ keys });
                                    break;
                                }

                                case 'type': {
                                    const { text } = action;
                                    toolCall.function.name = 'type';
                                    toolCall.function.arguments =
                                        JSON.stringify({ text });
                                    break;
                                }

                                case 'wait': {
                                    //toolCall.function.name = 'browser_wait';
                                    //toolCall.function.arguments = JSON.stringify({});
                                    break;
                                }

                                case 'screenshot': {
                                    //toolCall.function.name = 'browser_screenshot';
                                    //toolCall.function.arguments = JSON.stringify({});
                                    break;
                                }

                                default:
                                    console.warn(
                                        `Unrecognized computer action type: ${actionType}`
                                    );
                                    continue; // Skip unrecognized actions
                            }

                            // Check for pending safety checks
                            if (
                                event.item.pending_safety_checks &&
                                event.item.pending_safety_checks.length > 0
                            ) {
                                // Handle safety checks by acknowledging them
                                console.log(
                                    `Safety checks for call ${event.item.call_id}:`,
                                    event.item.pending_safety_checks
                                );

                                // Create a new response with acknowledged safety checks
                                const safetyChecks =
                                    event.item.pending_safety_checks.map(
                                        (check: {
                                            id: string;
                                            code: string;
                                            message: string;
                                        }) => ({
                                            id: check.id,
                                            code: check.code,
                                            message: check.message,
                                        })
                                    );

                                // Create and submit a response to acknowledge safety checks
                                try {
                                    await this.client.responses.create({
                                        model: model,
                                        previous_response_id: event.response_id,
                                        tools: [
                                            {
                                                type: 'computer-preview',
                                                display_width: 1024,
                                                display_height: 768,
                                                environment: 'browser',
                                            },
                                        ],
                                        input: [
                                            {
                                                type: 'computer_call_output',
                                                call_id: event.item.call_id,
                                                acknowledged_safety_checks:
                                                    safetyChecks,
                                                output: {
                                                    type: 'computer_screenshot',
                                                    image_url:
                                                        'data:image/png;base64,iVBORw0KGgo=', // Placeholder
                                                },
                                            },
                                        ],
                                        truncation: 'auto',
                                    });
                                    console.log(
                                        `Acknowledged safety checks for call ${event.item.call_id}`
                                    );
                                } catch (safetyError) {
                                    console.error(
                                        'Error acknowledging safety checks:',
                                        safetyError
                                    );
                                }
                            }

                            // Yield the tool call event to be processed
                            yield {
                                type: 'tool_start',
                                tool_calls: [toolCall],
                            };
                        }
                    }

                    // --- Response Lifecycle Events ---
                    if (event.type === 'response.in_progress') {
                        // Optional: Log or update UI to indicate the response is starting/in progress
                        // console.log(`Response ${event.response.id} is in progress...`);
                    } else if (
                        event.type === 'response.completed' &&
                        event.response?.usage
                    ) {
                        // Final usage information
                        costTracker.addUsage({
                            model, // Ensure 'model' variable is accessible here
                            input_tokens:
                                event.response.usage.input_tokens || 0,
                            output_tokens:
                                event.response.usage.output_tokens || 0,
                            cached_tokens:
                                event.response.usage.input_tokens_details
                                    ?.cached_tokens || 0,
                            metadata: {
                                reasoning_tokens:
                                    event.response.usage.output_tokens_details
                                        ?.reasoning_tokens || 0,
                            },
                        });
                        // console.log(`Response ${event.response.id} completed.`);
                    } else if (
                        event.type === 'response.failed' &&
                        event.response?.error
                    ) {
                        // Response failed entirely
                        const errorInfo = event.response.error;
                        console.error(
                            `Response ${event.response.id} failed: [${errorInfo.code}] ${errorInfo.message}`
                        );
                        yield {
                            type: 'error',
                            error: `OpenAI response  failed: [${errorInfo.code}] ${errorInfo.message}`,
                        };
                    } else if (
                        event.type === 'response.incomplete' &&
                        event.response?.incomplete_details
                    ) {
                        // Response finished but is incomplete (e.g., max_tokens hit)
                        const reason = event.response.incomplete_details.reason;
                        console.warn(
                            `Response ${event.response.id} incomplete: ${reason}`
                        );
                        yield {
                            type: 'error', // Or a more general 'response_incomplete'
                            error: 'OpenAI response incomplete: ' + reason,
                        };
                    }

                    // --- Output Item Lifecycle Events ---
                    else if (
                        event.type === 'response.output_item.added' &&
                        event.item
                    ) {
                        // A new item (message, function call, etc.) started
                        // console.log(`Output item added: index ${event.output_index}, id ${event.item.id}, type ${event.item.type}`);
                        if (event.item.type === 'function_call') {
                            // Initialize state for a new function call
                            if (!toolCallStates.has(event.item.id)) {
                                toolCallStates.set(event.item.id, {
                                    id: event.item.id, // Use the ID from the event item
                                    type: 'function',
                                    function: {
                                        name: event.item.name || '', // Ensure 'name' exists on function_call item, provide fallback
                                        arguments: '',
                                    },
                                });
                            } else {
                                console.warn(
                                    `Received output_item.added for already tracked function call ID: ${event.item.id}`
                                );
                            }
                        }
                    } else if (
                        event.type === 'response.output_item.done' &&
                        event.item
                    ) {
                        // An output item finished
                        // console.log(`Output item done: index ${event.output_index}, id ${event.item.id}, type ${event.item.type}`);
                        // If it's a function call, we rely on 'function_call_arguments.done' to yield.
                        // This event could be used for cleanup if needed, but ensure no double-yielding.
                        // We already clean up state in 'function_call_arguments.done'.
                    }

                    // --- Content Part Lifecycle Events ---
                    else if (
                        event.type === 'response.content_part.added' &&
                        event.part
                    ) {
                        // A new part within a message content array started (e.g., text block, image)
                        // console.log(`Content part added: item_id ${event.item_id}, index ${event.content_index}, type ${event.part.type}`);
                        // Don't yield message_complete here, wait for deltas/done event.
                    } else if (
                        event.type === 'response.content_part.done' &&
                        event.part
                    ) {
                        // A content part finished
                        // console.log(`Content part done: item_id ${event.item_id}, index ${event.content_index}, type ${event.part.type}`);
                        // If type is output_text, final text is usually in 'response.output_text.done'.
                    }

                    // --- Text Output Events ---
                    else if (
                        event.type === 'response.output_text.delta' &&
                        event.delta
                    ) {
                        // Streamed text chunk
                        const itemId = event.item_id; // Use item_id from the event
                        if (!messagePositions.has(itemId)) {
                            messagePositions.set(itemId, 0);
                        }
                        const position = messagePositions.get(itemId)!;
                        yield {
                            type: 'message_delta',
                            content: event.delta,
                            message_id: itemId, // Use item_id
                            order: position,
                        };
                        messagePositions.set(itemId, position + 1);
                    } else if (
                        event.type ===
                            'response.output_text.annotation.added' &&
                        event.annotation
                    ) {
                        // An annotation (e.g., file citation) was added to the text
                        console.log('Annotation added:', event.annotation);
                        // You might want to yield a specific annotation event or store them
                        /*yield {
							type: 'annotation_added',
							item_id: event.item_id,
							content_index: event.content_index,
							annotation_index: event.annotation_index,
							annotation: event.annotation
						};*/
                    } else if (
                        event.type === 'response.output_text.done' &&
                        event.text !== undefined
                    ) {
                        // Check text exists
                        // Text block finalized
                        const itemId = event.item_id; // Use item_id from the event
                        yield {
                            type: 'message_complete',
                            content: event.text,
                            message_id: itemId, // Use item_id
                        };
                        // Optional: Clean up position tracking for this message item
                        messagePositions.delete(itemId);
                        // console.log(`Text output done for item ${itemId}.`);
                    }

                    // --- Refusal Events ---
                    else if (
                        event.type === 'response.refusal.delta' &&
                        event.delta
                    ) {
                        // Streamed refusal text chunk
                        console.log(
                            `Refusal delta for item ${event.item_id}: ${event.delta}`
                        );
                        // Decide how to handle/yield refusal text (e.g., separate event type)
                        //yield { type: 'refusal_delta', message_id: event.item_id, content: event.delta };
                    } else if (
                        event.type === 'response.refusal.done' &&
                        event.refusal
                    ) {
                        // Refusal text finalized
                        console.log(
                            `Refusal done for item ${event.item_id}: ${event.refusal}`
                        );
                        yield {
                            type: 'error',
                            error: 'OpenAI refusal error: ' + event.refusal,
                        };
                    }

                    // --- Function Call Events (Based on Docs) ---
                    else if (
                        event.type ===
                            'response.function_call_arguments.delta' &&
                        event.delta
                    ) {
                        // Streamed arguments for a function call
                        const currentCall = toolCallStates.get(event.item_id);
                        if (currentCall) {
                            currentCall.function.arguments += event.delta;
                        } else {
                            // This might happen if output_item.added wasn't received/processed first
                            console.warn(
                                `Received function_call_arguments.delta for unknown item_id: ${event.item_id}`
                            );
                            // Optional: Could attempt to create the state here if needed, but less ideal
                        }
                    } else if (
                        event.type ===
                            'response.function_call_arguments.done' &&
                        event.arguments !== undefined
                    ) {
                        // Check arguments exist
                        // Function call arguments finalized
                        const currentCall = toolCallStates.get(event.item_id);
                        if (currentCall) {
                            currentCall.function.arguments = event.arguments; // Assign final arguments
                            yield {
                                type: 'tool_start',
                                tool_calls: [currentCall as ToolCall], // Yield the completed call
                            };
                            toolCallStates.delete(event.item_id); // Clean up state for this completed call
                            // console.log(`Function call arguments done for item ${event.item_id}. Yielded tool_start.`);
                        } else {
                            console.warn(
                                `Received function_call_arguments.done for unknown or already yielded item_id: ${event.item_id}`
                            );
                        }
                    }

                    // --- File Search Events ---
                    else if (
                        event.type === 'response.file_search_call.in_progress'
                    ) {
                        console.log(
                            `File search in progress for item ${event.item_id}...`
                        );
                        //yield { type: 'file_search_started', item_id: event.item_id };
                    } else if (
                        event.type === 'response.file_search_call.searching'
                    ) {
                        console.log(
                            `File search searching for item ${event.item_id}...`
                        );
                        //yield { type: 'file_search_pending', item_id: event.item_id };
                    } else if (
                        event.type === 'response.file_search_call.completed'
                    ) {
                        console.log(
                            `File search completed for item ${event.item_id}.`
                        );
                        //yield { type: 'file_search_completed', item_id: event.item_id };
                        // Note: Results are typically delivered via annotations in the text output.
                    }

                    // --- Web Search Events ---
                    else if (
                        event.type === 'response.web_search_call.in_progress'
                    ) {
                        console.log(
                            `Web search in progress for item ${event.item_id}...`
                        );
                        //yield { type: 'web_search_started', item_id: event.item_id };
                    } else if (
                        event.type === 'response.web_search_call.searching'
                    ) {
                        console.log(
                            `Web search searching for item ${event.item_id}...`
                        );
                        //yield { type: 'web_search_pending', item_id: event.item_id };
                    } else if (
                        event.type === 'response.web_search_call.completed'
                    ) {
                        console.log(
                            `Web search completed for item ${event.item_id}.`
                        );
                        //yield { type: 'web_search_completed', item_id: event.item_id };
                        // Note: Results might be used internally by the model or delivered via annotations/text.
                    }

                    // --- API Stream Error Event ---
                    else if (event.type === 'error' && event.message) {
                        // An error reported by the API within the stream
                        console.error(
                            `API Stream Error: [${event.code || 'N/A'}] ${event.message}`
                        );
                        yield {
                            type: 'error',
                            error: `OpenAI API error: [${event.code || 'N/A'}] ${event.message}`,
                        };
                    }

                    // --- Catch unexpected event types (shouldn't happen if user confirmation is correct) ---
                    // else {
                    //    console.warn('Received unexpected event type:', event.type, event);
                    // }
                }
            } catch (streamError) {
                // Catch errors during stream iteration/processing
                console.error('Error processing response stream:', streamError);
                yield {
                    type: 'error',
                    error:
                        'OpenAI stream processing error: ' +
                        String(streamError), // Or more detailed error info
                };
            } finally {
                // Clean up: Check if any tool calls were started but not completed
                if (toolCallStates.size > 0) {
                    console.warn(
                        `Stream ended with ${toolCallStates.size} incomplete tool call(s).`
                    );
                    for (const [, toolCall] of toolCallStates.entries()) {
                        // Optionally yield incomplete tool calls if appropriate for your application
                        if (toolCall.function.name) {
                            // Check if it was minimally valid
                            yield {
                                type: 'tool_start', // Or maybe 'tool_incomplete'?
                                tool_calls: [toolCall as ToolCall],
                            };
                        }
                    }
                    toolCallStates.clear(); // Clear the map
                }
                messagePositions.clear(); // Clear positions map
                // console.log("Stream processing finished.");
            }
        } catch (error) {
            console.error('Error in OpenAI streaming response:', error);
            yield {
                type: 'error',
                error:
                    'OpenAI streaming error: ' +
                    (error instanceof Error ? error.stack : String(error)),
            };
        }
    }
}

// Export an instance of the provider
export const openaiProvider = new OpenAIProvider();
