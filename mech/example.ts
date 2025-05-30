/**
 * Example usage of the simple MECH API
 * 
 * This shows how easy it is to use MECH with minimal setup
 */

import { runMECH, runMECHWithMemory, getTotalCost } from './simple.js';

// Example 1: Basic usage - just provide agent name and LLM function
async function basicExample() {
    console.log('=== Basic MECH Example ===');
    
    const result = await runMECH({
        agent: { name: 'BasicAgent' },
        task: 'Write a haiku about TypeScript',
        runAgent: async (_agent, input, _history) => {
            // Simulate an LLM response
            console.log(`Received task: ${input}`);
            return {
                response: 'TypeScript compiles\nType safety guides our journey\nJavaScript evolves',
                tool_calls: []
            };
        }
    });
    
    console.log('Status:', result.status);
    console.log('Result:', result.mechOutcome?.result);
    console.log('Duration:', `${result.durationSec.toFixed(2)}s`);
}

// Example 2: With callbacks for monitoring
async function callbackExample() {
    console.log('\n=== MECH with Callbacks Example ===');
    
    const result = await runMECH({
        agent: { 
            name: 'MonitoredAgent',
            model: 'gpt-4'  // Specify a model
        },
        task: 'Calculate the sum of 1 to 100',
        runAgent: async (_agent, _input, _history) => {
            // Simulate calculation
            const sum = Array.from({length: 100}, (_, i) => i + 1).reduce((a, b) => a + b, 0);
            return {
                response: `The sum of numbers from 1 to 100 is ${sum}`,
                tool_calls: []
            };
        },
        onHistory: (item) => console.log('History added:', item.type),
        onStatus: (status) => console.log('Status:', status.type)
    });
    
    console.log('Status:', result.status);
    console.log('Result:', result.mechOutcome?.result);
}

// Example 3: With memory features (simplified)
async function memoryExample() {
    console.log('\n=== MECH with Memory Example ===');
    
    // Simple in-memory storage for demo
    const memories: any[] = [];
    
    const result = await runMECHWithMemory({
        agent: { name: 'MemoryAgent' },
        task: 'Remember that the capital of France is Paris, then answer: What is the capital of France?',
        runAgent: async (_agent, _input, _history) => {
            // Check if we have relevant memories
            const relevantMemory = memories.find(m => m.text?.includes('France'));
            if (relevantMemory) {
                return {
                    response: `Based on my memory: ${relevantMemory.text}`,
                    tool_calls: []
                };
            }
            // First time - save to memory
            const fact = 'The capital of France is Paris';
            memories.push({ text: fact });
            return {
                response: fact,
                tool_calls: []
            };
        },
        embed: async (_text) => {
            // Fake embedding - just return array of zeros
            return new Array(1536).fill(0);
        },
        lookupMemories: async (_embedding) => {
            // Return any stored memories
            return memories;
        },
        saveMemory: async (_taskId, newMemories) => {
            // Store memories
            memories.push(...newMemories);
            console.log('Saved memories:', newMemories);
        }
    });
    
    console.log('Status:', result.status);
    console.log('Result:', result.mechOutcome?.result);
}

// Example 4: Handling errors
async function errorExample() {
    console.log('\n=== MECH Error Handling Example ===');
    
    const result = await runMECH({
        agent: { name: 'ErrorAgent' },
        task: 'This will cause an error',
        runAgent: async (_agent, _input, _history) => {
            // Simulate an error
            throw new Error('Simulated LLM error');
        }
    });
    
    console.log('Status:', result.status);
    if (result.status === 'fatal_error') {
        console.log('Error:', result.mechOutcome?.error);
    }
}

// Run all examples
async function runExamples() {
    try {
        await basicExample();
        await callbackExample();
        await memoryExample();
        await errorExample();
        
        console.log('\n=== Total Cost ===');
        console.log(`Total cost across all runs: $${getTotalCost().toFixed(4)}`);
    } catch (error) {
        console.error('Error running examples:', error);
    }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
    runExamples();
}