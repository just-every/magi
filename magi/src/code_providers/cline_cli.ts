/**
 * Cline-inspired provider for the MAGI system.
 * Hopefully Cline will run on the command line in the future, but for now we've attempted to replicate the core functionality here
 *
 * This provider implements the key patterns from Cline's LLM interaction:
 * 1. Direct API calls rather than CLI wrapping
 * 2. Intelligent context window management with middle truncation
 * 3. Robust retry logic with automatic error recovery
 * 4. Streaming optimizations
 */

import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import {
    ModelProvider,
    ToolFunction,
    ModelSettings,
    StreamingEvent,
    ToolCall,
    ResponseInput,
    ResponseInputItem,
} from '../types/shared-types.js';
import { costTracker } from '../utils/cost_tracker.js';
import { log_llm_request } from '../utils/file_utils.js';
import { isPaused, sleep } from '../utils/communication.js';
import { convertHistoryFormat } from '../utils/llm_utils.js';
import { Agent } from '../utils/agent.js';
import { ModelClassID } from '../model_providers/model_data.js';

// ------------------------------------------------------------------------
// CONTEXT MANAGEMENT SYSTEM (Inspired by Cline's ContextManager)
// ------------------------------------------------------------------------

// Set model-specific context limits with safety buffers
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
    // Claude models
    'claude-3-haiku': 120000,
    'claude-3-sonnet': 170000,
    'claude-3-opus': 170000,
    'claude-3-5-sonnet': 170000,
    // Default fallback
    default: 120000,
};

// Safety buffers to stay well under context limits
const CONTEXT_SAFETY_BUFFER = 27000; // ~27K tokens buffer

/**
 * Manages conversation context to prevent context window overflows
 * Inspired by Cline's context management algorithm
 */
class ContextManager {
    /**
     * Estimates token count from text content
     * This is a simplified estimation; Cline likely uses a more accurate tokenizer
     */
    estimateTokenCount(text: string): number {
        if (!text) return 0;
        // Rough estimate: ~4 characters per token for English text
        return Math.ceil(text.length / 4);
    }

    /**
     * Estimates token count for a message
     */
    estimateMessageTokens(message: ResponseInputItem): number {
        if (!message) return 0;

        // Define type guards for different message types
        const isRegularMessage = (
            msg: any
        ): msg is { content: string | any[] } => 'content' in msg;

        const isFunctionCallMessage = (
            msg: any
        ): msg is { type: 'function_call'; name: string; arguments?: string } =>
            'type' in msg && msg.type === 'function_call' && 'name' in msg;

        const isFunctionCallOutputMessage = (
            msg: any
        ): msg is {
            type: 'function_call_output';
            name: string;
            output?: string;
        } =>
            'type' in msg &&
            msg.type === 'function_call_output' &&
            'name' in msg;

        const isThinkingMessage = (
            msg: any
        ): msg is {
            type: 'thinking';
            content: string | any[];
            signature?: string | any[];
        } => 'type' in msg && msg.type === 'thinking';

        // Process message based on its type
        if (isRegularMessage(message)) {
            // Handle regular message content
            if (typeof message.content === 'string') {
                return this.estimateTokenCount(message.content);
            } else if (Array.isArray(message.content)) {
                // Sum up tokens for multimodal content parts
                return message.content.reduce((sum, part) => {
                    if (typeof part === 'object' && 'text' in part) {
                        return (
                            sum + this.estimateTokenCount(part.text as string)
                        );
                    }
                    // Image parts have a small token overhead
                    return sum + 50; // Rough estimate for non-text parts
                }, 0);
            }
        } else if (isFunctionCallMessage(message)) {
            // Tool use message
            return (
                this.estimateTokenCount(message.name) +
                this.estimateTokenCount(message.arguments || '')
            );
        } else if (isFunctionCallOutputMessage(message)) {
            // Tool result message
            return (
                this.estimateTokenCount(message.name) +
                this.estimateTokenCount(message.output || '')
            );
        } else if (isThinkingMessage(message)) {
            // Cast message to explicitly typed thinking message
            const thinkingMsg = message as {
                type: 'thinking';
                content: string | any[];
                signature?: string | any[];
            };

            // Estimate content tokens
            const contentTokens =
                typeof thinkingMsg.content === 'string'
                    ? this.estimateTokenCount(thinkingMsg.content)
                    : Array.isArray(thinkingMsg.content)
                      ? thinkingMsg.content.reduce<number>(
                            (sum: number, part: any) => {
                                if (
                                    typeof part === 'object' &&
                                    'text' in part
                                ) {
                                    return (
                                        sum +
                                        this.estimateTokenCount(
                                            part.text as string
                                        )
                                    );
                                }
                                return sum;
                            },
                            0
                        )
                      : 0;

            // Estimate signature tokens
            const signatureTokens = thinkingMsg.signature
                ? typeof thinkingMsg.signature === 'string'
                    ? this.estimateTokenCount(thinkingMsg.signature)
                    : Array.isArray(thinkingMsg.signature)
                      ? thinkingMsg.signature.reduce<number>(
                            (sum: number, part: any) => {
                                if (
                                    typeof part === 'object' &&
                                    'text' in part
                                ) {
                                    return (
                                        sum +
                                        this.estimateTokenCount(
                                            part.text as string
                                        )
                                    );
                                }
                                return sum;
                            },
                            0
                        )
                      : 0
                : 0;

            return contentTokens + signatureTokens;
        }

        return 0;
    }

    /**
     * Checks if history needs truncation and returns a truncated copy if needed
     * Uses Cline's middle-truncation approach, preserving the initial task and recent context
     *
     * @param history The conversation history
     * @param model The model being used, for context limit determination
     * @param systemPromptTokens Additional tokens to account for system prompt
     * @returns Truncated history or original if truncation wasn't needed
     */
    truncateHistoryIfNeeded(
        history: ResponseInput,
        model: string,
        systemPromptTokens: number = 0
    ): ResponseInput {
        if (!history || history.length === 0) {
            return history;
        }

        // Get model's context limit
        const modelPrefix = Object.keys(MODEL_CONTEXT_LIMITS).find(prefix =>
            model.startsWith(prefix)
        );
        const contextLimit = modelPrefix
            ? MODEL_CONTEXT_LIMITS[modelPrefix]
            : MODEL_CONTEXT_LIMITS['default'];

        // Calculate the effective limit (accounting for safety buffer)
        const effectiveLimit = contextLimit - CONTEXT_SAFETY_BUFFER;

        // Calculate total token count
        let totalTokens = systemPromptTokens;
        for (const message of history) {
            totalTokens += this.estimateMessageTokens(message);
        }

        // If we're under the limit, return original history
        if (totalTokens <= effectiveLimit) {
            return history;
        }

        console.log(
            `[ContextManager] History exceeds context limit (${totalTokens}/${effectiveLimit}). Truncating...`
        );

        // CLINE'S APPROACH: Middle-truncation strategy
        // 1. Always preserve the first message (usually the task description)
        // 2. Preserve the most recent X messages (recent context)
        // 3. Remove messages from the middle based on severity

        // Determine truncation strategy based on how close we are to the limit
        const truncationRatio = totalTokens > contextLimit * 0.9 ? 0.75 : 0.5;

        // Create a new array with preserved messages
        const truncatedHistory: ResponseInput = [];

        // Always preserve the first message (task description)
        // Actual implementation would be more sophisticated with role checks
        truncatedHistory.push(history[0]);

        // Skip a percentage of the middle messages based on truncation ratio
        const messagesToKeep = Math.floor(
            history.length * (1 - truncationRatio)
        );
        const preservedEndCount = Math.max(messagesToKeep - 1, 2); // At least preserve 2 most recent messages

        // Add the most recent messages
        const startIdx = Math.max(1, history.length - preservedEndCount);

        // Optional: Add a system message indicating truncation occurred
        if (startIdx > 1) {
            // Create a message to indicate truncation
            const truncationMessage: ResponseInputItem = {
                type: 'message',
                role: 'system',
                content: `[Context truncated: ${startIdx - 1} messages removed to stay within model's context limit]`,
            };
            truncatedHistory.push(truncationMessage);
        }

        // Add preserved end messages
        for (let i = startIdx; i < history.length; i++) {
            truncatedHistory.push(history[i]);
        }

        // Log truncation details
        const originalTokens = totalTokens;
        let truncatedTokens = systemPromptTokens;
        for (const message of truncatedHistory) {
            truncatedTokens += this.estimateMessageTokens(message);
        }

        console.log(
            `[ContextManager] Truncated ${history.length - truncatedHistory.length} messages.`
        );
        console.log(
            `[ContextManager] Token count reduced: ${originalTokens} → ${truncatedTokens}`
        );

        return truncatedHistory;
    }
}

// ------------------------------------------------------------------------
// API RETRY LOGIC (Inspired by Cline's Task.attemptApiRequest)
// ------------------------------------------------------------------------

/**
 * Configuration for retry behavior
 */
interface RetryConfig {
    maxRetries: number;
    initialDelayMs: number;
    backoffFactor: number;
    maxDelayMs: number;
    retryableStatusCodes: number[];
}

// Default retry configuration
const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    initialDelayMs: 1000,
    backoffFactor: 2,
    maxDelayMs: 10000,
    retryableStatusCodes: [429, 500, 502, 503, 504],
};

// ------------------------------------------------------------------------
// CLAUDE SPECIFIC UTILITIES
// ------------------------------------------------------------------------

// Convert our tool definition to Claude's format
function convertToClaudeTools(tools: ToolFunction[]): any[] {
    return tools.map(tool => ({
        // Directly map the properties to the top level
        name: tool.definition.function.name,
        description: tool.definition.function.description,
        // Map 'parameters' from your definition to 'input_schema' for Claude
        input_schema: tool.definition.function.parameters,
    }));
}

/**
 * Converts a custom ResponseInputItem into Anthropic Claude's message format.
 * Handles text messages, tool use requests (function calls), and tool results (function outputs).
 *
 * @param role The original role associated with the message ('user', 'assistant', 'system').
 * @param content The text content, primarily for non-tool messages.
 * @param msg The detailed message object (ResponseInputItem).
 * @returns A Claude message object or null if conversion is not applicable.
 */
function convertToClaudeMessage(
    role: string,
    content: string,
    msg: ResponseInputItem
): any {
    if (!msg) return null;

    // --- Handle Tool Use (Function Call) ---
    if (msg.type && msg.type === 'function_call') {
        let inputArgs: Record<string, unknown> = {};
        try {
            // Claude expects 'input' as an object
            inputArgs = JSON.parse(msg.arguments || '{}');
        } catch (e) {
            console.error(
                `Error parsing function call arguments for ${msg.name}: ${msg.arguments}`,
                e
            );
            return null;
        }

        const toolUseBlock = {
            type: 'tool_use',
            id: msg.call_id, // Use the consistent ID field
            name: msg.name,
            input: inputArgs,
        };

        return { role: 'assistant', content: [toolUseBlock] };
    } else if (msg.type && msg.type === 'function_call_output') {
        const toolResultBlock = {
            type: 'tool_result',
            tool_use_id: msg.call_id, // ID must match the corresponding tool_use block
            content: msg.output || '', // Default to empty string if output is missing
            ...(msg.status === 'incomplete' ? { is_error: true } : {}),
        };

        // Anthropic expects role: 'user' for tool_result
        return { role: 'user', content: [toolResultBlock] };
    } else if (msg.type && msg.type === 'thinking') {
        // Need to use type assertion since ResponseThinkingMessage isn't recognized correctly
        const thinkingMsg = msg as {
            type: 'thinking';
            content: string | any[];
            signature?: string | any[];
            role: 'assistant';
        };

        if (!content || !thinkingMsg.signature) {
            return null; // Can't process thinking without content and signature
        }

        // Return a thinking message with the content and signature
        return {
            role: 'assistant',
            content: [
                {
                    type: 'thinking',
                    thinking: content.trim(),
                    signature: thinkingMsg.signature,
                },
            ],
        };
    } else {
        // Skip messages with no actual text content
        if (!content) {
            return null; // Skip messages with no text content
        }

        // System messages expect string content
        if (role === 'system' || role === 'developer') {
            // System prompts are handled separately later
            return { role: 'system', content: content.trim() };
        } else {
            const messageRole = role === 'assistant' ? 'assistant' : 'user';
            // User and Assistant messages must use the array format when tools are potentially involved.
            // Use array format consistently for safety.
            return {
                role: messageRole,
                content: [{ type: 'text', text: content.trim() }],
            };
        }
    }
    // Default case for unhandled or irrelevant message types for Claude history
    return null;
}

// ------------------------------------------------------------------------
// MAIN PROVIDER IMPLEMENTATION
// ------------------------------------------------------------------------

/**
 * Cline-inspired direct API provider implementation
 * Combines direct API calls with context management and retry logic
 */
export class ClineCliProvider implements ModelProvider {
    private client: Anthropic;
    private contextManager: ContextManager;
    private retryConfig: RetryConfig;

    constructor(apiKey?: string, retryConfig?: Partial<RetryConfig>) {
        this.client = new Anthropic({
            apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
        });

        if (!this.client) {
            throw new Error(
                'Failed to initialize Claude client. Make sure ANTHROPIC_API_KEY is set.'
            );
        }

        this.contextManager = new ContextManager();
        this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
    }

    /**
     * Create a streaming completion with Cline-inspired patterns:
     * - Context window management
     * - Retry logic
     * - Streaming optimizations
     */
    async *createResponseStream(
        model: string,
        messages: ResponseInput,
        agent: Agent
    ): AsyncGenerator<StreamingEvent> {
        // --- Usage Accumulators ---
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalCacheCreationInputTokens = 0;
        let totalCacheReadInputTokens = 0;
        let streamCompletedSuccessfully = false; // Flag to track successful stream completion
        let messageCompleteYielded = false; // Flag to track if message_complete was yielded
        let retryCount = 0;
        let isContextWindowError = false; // Flag to check for context window errors specifically

        const messageId = uuidv4(); // Generate a unique ID for this message
        let deltaPosition = 0; // For tracking ordered deltas

        try {
            // Get tools asynchronously (getTools now returns a Promise)
            const toolsPromise = agent ? agent.getTools() : Promise.resolve([]);
            const tools = await toolsPromise;
            const settings: ModelSettings | undefined = agent?.modelSettings;
            const modelClass: ModelClassID | undefined = agent?.modelClass;

            // --- CONTEXT WINDOW MANAGEMENT ---
            // Convert messages format for Claude
            let claudeMessages = convertHistoryFormat(
                messages,
                convertToClaudeMessage
            );

            // Extract system prompts and estimate their token count
            const systemPrompt = claudeMessages.reduce((acc, msg): string => {
                if (
                    msg.role === 'system' &&
                    msg.content &&
                    typeof msg.content === 'string'
                ) {
                    return acc + msg.content + '\n'; // Append system prompt content
                }
                return acc;
            }, '');

            const systemPromptTokens =
                this.contextManager.estimateTokenCount(systemPrompt);

            // Make a retry loop that will handle context window errors
            while (true) {
                // Will break on success or max retries
                try {
                    // If this is a retry due to context window error, truncate more aggressively
                    if (isContextWindowError && retryCount > 0) {
                        console.log(
                            '[ClineCliProvider] Context window error detected. Attempting more aggressive truncation.'
                        );

                        // Truncate conversation history (more aggressively on retries)
                        const truncatedMessages =
                            this.contextManager.truncateHistoryIfNeeded(
                                messages,
                                model,
                                systemPromptTokens
                            );

                        // Re-convert truncated messages for Claude
                        claudeMessages = convertHistoryFormat(
                            truncatedMessages,
                            convertToClaudeMessage
                        );
                    }

                    let thinking = undefined;
                    let max_tokens = settings?.max_tokens || 64000; // Default max tokens if not specified
                    switch (modelClass) {
                        case 'monologue':
                        case 'reasoning':
                        case 'code':
                            if (model === 'claude-3-7-sonnet-latest') {
                                // Extended thinking
                                thinking = {
                                    type: 'enabled',
                                    budget_tokens: 16000,
                                };
                                max_tokens = Math.min(max_tokens, 64000);
                            } else {
                                max_tokens = Math.min(max_tokens, 8192);
                            }
                            break;
                        case 'standard':
                            max_tokens = Math.min(max_tokens, 8192);
                            break;
                        default:
                            max_tokens = Math.min(max_tokens, 4096); // Lower limit for other classes
                    }

                    // Format the request according to Claude API specifications
                    const requestParams: any = {
                        model: model,
                        // Filter for only user and assistant messages for the 'messages' array
                        messages: claudeMessages.filter(
                            m => m.role === 'user' || m.role === 'assistant'
                        ),
                        // Add system prompt string if it exists
                        ...(systemPrompt ? { system: systemPrompt } : {}),
                        stream: true,
                        max_tokens,
                        ...(thinking ? { thinking } : {}),
                        ...(settings?.temperature !== undefined
                            ? { temperature: settings.temperature }
                            : {}),
                    };

                    // Add tools if provided, using the corrected conversion function
                    if (tools && tools.length > 0) {
                        requestParams.tools = convertToClaudeTools(tools); // Uses the corrected function
                    }

                    // Log the request before sending
                    log_llm_request(
                        agent.agent_id,
                        'anthropic',
                        model,
                        requestParams
                    );

                    // Track current tool call info
                    let currentToolCall: any = null;
                    let accumulatedSignature = '';
                    let accumulatedThinking = '';
                    let accumulatedContent = ''; // To collect all content for final message_complete

                    // Check if system is paused and wait if necessary
                    if (isPaused()) {
                        console.log(
                            `[ClineCliProvider] System is paused. Waiting before making API call for model ${model}...`
                        );
                        yield {
                            type: 'message_delta',
                            content:
                                '⏸️ System is paused. LLM request waiting...',
                            message_id: messageId,
                            order: deltaPosition++,
                        };

                        // Wait in a loop until system is no longer paused
                        while (isPaused()) {
                            await sleep(1000); // Check every second
                        }

                        console.log(
                            `[ClineCliProvider] System resumed. Proceeding with API call for model ${model}`
                        );
                        yield {
                            type: 'message_delta',
                            content: '▶️ System resumed. Processing request...',
                            message_id: messageId,
                            order: deltaPosition++,
                        };
                    }

                    // START OF RETRY LOOP CONTENT
                    // Make the API call
                    const stream =
                        await this.client.messages.create(requestParams);

                    try {
                        // @ts-expect-error - Claude's stream is AsyncIterable but TypeScript might not recognize it properly
                        for await (const event of stream) {
                            // --- Accumulate Usage ---
                            // Check message_start for initial usage (often includes input tokens)
                            if (
                                event.type === 'message_start' &&
                                event.message?.usage
                            ) {
                                const usage = event.message.usage;
                                totalInputTokens += usage.input_tokens || 0;
                                totalOutputTokens += usage.output_tokens || 0; // Sometimes initial output tokens are here
                                totalCacheCreationInputTokens +=
                                    usage.cache_creation_input_tokens || 0;
                                totalCacheReadInputTokens +=
                                    usage.cache_read_input_tokens || 0;
                            }
                            // Check message_delta for incremental usage (often includes output tokens)
                            else if (
                                event.type === 'message_delta' &&
                                event.usage
                            ) {
                                const usage = event.usage;
                                // Input tokens shouldn't change mid-stream, but check just in case
                                totalInputTokens += usage.input_tokens || 0;
                                totalOutputTokens += usage.output_tokens || 0;
                                totalCacheCreationInputTokens +=
                                    usage.cache_creation_input_tokens || 0;
                                totalCacheReadInputTokens +=
                                    usage.cache_read_input_tokens || 0;
                            }

                            // --- Handle Content and Tool Events ---
                            // Handle content block delta
                            if (event.type === 'content_block_delta') {
                                // Emit delta event for streaming UI updates with incrementing order
                                if (
                                    event.delta.type === 'signature_delta' &&
                                    event.delta.signature
                                ) {
                                    accumulatedSignature +=
                                        event.delta.signature;
                                } else if (
                                    event.delta.type === 'thinking_delta' &&
                                    event.delta.thinking
                                ) {
                                    yield {
                                        type: 'message_delta',
                                        content: '',
                                        thinking_content: event.delta.thinking,
                                        message_id: messageId,
                                        order: deltaPosition++,
                                    };
                                    accumulatedThinking += event.delta.thinking;
                                } else if (
                                    event.delta.type === 'text_delta' &&
                                    event.delta.text
                                ) {
                                    yield {
                                        type: 'message_delta',
                                        content: event.delta.text,
                                        message_id: messageId,
                                        order: deltaPosition++,
                                    };
                                    accumulatedContent += event.delta.text;
                                } else if (
                                    event.delta.type === 'input_json_delta' &&
                                    currentToolCall &&
                                    event.delta.partial_json
                                ) {
                                    try {
                                        // Append the partial JSON string to the arguments
                                        if (
                                            !currentToolCall.function
                                                ._partialArguments
                                        ) {
                                            currentToolCall.function._partialArguments =
                                                '';
                                        }
                                        currentToolCall.function._partialArguments +=
                                            event.delta.partial_json;

                                        // Update the main arguments field for intermediate UI updates (best effort)
                                        currentToolCall.function.arguments =
                                            currentToolCall.function._partialArguments;

                                        // Yielding tool_start repeatedly might be noisy; consider yielding tool_delta if needed
                                        yield {
                                            type: 'tool_delta',
                                            tool_calls: [
                                                currentToolCall as ToolCall,
                                            ],
                                        };
                                    } catch (err) {
                                        console.error(
                                            'Error processing tool_use delta (input_json_delta):',
                                            err,
                                            event
                                        );
                                    }
                                }
                            }
                            // Handle content block start for text
                            else if (
                                event.type === 'content_block_start' &&
                                event.content_block?.type === 'text'
                            ) {
                                if (event.content_block.text) {
                                    yield {
                                        type: 'message_delta',
                                        content: event.content_block.text,
                                        message_id: messageId,
                                        order: deltaPosition++,
                                    };
                                    accumulatedContent +=
                                        event.content_block.text;
                                }
                            }
                            // Handle tool use start
                            else if (
                                event.type === 'content_block_start' &&
                                event.content_block?.type === 'tool_use'
                            ) {
                                const toolUse = event.content_block;
                                const toolId =
                                    toolUse.id || `call_${Date.now()}`;
                                const toolName = toolUse.name;
                                const toolInput =
                                    toolUse.input !== undefined
                                        ? toolUse.input
                                        : {};
                                currentToolCall = {
                                    id: toolId,
                                    type: 'function',
                                    function: {
                                        name: toolName,
                                        arguments:
                                            typeof toolInput === 'string'
                                                ? toolInput
                                                : JSON.stringify(toolInput),
                                    },
                                };
                            }
                            // Handle tool use stop
                            else if (
                                event.type === 'content_block_stop' &&
                                event.content_block?.type === 'tool_use' &&
                                currentToolCall
                            ) {
                                try {
                                    // Finalize arguments if they were streamed partially
                                    if (
                                        currentToolCall.function
                                            ._partialArguments
                                    ) {
                                        currentToolCall.function.arguments =
                                            currentToolCall.function._partialArguments;
                                        delete currentToolCall.function
                                            ._partialArguments; // Clean up temporary field
                                    }
                                    yield {
                                        type: 'tool_start',
                                        tool_calls: [
                                            currentToolCall as ToolCall,
                                        ],
                                    };
                                } catch (err) {
                                    console.error(
                                        'Error finalizing tool call:',
                                        err,
                                        event
                                    );
                                } finally {
                                    // Reset currentToolCall *after* potential final processing
                                    currentToolCall = null;
                                }
                            }
                            // Handle message stop
                            else if (event.type === 'message_stop') {
                                // Check for any final usage info (less common here, but possible)
                                if (event.usage) {
                                    // Check standard usage object as a fallback
                                    const usage = event.usage;
                                    totalInputTokens += usage.input_tokens || 0;
                                    totalOutputTokens +=
                                        usage.output_tokens || 0;
                                    totalCacheCreationInputTokens +=
                                        usage.cache_creation_input_tokens || 0;
                                    totalCacheReadInputTokens +=
                                        usage.cache_read_input_tokens || 0;
                                }

                                // Complete any pending tool call (should ideally be handled by content_block_stop)
                                if (currentToolCall) {
                                    // If a tool call is still active here, it means content_block_stop might not have fired correctly.
                                    console.warn(
                                        'Tool call was still active at message_stop:',
                                        currentToolCall
                                    );

                                    // Emit tool_start immediately when the block starts
                                    yield {
                                        type: 'tool_start',
                                        tool_calls: [
                                            currentToolCall as ToolCall,
                                        ],
                                    };
                                    currentToolCall = null; // Reset anyway
                                }

                                // Emit message_complete if there's content
                                if (accumulatedContent || accumulatedThinking) {
                                    yield {
                                        type: 'message_complete',
                                        message_id: messageId,
                                        content: accumulatedContent,
                                        thinking_content: accumulatedThinking,
                                        thinking_signature:
                                            accumulatedSignature,
                                    };
                                    messageCompleteYielded = true; // Mark that it was yielded here
                                }
                                streamCompletedSuccessfully = true; // Mark stream as complete
                            }
                            // Handle error event
                            else if (event.type === 'error') {
                                console.error(
                                    'Claude API error event:',
                                    event.error
                                );

                                // Check for context window errors
                                const errorString = event.error
                                    ? event.error.message ||
                                      JSON.stringify(event.error)
                                    : 'Unknown error';
                                if (
                                    errorString
                                        .toLowerCase()
                                        .includes('context window') ||
                                    errorString
                                        .toLowerCase()
                                        .includes('token limit') ||
                                    errorString
                                        .toLowerCase()
                                        .includes('max tokens') ||
                                    errorString
                                        .toLowerCase()
                                        .includes('context length')
                                ) {
                                    // This is a context window error - we'll set the flag and retry with more truncation
                                    isContextWindowError = true;
                                    throw new Error(
                                        `Context window error: ${errorString}`
                                    ); // This will be caught by the retry loop
                                } else {
                                    // Some other API error, yield it and break the stream
                                    yield {
                                        type: 'error',
                                        error:
                                            'Claude API error: ' + errorString,
                                    };
                                    // Don't mark as successful on other API errors
                                    streamCompletedSuccessfully = false;
                                    break; // Stop processing on error
                                }
                            }
                        } // End for await loop

                        // Ensure a message_complete is emitted if somehow message_stop didn't fire
                        // but we have content and no error occurred.
                        if (
                            streamCompletedSuccessfully &&
                            (accumulatedContent || accumulatedThinking) &&
                            !messageCompleteYielded
                        ) {
                            console.warn(
                                'Stream finished successfully but message_stop might not have triggered message_complete emission. Emitting now.'
                            );
                            yield {
                                type: 'message_complete',
                                message_id: messageId,
                                content: accumulatedContent,
                                thinking_content: accumulatedThinking,
                                thinking_signature: accumulatedSignature,
                            };
                            messageCompleteYielded = true; // Mark as yielded here too
                        }

                        // If we get here, the stream completed without errors, so break retry loop
                        break;
                    } catch (streamError) {
                        // --- CLINE-INSPIRED RETRY LOGIC ---
                        // Check if this is an error we should retry
                        const errorStr = String(streamError);

                        // Check for context window errors
                        if (
                            errorStr.toLowerCase().includes('context window') ||
                            errorStr.toLowerCase().includes('token limit') ||
                            errorStr.toLowerCase().includes('max tokens') ||
                            errorStr.toLowerCase().includes('context length')
                        ) {
                            isContextWindowError = true;
                            console.error(
                                `Context window error detected: ${errorStr}`
                            );

                            // If we've already retried too many times, give up
                            if (retryCount >= this.retryConfig.maxRetries) {
                                console.error(
                                    `[ClineCliProvider] Max retries (${this.retryConfig.maxRetries}) exceeded for context window error.`
                                );
                                yield {
                                    type: 'error',
                                    error: `Failed after ${retryCount} retries: ${errorStr}`,
                                };
                                break;
                            }

                            // Otherwise, increment retry count and loop again with more truncation
                            retryCount++;

                            // Notify the user about the retry
                            yield {
                                type: 'message_delta',
                                content: `\n[Context window limit exceeded. Retrying with reduced context (attempt ${retryCount}/${this.retryConfig.maxRetries})...]\n`,
                                message_id: messageId,
                                order: deltaPosition++,
                            };

                            // Use exponential backoff for retries
                            const delay = Math.min(
                                this.retryConfig.initialDelayMs *
                                    Math.pow(
                                        this.retryConfig.backoffFactor,
                                        retryCount - 1
                                    ),
                                this.retryConfig.maxDelayMs
                            );

                            console.log(
                                `[ClineCliProvider] Waiting ${delay}ms before retry ${retryCount}...`
                            );
                            await sleep(delay);
                            // Continue loop
                            continue;
                        } else {
                            // This is some other error - yield error and break
                            console.error(
                                `[ClineCliProvider] Error processing Claude stream: ${errorStr}`
                            );
                            yield {
                                type: 'error',
                                error:
                                    'Claude processing stream error: ' +
                                    errorStr,
                            };
                            streamCompletedSuccessfully = false; // Mark as failed
                            break;
                        }
                    }
                } catch (setupError) {
                    console.error(
                        'Error in Claude streaming completion setup:',
                        setupError
                    );
                    yield {
                        type: 'error',
                        error:
                            'Claude streaming setup error: ' +
                            (setupError instanceof Error
                                ? setupError.stack
                                : String(setupError)),
                    };
                    streamCompletedSuccessfully = false; // Mark as failed
                    break; // Exit retry loop on setup errors
                }
            } // End while (true) retry loop
        } catch (error) {
            console.error(
                'Error in ClineDirectApi streaming execution:',
                error
            );
            yield {
                type: 'error',
                error:
                    'ClineDirectApi streaming error: ' +
                    (error instanceof Error ? error.message : String(error)),
            };
            streamCompletedSuccessfully = false; // Mark as failed
        } finally {
            // --- Track Cost ---
            // Only track cost if the stream completed (or partially completed with some usage)
            // and we have accumulated some token counts.
            if (
                totalInputTokens > 0 ||
                totalOutputTokens > 0 ||
                totalCacheReadInputTokens > 0 ||
                totalCacheCreationInputTokens > 0
            ) {
                // Combine cache tokens as per the user's desired structure
                const cachedTokens =
                    totalCacheCreationInputTokens + totalCacheReadInputTokens;

                costTracker.addUsage({
                    model,
                    input_tokens: totalInputTokens,
                    output_tokens: totalOutputTokens,
                    // Map accumulated Claude cache tokens to the 'cached_tokens' field
                    cached_tokens: cachedTokens,
                    metadata: {
                        // Add specific cache breakdown if needed
                        cache_creation_input_tokens:
                            totalCacheCreationInputTokens,
                        cache_read_input_tokens: totalCacheReadInputTokens,
                        // Add other potential metadata if available/needed
                        total_tokens: totalInputTokens + totalOutputTokens, // Calculate total
                    },
                });
            } else if (streamCompletedSuccessfully) {
                // Log if stream completed but no tokens were recorded (might indicate an issue)
                console.warn(
                    `ClineDirectApi stream for model ${model} completed successfully but no token usage was recorded.`
                );
            }
        }
    }
}

// Export an instance of the provider
export const clineCliProvider = new ClineCliProvider();
