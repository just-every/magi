/**
 * Basic LLM Request Example
 * 
 * This example demonstrates how to make a simple request to an LLM
 * using the ensemble module.
 */

import { request } from '../index.js';
import type { ResponseInput } from '../types.js';

async function main() {
    // Simple text completion
    const messages: ResponseInput = [
        {
            type: 'message',
            role: 'user',
            content: 'What is the capital of France?'
        }
    ];

    try {
        // Make a request to Claude
        const stream = request('claude-3-5-sonnet-latest', messages);
        
        console.log('Response:');
        for await (const event of stream) {
            if (event.type === 'message_delta') {
                process.stdout.write(event.content);
            } else if (event.type === 'message_complete') {
                console.log('\n\nFull response:', event.content);
            } else if (event.type === 'error') {
                console.error('Error:', event.error);
            }
        }
    } catch (error) {
        console.error('Failed to make request:', error);
    }
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}