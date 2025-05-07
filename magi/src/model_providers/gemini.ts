/**
 * Gemini model provider for the MAGI system.
 *
 * This module provides an implementation of the ModelProvider interface
 * for Google's Gemini models and handles streaming responses using the
 * latest API structure from the @google/genai package.
 *
 * Updated for @google/genai 0.7.0+ to use the new API patterns for:
 * - Streaming response handling
 * - Function calling with the new function declaration format
 * - Content structure with proper modalities
 */

import {
    GoogleGenAI,
    FunctionDeclaration,
    Type,
    Content,
    FunctionCallingConfigMode,
    GenerateContentResponseUsageMetadata,
    GenerateContentResponse,
    Part,
} from '@google/genai';
import { EmbedOpts } from '../model_providers/model_provider.js';
import { v4 as uuidv4 } from 'uuid';
import {
    ModelProvider,
    ToolFunction,
    ModelSettings,
    StreamingEvent,
    ToolCall, // Internal representation
    ResponseInput,
} from '../types/shared-types.js'; // Adjust path as needed
import { costTracker } from '../utils/cost_tracker.js'; // Adjust path as needed
import {
    log_llm_error,
    log_llm_request,
    log_llm_response,
} from '../utils/file_utils.js'; // Adjust path as needed
import { isPaused } from '../utils/communication.js'; // Import pause function
import { Agent } from '../utils/agent.js'; // Adjust path as needed
import {
    extractBase64Image,
    resizeAndTruncateForGemini,
} from '../utils/image_utils.js';

// Convert our tool definition to Gemini's updated FunctionDeclaration format
function convertToGeminiFunctionDeclarations(
    tools: ToolFunction[]
): FunctionDeclaration[] {
    return tools.map(tool => {
        const properties: Record<string, any> = {};
        const toolParams = tool.definition?.function?.parameters?.properties;

        if (toolParams) {
            for (const [name, param] of Object.entries(toolParams)) {
                let type: Type = Type.STRING;

                switch (param.type) {
                    case 'string':
                        type = Type.STRING;
                        break;
                    case 'number':
                        type = Type.NUMBER;
                        break;
                    case 'boolean':
                        type = Type.BOOLEAN;
                        break;
                    case 'object':
                        type = Type.OBJECT;
                        break;
                    case 'array':
                        type = Type.ARRAY;
                        break;
                    case 'null':
                        type = Type.STRING;
                        console.warn(
                            `Mapping 'null' type to STRING for parameter ${name} in tool ${tool.definition.function.name}`
                        );
                        break;
                    default:
                        console.warn(
                            `Unsupported parameter type '${param.type}' for ${name} in tool ${tool.definition.function.name}. Defaulting to STRING.`
                        );
                        type = Type.STRING;
                }

                properties[name] = { type, description: param.description };

                if (type === Type.ARRAY) {
                    const itemType = Type.STRING; // Assuming string items
                    properties[name].items = { type: itemType };
                    if (param.items?.enum) {
                        properties[name].items.enum = param.items.enum;
                    } else if (param.enum) {
                        properties[name].items.enum = param.enum;
                    }
                } else if (param.enum) {
                    properties[name].format = 'enum';
                    properties[name].enum = param.enum;
                }
            }
        } else {
            console.warn(
                `Tool ${tool.definition?.function?.name || 'Unnamed Tool'} has missing or invalid parameters definition.`
            );
        }

        return {
            name: tool.definition.function.name,
            description: tool.definition.function.description,
            parameters: {
                type: Type.OBJECT,
                properties,
                required: Array.isArray(
                    tool.definition?.function?.parameters?.required
                )
                    ? tool.definition.function.parameters.required
                    : [],
            },
        };
    });
}

/**
 * Helper function to determine image MIME type from base64 data
 */
function getImageMimeType(imageData: string): string {
    if (imageData.includes('data:image/jpeg')) return 'image/jpeg';
    if (imageData.includes('data:image/png')) return 'image/png';
    if (imageData.includes('data:image/gif')) return 'image/gif';
    if (imageData.includes('data:image/webp')) return 'image/webp';
    // Default to jpeg if no specific type found
    return 'image/jpeg';
}

/**
 * Helper function to clean base64 data by removing the prefix
 */
function cleanBase64Data(imageData: string): string {
    return imageData.replace(/^data:image\/[a-z]+;base64,/, '');
}

// Convert message history to Gemini's content format
async function convertToGeminiContents(
    messages: ResponseInput
): Promise<Content[]> {
    const contents: Content[] = [];

    for (const msg of messages) {
        if (msg.type === 'function_call') {
            // Function call from assistant to be included as a model message
            let args: Record<string, unknown> = {};
            try {
                const parsedArgs = JSON.parse(msg.arguments || '{}');
                args =
                    typeof parsedArgs === 'object' && parsedArgs !== null
                        ? parsedArgs
                        : { value: parsedArgs };
            } catch (e) {
                console.error(
                    `Failed to parse function call arguments for ${msg.name}:`,
                    msg.arguments,
                    e
                );
                args = {
                    error: 'Invalid JSON arguments provided',
                    raw_args: msg.arguments,
                };
            }

            contents.push({
                role: 'model',
                parts: [
                    {
                        functionCall: {
                            name: msg.name,
                            args,
                        },
                    },
                ],
            });
        } else if (msg.type === 'function_call_output') {
            // Function output should be included as user message with function response
            if (typeof msg.output === 'string') {
                const extracted = extractBase64Image(msg.output);

                if (extracted.found && extracted.image_id !== null) {
                    // Extract image data and remaining text
                    const image_id = extracted.image_id;
                    // Get the image data for the first image and resize/truncate if needed
                    const originalImageData = extracted.images[image_id];
                    const processedImageData =
                        await resizeAndTruncateForGemini(originalImageData);
                    const mimeType = getImageMimeType(processedImageData);
                    const cleanedImageData =
                        cleanBase64Data(processedImageData);

                    const parts: Part[] = [];

                    // Add the function response first
                    parts.push({
                        functionResponse: {
                            name: msg.name,
                            response: {
                                content:
                                    extracted.replaceContent.trim() ||
                                    `[image #${image_id}]`,
                            },
                        },
                    });

                    // Add the image
                    parts.push({
                        inlineData: {
                            mimeType: mimeType,
                            data: cleanedImageData,
                        },
                    });

                    contents.push({
                        role: 'user',
                        parts: parts,
                    });
                } else {
                    // No image, standard function output
                    contents.push({
                        role: 'user',
                        parts: [
                            {
                                functionResponse: {
                                    name: msg.name,
                                    response: { content: msg.output || '' },
                                },
                            },
                        ],
                    });
                }
            } else {
                // Not a string output
                contents.push({
                    role: 'user',
                    parts: [
                        {
                            functionResponse: {
                                name: msg.name,
                                response: { content: msg.output || '' },
                            },
                        },
                    ],
                });
            }
        } else {
            // Regular message
            const role = msg.role === 'assistant' ? 'model' : 'user';
            let textContent = '';

            if (typeof msg.content === 'string') {
                // Check if the content contains a base64 image
                const extracted = extractBase64Image(msg.content);

                if (extracted.found && extracted.image_id !== null) {
                    // Process the image and any surrounding text
                    const image_id = extracted.image_id;
                    const originalImageData = extracted.images[image_id];
                    const processedImageData =
                        await resizeAndTruncateForGemini(originalImageData);
                    const mimeType = getImageMimeType(processedImageData);
                    const cleanedImageData =
                        cleanBase64Data(processedImageData);
                    const parts: Part[] = [];

                    // Add remaining text if any
                    if (extracted.replaceContent.trim()) {
                        parts.push({
                            text: extracted.replaceContent.trim(),
                        });
                    }

                    // Add the image
                    parts.push({
                        inlineData: {
                            mimeType: mimeType,
                            data: cleanedImageData,
                        },
                    });

                    contents.push({
                        role,
                        parts: parts,
                    });
                    continue; // Skip the standard text processing below
                } else {
                    textContent = msg.content;
                }
            } else if (
                msg.content &&
                typeof msg.content === 'object' &&
                'text' in msg.content
            ) {
                textContent = msg.content.text as string;
            }

            if (textContent && textContent.trim() !== '') {
                if (msg.type === 'thinking') {
                    textContent = 'Thinking: ' + textContent;
                }
                contents.push({
                    role,
                    parts: [{ text: textContent.trim() }],
                });
            }
        }
    }

    return contents;
}

/**
 * Gemini model provider implementation
 */
export class GeminiProvider implements ModelProvider {
    private client: GoogleGenAI;

    constructor(apiKey?: string) {
        const key = apiKey || process.env.GOOGLE_API_KEY;
        if (!key) {
            throw new Error(
                'Failed to initialize Gemini client. GOOGLE_API_KEY is missing or not provided.'
            );
        }
        // Create Gemini client with basic configuration
        this.client = new GoogleGenAI({
            apiKey: key,
            vertexai: false,
        });
    }

    /**
     * Creates embeddings for text input using Gemini embedding models
     * @param modelId ID of the embedding model to use (e.g., 'gemini/gemini-embedding-exp-03-07')
     * @param input Text to embed (string or array of strings)
     * @param opts Optional parameters for embedding generation
     * @returns Promise resolving to embedding vector(s)
     */
    async createEmbedding(
        modelId: string,
        input: string | string[],
        opts?: EmbedOpts
    ): Promise<number[] | number[][]> {
        try {
            // Handle 'gemini/' prefix if present
            const actualModelId = modelId.startsWith('gemini/')
                ? modelId.substring(7)
                : modelId;

            console.log(
                `[Gemini] Generating embedding with model ${actualModelId}`
            );

            // Prepare the embedding request payload
            const payload = {
                model: actualModelId,
                contents: input,
                config: {
                    taskType: opts?.taskType ?? 'SEMANTIC_SIMILARITY',
                },
            };

            // Call the Gemini API
            const response = await this.client.models.embedContent(payload);

            // Log the raw response structure for debugging
            console.log(
                '[Gemini] Embedding response structure:',
                JSON.stringify(
                    response,
                    (key, value) =>
                        key === 'values' &&
                        Array.isArray(value) &&
                        value.length > 10
                            ? `[${value.length} items]`
                            : value,
                    2
                )
            );

            // Extract the embedding values correctly
            // Check if response has the embedding field with values
            if (!response.embeddings || !Array.isArray(response.embeddings)) {
                console.error(
                    '[Gemini] Unexpected embedding response structure:',
                    response
                );
                throw new Error(
                    'Invalid embedding response structure from Gemini API'
                );
            }

            // Track usage for cost calculation (Gemini embeddings are currently free)
            // but we still want to track usage for metrics
            const estimatedTokens =
                typeof input === 'string'
                    ? Math.ceil(input.length / 4)
                    : input.reduce(
                          (sum, text) => sum + Math.ceil(text.length / 4),
                          0
                      );

            // Extract the values from the correct path in the response
            let extractedValues: number[] | number[][] = [];
            let dimensions = 0;

            // Handle the Gemini API response format
            if (response.embeddings.length > 0) {
                // Access the correct property path - in Gemini API it should be 'values'
                if (response.embeddings[0].values) {
                    extractedValues = response.embeddings.map(
                        e => e.values as number[]
                    );
                    dimensions = (extractedValues[0] as number[]).length;
                } else {
                    // Try direct embedding access if the expected property isn't found
                    console.warn(
                        '[Gemini] Could not find expected "values" property in embeddings response'
                    );
                    extractedValues =
                        response.embeddings as unknown as number[][];
                    dimensions = Array.isArray(extractedValues[0])
                        ? extractedValues[0].length
                        : 0;
                }
            }

            costTracker.addUsage({
                model: modelId,
                input_tokens: estimatedTokens,
                output_tokens: 0,
                metadata: {
                    dimensions,
                },
            });

            // Extract and return the embeddings, ensuring correct type
            if (Array.isArray(input) && input.length > 1) {
                // Handle the multi-input case - ensure we have an array of arrays
                return extractedValues as number[][];
            } else {
                // Handle the single-input case - ensure we return a single array
                let result: number[];

                if (
                    Array.isArray(extractedValues) &&
                    extractedValues.length >= 1
                ) {
                    const firstValue = extractedValues[0];
                    // Ensure we're returning a number[] and not a single number
                    if (Array.isArray(firstValue)) {
                        result = firstValue;
                    } else {
                        // If somehow we got a single number or non-array, return empty array
                        console.error(
                            '[Gemini] Unexpected format in embedding result:',
                            firstValue
                        );
                        result = [];
                    }
                } else {
                    // Fallback to empty array if no values
                    result = [];
                }

                // Ensure we truncate or pad to exactly 3072 dimensions for our halfvec database schema
                let adjustedResult = result;
                if (result.length !== 3072) {
                    console.warn(
                        `Gemini embedding returned ${result.length} dimensions, adjusting to 3072...`
                    );
                    if (result.length > 3072) {
                        // Truncate if too long
                        adjustedResult = result.slice(0, 3072);
                    } else {
                        // Pad with zeros if too short
                        adjustedResult = [
                            ...result,
                            ...Array(3072 - result.length).fill(0),
                        ];
                    }
                }
                return adjustedResult; // This is guaranteed to be number[] with exactly 3072 dimensions
            }
        } catch (error) {
            console.error('[Gemini] Error generating embedding:', error);
            throw error;
        }
    }

    /**
     * Create a streaming completion using Gemini's API
     */
    /**
     * Helper for retrying a stream if it fails with "Incomplete JSON segment" error
     * @param requestFn Function to create the request
     * @param maxRetries Maximum retry attempts
     */
    private async *retryStreamOnIncompleteJson<T>(
        requestFn: () => Promise<AsyncIterable<T>>,
        maxRetries: number = 2
    ): AsyncGenerator<T> {
        let attempts = 0;

        while (attempts <= maxRetries) {
            try {
                const stream = await requestFn();
                for await (const chunk of stream) {
                    yield chunk;
                }
                return; // Stream completed successfully
            } catch (error) {
                attempts++;
                const errorMsg =
                    error instanceof Error ? error.message : String(error);

                // Only retry for incomplete JSON segment errors
                if (
                    errorMsg.includes('Incomplete JSON segment') &&
                    attempts <= maxRetries
                ) {
                    console.warn(
                        `[Gemini] Incomplete JSON segment error, retrying (${attempts}/${maxRetries})...`
                    );
                    // Add a small delay before retry
                    await new Promise(resolve =>
                        setTimeout(resolve, 1000 * attempts)
                    );
                    continue;
                }

                // For other errors or if we've exhausted retries, rethrow
                throw error;
            }
        }
    }

    async *createResponseStream(
        model: string,
        messages: ResponseInput,
        agent: Agent
    ): AsyncGenerator<StreamingEvent> {
        const tools: ToolFunction[] | undefined = agent?.tools;
        const settings: ModelSettings | undefined = agent?.modelSettings;

        let contentBuffer = '';
        const messageId = uuidv4();
        let eventOrder = 0;
        let hasYieldedToolStart = false;

        let requestId: string | undefined = undefined;
        const chunks: GenerateContentResponse[] = [];
        try {
            // --- Prepare Request ---
            const contents = await convertToGeminiContents(messages);

            // Safety check for empty contents
            if (contents.length === 0) {
                throw new Error(
                    'No valid content found in messages after conversion.'
                );
            }

            // Check if the last message is from the user
            const lastContent = contents[contents.length - 1];
            if (lastContent.role !== 'user') {
                console.warn(
                    "Last message in history is not from 'user'. Gemini might not respond as expected."
                );
            }

            // Prepare generation config
            const config: any = {};
            if (settings?.stop_sequence) {
                config.stopSequences = settings.stop_sequence;
            }
            if (settings?.temperature) {
                config.temperature = settings.temperature;
            }
            if (settings?.max_tokens) {
                config.maxOutputTokens = settings.max_tokens;
            }
            if (settings?.top_p) {
                config.topP = settings.top_p;
            }
            if (settings?.top_k) {
                config.topK = settings.top_k;
            }

            // Add function calling configuration if tools are provided
            if (tools && tools.length > 0) {
                const functionDeclarations =
                    convertToGeminiFunctionDeclarations(tools);
                let allowedFunctionNames: string[] = [];

                if (functionDeclarations.length > 0) {
                    config.tools = [{ functionDeclarations }];

                    if (settings?.tool_choice) {
                        let toolChoice: FunctionCallingConfigMode | undefined;

                        if (
                            typeof settings.tool_choice === 'object' &&
                            settings.tool_choice?.type === 'function' &&
                            settings.tool_choice?.function?.name
                        ) {
                            toolChoice = FunctionCallingConfigMode.ANY;
                            allowedFunctionNames = [
                                settings.tool_choice.function.name,
                            ];
                        } else if (settings.tool_choice === 'required') {
                            toolChoice = FunctionCallingConfigMode.ANY;
                        } else if (settings.tool_choice === 'auto') {
                            toolChoice = FunctionCallingConfigMode.AUTO;
                        } else if (settings.tool_choice === 'none') {
                            toolChoice = FunctionCallingConfigMode.NONE;
                        }

                        if (toolChoice) {
                            config.toolConfig = {
                                functionCallingConfig: {
                                    mode: toolChoice,
                                },
                            };
                            if (allowedFunctionNames.length > 0) {
                                config.toolConfig.functionCallingConfig.allowedFunctionNames =
                                    allowedFunctionNames;
                            }
                        }
                    }
                } else {
                    console.warn(
                        'Tools were provided but resulted in empty declarations after conversion.'
                    );
                }
            }

            const requestParams = {
                model,
                contents,
                config,
            };

            requestId = log_llm_request(
                agent.agent_id,
                'google',
                model,
                requestParams
            );

            // --- Start streaming with retry logic ---
            const getStreamFn = () =>
                this.client.models.generateContentStream(requestParams);
            const response = this.retryStreamOnIncompleteJson(getStreamFn);

            let usageMetadata: GenerateContentResponseUsageMetadata | undefined;

            // --- Process the stream chunks ---
            for await (const chunk of response) {
                chunks.push(chunk);

                // Log raw chunks for debugging if needed
                // console.debug('[Gemini] Raw chunk:', JSON.stringify(chunk));
                // Check if the system was paused during the stream
                if (isPaused()) {
                    console.log(
                        `[Gemini] System paused during stream for model ${model}. Aborting processing.`
                    );
                    yield {
                        type: 'message_delta', // Or a specific 'stream_aborted' event
                        content: '\n⏸️ Stream paused by user.',
                        message_id: messageId, // Use the existing messageId
                        order: 999, // Ensure it appears last if needed
                    };
                    // Note: We might need to update usageMetadata based on partial processing if possible
                    break; // Exit the loop to stop processing further chunks
                }

                // Handle function calls (if present)
                if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                    const toolCallsToEmit: ToolCall[] = [];

                    for (const fc of chunk.functionCalls) {
                        if (fc && fc.name) {
                            const callId = `call_${uuidv4()}`;
                            toolCallsToEmit.push({
                                id: callId,
                                type: 'function',
                                function: {
                                    name: fc.name,
                                    arguments: JSON.stringify(fc.args || {}),
                                },
                            });
                        }
                    }

                    if (toolCallsToEmit.length > 0 && !hasYieldedToolStart) {
                        yield {
                            type: 'tool_start',
                            tool_calls: toolCallsToEmit,
                        };
                        hasYieldedToolStart = true;
                        continue; // Skip other processing when emitting tool calls
                    }
                }

                // Handle text content
                if (chunk.text) {
                    yield {
                        type: 'message_delta',
                        content: chunk.text,
                        message_id: messageId,
                        order: eventOrder++,
                    };
                    contentBuffer += chunk.text;
                }

                // Handle images or other modalities
                if (chunk.candidates?.[0]?.content?.parts) {
                    for (const part of chunk.candidates[0].content.parts) {
                        if (part.inlineData?.data) {
                            yield {
                                type: 'file_complete',
                                data_format: 'base64',
                                data: part.inlineData.data,
                                mime_type:
                                    part.inlineData.mimeType || 'image/png',
                                message_id: uuidv4(),
                                order: eventOrder++,
                            };
                        }
                    }
                }

                if (chunk.usageMetadata) {
                    // Always use the latest usage metadata?
                    usageMetadata = chunk.usageMetadata;
                }
            }

            if (usageMetadata) {
                costTracker.addUsage({
                    model,
                    input_tokens: usageMetadata.promptTokenCount || 0,
                    output_tokens: usageMetadata.candidatesTokenCount || 0,
                    cached_tokens: usageMetadata.cachedContentTokenCount || 0,
                    metadata: {
                        total_tokens: usageMetadata.totalTokenCount || 0,
                        reasoning_tokens: usageMetadata.thoughtsTokenCount || 0,
                        tool_tokens: usageMetadata.toolUsePromptTokenCount || 0,
                    },
                });
            } else {
                console.error(
                    'No usage metadata found in the response. This may affect token tracking.'
                );
                costTracker.addUsage({
                    model,
                    input_tokens: 0, // Not provided in streaming response
                    output_tokens: 0, // Not provided in streaming response
                    cached_tokens: 0,
                    metadata: {
                        total_tokens: 0,
                        source: 'estimated',
                    },
                });
            }

            // --- Stream Finished, Emit Final Events ---
            if (!hasYieldedToolStart && contentBuffer) {
                yield {
                    type: 'message_complete',
                    content: contentBuffer,
                    message_id: messageId,
                };
            }
        } catch (error) {
            console.error('Error during Gemini stream processing:', error);
            const errorMessage =
                error instanceof Error
                    ? error.stack || error.message
                    : String(error);

            // Add special handling for incomplete JSON errors in logs
            if (errorMessage.includes('Incomplete JSON segment')) {
                console.error(
                    '[Gemini] Stream terminated with incomplete JSON. This may indicate network issues or timeouts.'
                );
            }

            yield {
                type: 'error',
                error: `Gemini error ${model}: ${errorMessage}`,
            };
            log_llm_error(requestId, error);

            // Emit any partial content if we haven't yielded a tool call
            if (!hasYieldedToolStart && contentBuffer) {
                yield {
                    type: 'message_complete',
                    content: contentBuffer,
                    message_id: messageId,
                };
            }
        } finally {
            log_llm_response(requestId, chunks);
        }
    }
}

// Export an instance of the provider
export const geminiProvider = new GeminiProvider();
