// ================================================================
// Test Provider - Simple implementation for testing the new architecture
// ================================================================

import { AbstractProvider, ProviderRequestParams } from './base_provider.js';
import { ResponseInputItem } from '../types.js';
import { EnsembleStreamEvent, EventFactory } from '../stream/events.js';
import { generateMessageId } from '../core/ids.js';

/**
 * Test provider for testing the new ensemble architecture
 */
export class TestProvider extends AbstractProvider {
    getSupportedModels(): string[] {
        return ['test-model', 'test-gpt', 'test-claude'];
    }

    supportsModel(model: string): boolean {
        return model.startsWith('test-');
    }

    async* createStream(
        model: string,
        messages: ResponseInputItem[],
        params: ProviderRequestParams
    ): AsyncIterable<EnsembleStreamEvent> {
        const messageId = generateMessageId();
        
        try {
            // Emit message start
            yield EventFactory.messageStart(messageId);
            
            // Get the last user message
            const lastMessage = messages[messages.length - 1];
            let userInput = 'Hello';
            if (lastMessage && lastMessage.type === 'message' && 'content' in lastMessage) {
                userInput = typeof lastMessage.content === 'string' 
                    ? lastMessage.content 
                    : 'Hello';
            }

            // Simple response logic
            if (userInput.toLowerCase().includes('tool') && params.tools?.length) {
                // If user mentions "tool" and we have tools, call the first tool
                const firstTool = params.tools[0];
                const toolCallId = 'test-call-' + Date.now();
                
                // Emit tool call
                yield EventFactory.toolCallComplete({
                    id: toolCallId,
                    type: 'function',
                    function: {
                        name: firstTool.function.name,
                        arguments: JSON.stringify({})
                    }
                });
                
                // Emit completion with tool calls
                yield EventFactory.messageComplete(
                    messageId,
                    `I'm calling the ${firstTool.function.name} tool for you.`,
                    [{
                        id: toolCallId,
                        type: 'function',
                        function: {
                            name: firstTool.function.name,
                            arguments: JSON.stringify({})
                        }
                    }]
                );
            } else {
                // Regular text response
                const responseText = `Echo: ${userInput} (from ${model})`;
                
                // Stream the response in chunks
                for (let i = 0; i < responseText.length; i += 5) {
                    const chunk = responseText.slice(i, i + 5);
                    yield EventFactory.messageDelta(messageId, chunk);
                    
                    // Small delay to simulate streaming
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                
                // Emit completion
                yield EventFactory.messageComplete(messageId, responseText);
            }
            
            // Emit cost update
            yield EventFactory.costUpdate({
                model,
                input_tokens: messages.length * 10,
                output_tokens: 20,
                cost: 0.001
            });
            
        } catch (error: any) {
            yield EventFactory.error(error.message || 'Unknown error', 'test_error');
        } finally {
            // Always emit stream end
            yield EventFactory.streamEnd();
        }
    }
}

// Export singleton instance
export const testProvider = new TestProvider();