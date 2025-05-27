/**
 * Examples of the proposed Ensemble API
 * This demonstrates how the new architecture would work
 */

import { ensemble, ResponseInput, EnsembleStreamEvent } from '../index.js';

// ============================================
// Example 1: Simple Request/Response
// ============================================

async function simpleExample() {
    // Direct request - returns ResponseInput array
    const response = await ensemble.request('claude-3-5-sonnet-20241022', {
        messages: [
            { type: 'message', role: 'user', content: 'What is 2+2?' }
        ]
    });
    
    // Response is already in ResponseInput format, ready to feed to another model
    const followUp = await ensemble.request('gpt-4o', {
        messages: response
    });
}

// ============================================
// Example 2: Streaming with Event Handling
// ============================================

async function streamingExample() {
    const stream = ensemble.stream('claude-3-5-sonnet-20241022', {
        messages: [
            { type: 'message', role: 'user', content: 'Tell me a long story' }
        ]
    });
    
    // Collect events and convert to ResponseInput automatically
    const response = await stream
        .collect() // Collects all events and converts to ResponseInput
        .execute();
    
    // Or handle events manually
    const customStream = ensemble.stream('gpt-4o', {
        messages: response,
        onEvent: (event) => {
            if (event.type === 'message_delta') {
                process.stdout.write(event.content);
            }
        }
    });
    
    await customStream.execute();
}

// ============================================
// Example 3: Model Chaining
// ============================================

async function chainingExample() {
    // Sequential processing with automatic format conversion
    const result = await ensemble.chain()
        .model('claude-3-5-sonnet-20241022')
        .user('Explain quantum computing in simple terms')
        .model('gpt-4o')
        .user((prev) => `Make this explanation even simpler: ${prev}`)
        .model('gemini-2.0-flash-exp')
        .user((prev) => `Now explain it to a 5-year-old: ${prev}`)
        .execute();
    
    // Result contains the full conversation history in ResponseInput format
    console.log('Final response:', result[result.length - 1].content);
}

// ============================================
// Example 4: Parallel Execution
// ============================================

async function parallelExample() {
    const models = ['claude-3-5-sonnet-20241022', 'gpt-4o', 'gemini-2.0-flash-exp'];
    
    // Get responses from multiple models in parallel
    const responses = await ensemble.parallel()
        .models(models)
        .user('What are the three most important inventions in human history?')
        .execute();
    
    // Responses is an array of ResponseInput arrays, one per model
    responses.forEach((response, i) => {
        console.log(`${models[i]} says:`, response[response.length - 1].content);
    });
    
    // Or use a merge strategy
    const consensus = await ensemble.parallel()
        .models(models)
        .user('Is AI dangerous?')
        .merge('consensus') // Built-in merge strategy
        .execute();
}

// ============================================
// Example 5: Tool Integration
// ============================================

async function toolExample() {
    const calculator = {
        name: 'calculator',
        description: 'Performs mathematical calculations',
        parameters: {
            type: 'object',
            properties: {
                expression: { type: 'string', description: 'Math expression to evaluate' }
            },
            required: ['expression']
        },
        execute: async ({ expression }: { expression: string }) => {
            // In real implementation, use a safe math parser
            return String(eval(expression));
        }
    };
    
    const response = await ensemble.request('claude-3-5-sonnet-20241022', {
        messages: [
            { type: 'message', role: 'user', content: 'What is 123 * 456 + 789?' }
        ],
        tools: [calculator],
        toolHandler: async (toolCall) => {
            const tool = [calculator].find(t => t.name === toolCall.name);
            if (tool) {
                const args = JSON.parse(toolCall.arguments);
                return await tool.execute(args);
            }
            return 'Tool not found';
        }
    });
    
    // The response includes both tool calls and results in ResponseInput format
}

// ============================================
// Example 6: Stream Transformations
// ============================================

async function streamTransformExample() {
    // Add metadata to events
    const taggedStream = ensemble.stream('claude-3-5-sonnet-20241022', {
        messages: [{ type: 'message', role: 'user', content: 'Hello' }]
    })
    .map(event => ({
        ...event,
        source: 'claude',
        timestamp: Date.now()
    }));
    
    // Filter specific event types
    const messageOnly = ensemble.stream('gpt-4o', {
        messages: [{ type: 'message', role: 'user', content: 'Hello' }]
    })
    .filter(event => event.type === 'message_complete');
    
    // Merge multiple streams
    const merged = ensemble.merge([
        taggedStream,
        messageOnly
    ])
    .execute();
    
    // Process merged events
    for await (const event of merged) {
        console.log('Event from:', event.source || 'unknown');
    }
}

// ============================================
// Example 7: Conversation Building
// ============================================

async function conversationExample() {
    // Build a multi-turn conversation programmatically
    const conversation = ensemble.conversation()
        .system('You are a helpful teaching assistant')
        .user('What is photosynthesis?')
        .assistant('Photosynthesis is the process by which plants convert light energy into chemical energy...')
        .user('Can you explain it more simply?')
        .build();
    
    // Use the conversation with any model
    const response = await ensemble.request('claude-3-5-sonnet-20241022', {
        messages: conversation
    });
    
    // Or use the fluent API
    const result = await ensemble.conversation()
        .system('You are a creative writing assistant')
        .user('Write a haiku about coding')
        .model('claude-3-5-sonnet-20241022')
        .user('Now make it funny')
        .model('gpt-4o')
        .execute();
}

// ============================================
// Example 8: Error Handling and Retries
// ============================================

async function errorHandlingExample() {
    // Automatic retry with fallback
    const response = await ensemble.request('claude-3-5-sonnet-20241022', {
        messages: [{ type: 'message', role: 'user', content: 'Hello' }],
        retry: {
            attempts: 3,
            fallbackModel: 'gpt-4o'
        }
    });
    
    // Manual error handling in streams
    const stream = ensemble.stream('some-model', {
        messages: [{ type: 'message', role: 'user', content: 'Hello' }],
        onError: (error) => {
            console.error('Stream error:', error);
            // Could switch to another model here
        }
    });
}

// ============================================
// Example 9: Custom Merge Strategies
// ============================================

async function customMergeExample() {
    // Define a custom merge strategy
    const bestOfThree = await ensemble.parallel()
        .models(['claude-3-5-sonnet-20241022', 'gpt-4o', 'gemini-2.0-flash-exp'])
        .user('Write a one-line joke')
        .merge(async (responses) => {
            // Use another model to judge the best response
            const judge = await ensemble.request('claude-3-5-sonnet-20241022', {
                messages: [
                    { type: 'message', role: 'user', content: `Which of these jokes is funniest? 
                    1. ${responses[0][responses[0].length - 1].content}
                    2. ${responses[1][responses[1].length - 1].content}
                    3. ${responses[2][responses[2].length - 1].content}
                    Reply with just the number.` }
                ]
            });
            
            const choice = parseInt(judge[judge.length - 1].content as string) - 1;
            return responses[choice];
        })
        .execute();
}

// ============================================
// Example 10: Integration with Existing Code
// ============================================

async function migrationExample() {
    // Current MAGI pattern
    const messageItems: ResponseInput = [];
    // ... complex event handling ...
    
    // Can be replaced with:
    const response = await ensemble.request('claude-3-5-sonnet-20241022', {
        messages: messageItems,
        // Preserve existing event handlers if needed
        onEvent: (event: EnsembleStreamEvent) => {
            // Existing event handling logic
        }
    });
    
    // The response is already in ResponseInput format
    // No manual conversion needed
}

// Export examples for testing
export {
    simpleExample,
    streamingExample,
    chainingExample,
    parallelExample,
    toolExample,
    streamTransformExample,
    conversationExample,
    errorHandlingExample,
    customMergeExample,
    migrationExample
};