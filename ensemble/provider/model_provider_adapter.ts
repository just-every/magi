// ================================================================
// Model Provider Adapter - Bridges old ModelProvider to new BaseProvider
// ================================================================

import { BaseProvider, ProviderRequestParams } from './base_provider.js';
import { ResponseInputItem, ToolDefinition } from '../types.js';
import { EnsembleStreamEvent } from '../stream/events.js';
import { 
    ModelProvider, 
    ResponseInput, 
    ToolFunction, 
    EnsembleStreamEvent as LegacyEnsembleStreamEvent, 
    ResponseInputItem as LegacyResponseInputItem,
    ResponseInputMessage as LegacyResponseInputMessage,
    ResponseThinkingMessage as LegacyResponseThinkingMessage,
    ResponseOutputMessage as LegacyResponseOutputMessage,
    ResponseInputFunctionCall as LegacyResponseInputFunctionCall,
    ResponseInputFunctionCallOutput as LegacyResponseInputFunctionCallOutput
} from '../types.js';

/**
 * Adapter that wraps old ModelProvider implementations to work with the new BaseProvider interface
 */
export class ModelProviderAdapter implements BaseProvider {
    constructor(private modelProvider: ModelProvider) {}

    async *createStream(
        model: string,
        messages: ResponseInputItem[],
        params: ProviderRequestParams
    ): AsyncIterable<EnsembleStreamEvent> {
        // Convert new ResponseInputItem[] format to old ResponseInput format expected by old providers
        const responseInput: ResponseInput = this.convertToLegacyFormat(messages);
        
        // Create a mock agent object with the necessary properties
        const agent = {
            model,
            modelSettings: params.modelSettings,
            tools: params.tools ? this.convertToolDefinitionsToFunctions(params.tools) : [],
            agent_id: params.agentId,
            // Add other properties that might be expected by providers
            getTools: async () => agent.tools,
        };

        // Use the old provider's createResponseStream method
        const stream = this.modelProvider.createResponseStream(model, responseInput, agent);
        
        // Convert and pass through the events
        for await (const event of stream) {
            yield this.convertLegacyEvent(event);
        }
    }

    /**
     * Convert new ResponseInputItem[] format to old ResponseInput format
     */
    private convertToLegacyFormat(messages: ResponseInputItem[]): ResponseInput {
        return messages.map(msg => {
            switch (msg.type) {
                case 'message':
                    // Convert ensemble message to legacy format
                    if (msg.role === 'assistant') {
                        // Return ResponseOutputMessage for assistant messages
                        return {
                            type: 'message',
                            role: 'assistant',
                            content: msg.content || '',
                            id: msg.id,
                            timestamp: msg.timestamp,
                            status: 'completed'
                        } as LegacyResponseOutputMessage;
                    } else {
                        // Return ResponseInputMessage for user/system messages
                        return {
                            type: 'message',
                            role: msg.role,
                            content: msg.content || '',
                            timestamp: msg.timestamp
                        } as LegacyResponseInputMessage;
                    }
                    
                case 'function_call': {
                    // Convert ToolCallMessage to legacy function_call format
                    const toolCallMsg = msg as unknown as {
                        call_id?: string;
                        name?: string;
                        arguments?: string;
                        status?: string;
                        tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
                    };
                    return {
                        type: 'function_call',
                        call_id: toolCallMsg.call_id || (toolCallMsg.tool_calls && toolCallMsg.tool_calls[0]?.id) || '',
                        name: toolCallMsg.name || (toolCallMsg.tool_calls && toolCallMsg.tool_calls[0]?.function?.name) || '',
                        arguments: toolCallMsg.arguments || (toolCallMsg.tool_calls && toolCallMsg.tool_calls[0]?.function?.arguments) || '{}',
                        id: msg.id,
                        timestamp: msg.timestamp,
                        status: toolCallMsg.status || 'completed'
                    } as LegacyResponseInputFunctionCall;
                }
                    
                case 'function_call_output': {
                    // Convert ToolResultMessage to legacy function_call_output format
                    const toolResultMsg = msg as unknown as {
                        tool_call_id?: string;
                        name?: string;
                        content?: string;
                    };
                    return {
                        type: 'function_call_output',
                        call_id: toolResultMsg.tool_call_id || '',
                        name: toolResultMsg.name,
                        output: toolResultMsg.content || '',
                        id: msg.id,
                        timestamp: msg.timestamp
                    } as LegacyResponseInputFunctionCallOutput;
                }
                    
                case 'thinking': {
                    // Convert ThinkingMessage to legacy thinking format
                    const thinkingMsg = msg as unknown as {
                        content?: string;
                        thinking_id?: string;
                    };
                    return {
                        type: 'thinking',
                        role: 'assistant',
                        content: thinkingMsg.content || '',
                        thinking_id: thinkingMsg.thinking_id,
                        timestamp: msg.timestamp,
                        status: 'completed'
                    } as LegacyResponseThinkingMessage;
                }
                    
                default:
                    // Fallback - pass through as-is
                    return msg as unknown as LegacyResponseInputItem;
            }
        });
    }

    /**
     * Convert new ToolDefinition format to old ToolFunction format
     */
    private convertToolDefinitionsToFunctions(tools: ToolDefinition[]): ToolFunction[] {
        return tools.map(tool => ({
            function: async () => {
                // This is a placeholder - actual execution happens elsewhere
                throw new Error('Tool execution should be handled by the ensemble system');
            },
            definition: {
                ...tool,
                function: {
                    ...tool.function,
                    parameters: {
                        ...tool.function.parameters,
                        required: tool.function.parameters.required || [] // Ensure required is always an array
                    }
                }
            },
            injectAgentId: false,
            injectAbortSignal: false,
        }));
    }

    /**
     * Convert legacy event types to new event types
     */
    private convertLegacyEvent(event: LegacyEnsembleStreamEvent): EnsembleStreamEvent {
        // Most events can pass through directly as they have compatible structure
        // We just need to ensure the timestamp is in the right format
        const timestamp = new Date().toISOString();
        
        // Add timestamp if missing
        const eventWithTimestamp = {
            ...event,
            timestamp: (event as { timestamp?: string }).timestamp || timestamp
        };
        
        // The main difference is in the type system, not the runtime structure
        // Cast to the new type system
        return eventWithTimestamp as unknown as EnsembleStreamEvent;
    }

    // Optional methods can be added if needed
    supportsModel?(model: string): boolean {
        // Could implement logic to check if the wrapped provider supports the model
        console.log(`Checking model support for: ${model}`);
        return true;
    }
}

/**
 * Create an adapter for a model provider
 */
export function adaptModelProvider(provider: ModelProvider): BaseProvider {
    return new ModelProviderAdapter(provider);
}