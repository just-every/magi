/**
 * Stream Conversion Example
 * 
 * This example shows how to use the stream converter to build
 * conversation history from streaming events.
 */

import { request, convertStreamToMessages } from '../index.js';
import type { ResponseInput, ConversionOptions } from '../types.js';

async function main() {
    console.log('🔄 Stream Conversion Example\n');
    
    // Initial conversation
    const initialMessages: ResponseInput = [
        {
            type: 'message',
            role: 'user',
            content: 'Can you help me write a simple Python function to calculate fibonacci numbers?'
        }
    ];
    
    // Define a mock tool for demonstration
    const fibonacciTool = {
        function: async (args: any) => {
            const n = args.n;
            if (n <= 1) return String(n);
            let a = 0, b = 1;
            for (let i = 2; i <= n; i++) {
                [a, b] = [b, a + b];
            }
            return String(b);
        },
        definition: {
            type: 'function' as const,
            function: {
                name: 'calculate_fibonacci',
                description: 'Calculate the nth Fibonacci number',
                parameters: {
                    type: 'object',
                    properties: {
                        n: {
                            type: 'integer',
                            description: 'The position in the Fibonacci sequence'
                        }
                    },
                    required: ['n']
                }
            }
        }
    };
    
    try {
        // Create the stream
        const stream = request('gpt-4o', initialMessages, {
            tools: [fibonacciTool]
        });
        
        // Conversion options
        const options: ConversionOptions = {
            model: 'gpt-4o',
            onThinking: async (thinking) => {
                console.log('💭 Thinking:', thinking.content);
            },
            onResponse: async (response) => {
                console.log('💬 Response added to history');
            },
            processToolCall: async (toolCalls) => {
                console.log('🔧 Processing tool calls...');
                const results = [];
                
                for (const call of toolCalls) {
                    const args = JSON.parse(call.function.arguments);
                    const result = await fibonacciTool.function(args);
                    console.log(`   ${call.function.name}(${JSON.stringify(args)}) = ${result}`);
                    results.push(result);
                }
                
                return results;
            }
        };
        
        // Convert stream to messages
        console.log('Converting stream to conversation history...\n');
        const result = await convertStreamToMessages(stream, initialMessages, options);
        
        console.log('\n📚 Final Conversation History:');
        console.log('-'.repeat(50));
        
        for (const msg of result.messages) {
            if (msg.type === 'message') {
                console.log(`\n[${msg.role.toUpperCase()}]:`);
                console.log(msg.content);
            } else if (msg.type === 'function_call') {
                console.log(`\n[TOOL CALL]: ${msg.name}`);
                console.log(`Arguments: ${msg.arguments}`);
            } else if (msg.type === 'function_call_output') {
                console.log(`\n[TOOL RESULT]: ${msg.name}`);
                console.log(`Output: ${msg.output}`);
            }
        }
        
        console.log('\n\n📊 Summary:');
        console.log(`Total messages: ${result.messages.length}`);
        console.log(`Tool calls made: ${result.toolCalls.length}`);
        console.log(`Final response length: ${result.fullResponse.length} characters`);
        
    } catch (error) {
        console.error('Error:', error);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}