// ================================================================
// Basic Usage Example - Demonstrates the new ensemble API
// ================================================================

// Import specific modules to avoid loading all providers
import { Conversation } from '../core/conversation.js';
import { createConversation, createToolFunction, createSimpleToolRegistry } from '../index.js';
import { request, simpleRequest, streamRequest } from '../orchestration/request_pipeline.js';
import { registerProvider } from '../provider/base_provider.js';
import { testProvider } from '../provider/test_provider.js';

// Initialize just the test provider
registerProvider('test-', testProvider);

async function main() {
    console.log('=== Ensemble Basic Usage Example ===\n');

    // Define a simple tool
    const weatherTool = createToolFunction(
        'get_weather',
        'Get weather information for a location',
        {
            type: 'object',
            properties: {
                location: {
                    type: 'string',
                    description: 'The city and state, e.g. San Francisco, CA'
                }
            },
            required: ['location']
        },
        async (args: { location: string }) => {
            console.log(`🌤️  Getting weather for ${args.location}...`);
            if (args.location.toLowerCase().includes('tokyo')) {
                return { temperature: '15°C', condition: 'Cloudy', humidity: '65%' };
            }
            return { temperature: '22°C', condition: 'Sunny', humidity: '45%' };
        }
    );

    // Create tool registry
    const toolRegistry = createSimpleToolRegistry([weatherTool]);

    // Create a conversation
    const conversation = createConversation();
    conversation.addUserMessage("Hi! Can you check the weather in Tokyo for me using a tool?");

    console.log('Initial conversation:');
    console.log(conversation.getSummary());
    console.log('\n--- Starting LLM interaction ---\n');

    try {
        // Make request with tool support
        const handle = await request(
            'test-model',
            conversation,
            {
                tools: toolRegistry,
                agentId: 'example-agent',
                onEvent: (event) => {
                    // Log streaming events
                    if (event.type === 'message_delta') {
                        process.stdout.write(event.delta);
                    } else if (event.type === 'message_complete') {
                        console.log(); // New line after message
                    } else if (event.type === 'tool_call_complete') {
                        console.log(`🔧 Tool called: ${event.toolCall.function.name}`);
                    } else if (event.type === 'stream_end') {
                        console.log('✅ Stream ended');
                    }
                }
            }
        );

        console.log('\n--- Final Conversation State ---');
        console.log(handle.conversation.getSummary());
        
        if (handle.lastAssistantText) {
            console.log('\n📝 Assistant\'s final response:', handle.lastAssistantText);
        }
        
        if (handle.rawToolCallsThisTurn && handle.rawToolCallsThisTurn.length > 0) {
            console.log('\n🔧 Tools called this turn:', handle.rawToolCallsThisTurn.length);
        }
        
        if (handle.toolResultsThisTurn && handle.toolResultsThisTurn.length > 0) {
            console.log('📊 Tool results:', handle.toolResultsThisTurn);
        }
        
        console.log(`⏱️  Execution time: ${handle.executionTimeMs}ms`);
        
        if (handle.errors && handle.errors.length > 0) {
            console.log('⚠️  Errors:', handle.errors);
        }

        // Example of follow-up conversation
        console.log('\n--- Follow-up conversation ---');
        handle.conversation.addUserMessage("Thanks! How about the weather in San Francisco?");
        
        const handle2 = await request(
            'test-model',
            handle.conversation,
            {
                tools: toolRegistry,
                agentId: 'example-agent',
                onEvent: (event) => {
                    if (event.type === 'message_delta') {
                        process.stdout.write(event.delta);
                    } else if (event.type === 'message_complete') {
                        console.log();
                    }
                }
            }
        );
        
        console.log('\n📝 Final conversation length:', handle2.conversation.length, 'messages');

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

// Example of simple request without tools
async function simpleExample() {
    console.log('\n=== Simple Request Example (No Tools) ===\n');
    
    const conversation = createConversation();
    conversation.addUserMessage("Hello, how are you?");
    
    const handle = await simpleRequest(
        'test-model',
        conversation,
        {
            agentId: 'simple-agent',
            onEvent: (event) => {
                if (event.type === 'message_delta') {
                    process.stdout.write(event.delta);
                }
            }
        }
    );
    
    console.log('\n📝 Response:', handle.lastAssistantText);
}

// Example of streaming without waiting for completion
async function streamingExample() {
    console.log('\n=== Streaming Example ===\n');
    
    const conversation = createConversation();
    conversation.addUserMessage("Count to 10");
    
    console.log('Streaming response:');
    for await (const event of streamRequest('test-model', conversation, {
        agentId: 'stream-agent',
        onEvent: () => {} // Required but we're handling events in the loop
    })) {
        if (event.type === 'message_delta') {
            process.stdout.write(event.delta);
        } else if (event.type === 'stream_end') {
            console.log('\n✅ Streaming complete');
            break;
        }
    }
}

// Run all examples
if (import.meta.url === `file://${process.argv[1]}`) {
    main()
        .then(() => simpleExample())
        .then(() => streamingExample())
        .then(() => {
            console.log('\n🎉 All examples completed successfully!');
        })
        .catch(error => {
            console.error('❌ Example failed:', error);
            process.exit(1);
        });
}