/**
 * Simple MECH Example
 * 
 * This example shows the simplest way to use MECH with minimal setup.
 */

import { runSimpleMECH } from '../simple.js';
import type { RunMechOptions } from '../types.js';

async function main() {
    console.log('🤖 Simple MECH Example\n');
    
    // Define a mock LLM function
    const mockLLM = async (agent: any, input: string) => {
        console.log(`\n📤 LLM Request for ${agent.name}:`);
        console.log(`   Input: "${input}"`);
        
        // Simulate thinking time
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Return a mock response
        const response = `I am ${agent.name}. You asked: "${input}". Here's my thoughtful response about that topic.`;
        console.log(`   Response: "${response}"`);
        
        return { response, tool_calls: [] };
    };
    
    // Configure MECH
    const options: RunMechOptions = {
        agent: {
            name: 'SimpleBot',
            instructions: 'You are a helpful assistant that provides clear, concise answers.'
        },
        task: 'What is the meaning of life?',
        runAgent: mockLLM,
        onHistory: (item) => {
            console.log('\n📝 History:', item.type, item.role || '');
        },
        onStatus: (status) => {
            console.log('\n📊 Status:', status.type);
        }
    };
    
    try {
        console.log('Starting MECH...\n');
        const result = await runSimpleMECH(options);
        
        console.log('\n\n✅ MECH Result:');
        console.log('-'.repeat(50));
        console.log(`Status: ${result.status}`);
        console.log(`Duration: ${result.durationSec}s`);
        console.log(`Total Cost: $${result.totalCost.toFixed(4)}`);
        console.log(`History items: ${result.history.length}`);
        
        if (result.mechOutcome?.result) {
            console.log(`\n📌 Final Result:\n${result.mechOutcome.result}`);
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}