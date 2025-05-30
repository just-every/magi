/**
 * Tool Calling Example
 * 
 * This example shows how to use tools (function calling) with LLMs.
 */

import { request } from '../index.js';
import type { ResponseInput, ToolFunction } from '../types.js';

// Define a simple calculator tool
const calculatorTool: ToolFunction = {
    function: async (args: any) => {
        const { operation, a, b } = args;
        switch (operation) {
            case 'add': return String(a + b);
            case 'subtract': return String(a - b);
            case 'multiply': return String(a * b);
            case 'divide': return b !== 0 ? String(a / b) : 'Error: Division by zero';
            default: return 'Error: Unknown operation';
        }
    },
    definition: {
        type: 'function',
        function: {
            name: 'calculator',
            description: 'Perform basic arithmetic operations',
            parameters: {
                type: 'object',
                properties: {
                    operation: {
                        type: 'string',
                        enum: ['add', 'subtract', 'multiply', 'divide'],
                        description: 'The arithmetic operation to perform'
                    },
                    a: {
                        type: 'number',
                        description: 'First number'
                    },
                    b: {
                        type: 'number',
                        description: 'Second number'
                    }
                },
                required: ['operation', 'a', 'b']
            }
        }
    }
};

async function main() {
    const messages: ResponseInput = [
        {
            type: 'message',
            role: 'user',
            content: 'What is 15 multiplied by 7?'
        }
    ];

    try {
        const stream = request('gpt-4o', messages, {
            tools: [calculatorTool]
        });

        let toolCalls: any[] = [];
        
        for await (const event of stream) {
            switch (event.type) {
                case 'message_delta':
                    process.stdout.write(event.content);
                    break;
                    
                case 'tool_start':
                    console.log('\n🔧 Tool called:', event.tool_calls[0].function.name);
                    console.log('   Arguments:', event.tool_calls[0].function.arguments);
                    toolCalls = event.tool_calls;
                    break;
                    
                case 'message_complete':
                    console.log('\n✅ Complete response:', event.content);
                    
                    // If there were tool calls, execute them
                    if (toolCalls.length > 0) {
                        console.log('\n📊 Executing tools...');
                        for (const call of toolCalls) {
                            const args = JSON.parse(call.function.arguments);
                            const result = await calculatorTool.function(args);
                            console.log(`   Result: ${result}`);
                        }
                    }
                    break;
                    
                case 'error':
                    console.error('❌ Error:', event.error);
                    break;
            }
        }
    } catch (error) {
        console.error('Failed:', error);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}