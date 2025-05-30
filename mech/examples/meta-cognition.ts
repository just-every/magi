/**
 * Meta-cognition Example
 * 
 * This example demonstrates MECH's meta-cognition capabilities,
 * including model rotation and self-reflection.
 */

import { runMECHAdvanced } from '../index.js';
import { mechState, set_meta_frequency, getModelScore } from '../mech_state.js';
import type { MechAgent, MechContext } from '../types.js';

async function main() {
    console.log('🧠 Meta-cognition Example\n');
    
    // Track LLM calls
    let llmCallCount = 0;
    const modelUsage = new Map<string, number>();
    
    // Create a mock context
    const context: MechContext = {
        // Core functions
        sendComms: (msg) => {
            if (typeof msg === 'object' && 'type' in msg) {
                const m = msg as any;
                if (m.type === 'meta_cognition_triggered') {
                    console.log('\n🔄 META-COGNITION TRIGGERED');
                    console.log(`   Frequency: Every ${mechState.metaFrequency} calls`);
                    console.log(`   Current call count: ${llmCallCount}`);
                }
            }
        },
        
        getCommunicationManager: () => ({
            send: (msg) => console.log('📡', msg),
            isClosed: () => false,
            close: () => {}
        }),
        
        addHistory: (item) => {
            console.log(`\n📝 History: ${item.type}`);
        },
        
        getHistory: () => [],
        
        processPendingHistoryThreads: async () => {},
        
        describeHistory: (agent, messages) => messages,
        
        costTracker: {
            getTotalCost: () => 0.0
        },
        
        runStreamedWithTools: async (agent, input) => {
            llmCallCount++;
            const model = agent.model || 'gpt-4o';
            
            // Track model usage
            modelUsage.set(model, (modelUsage.get(model) || 0) + 1);
            
            console.log(`\n🤖 LLM Call #${llmCallCount}`);
            console.log(`   Model: ${model}`);
            console.log(`   Score: ${getModelScore(model, agent.modelClass)}`);
            console.log(`   Input: "${input.substring(0, 50)}..."`);
            
            // Simulate different responses based on model
            let response = '';
            if (model.includes('claude')) {
                response = `[Claude Response] Thoughtful analysis of: ${input}`;
            } else if (model.includes('gpt')) {
                response = `[GPT Response] Comprehensive answer to: ${input}`;
            } else {
                response = `[${model} Response] Processing: ${input}`;
            }
            
            return { response, tool_calls: [] };
        },
        
        // Optional functions
        dateFormat: () => new Date().toISOString(),
        readableTime: (ms) => `${ms}ms`,
        MAGI_CONTEXT: 'Meta-cognition Demo'
    };
    
    // Create an agent
    const agent: MechAgent = {
        name: 'MetaBot',
        agent_id: 'meta-bot-001',
        modelClass: 'reasoning',
        instructions: 'You are a reasoning agent that solves complex problems.',
        export: () => ({ name: 'MetaBot' }),
        getTools: async () => []
    };
    
    try {
        // Set meta-cognition to trigger frequently for demo
        console.log('Setting meta-cognition frequency to 5 (every 5 LLM calls)\n');
        set_meta_frequency('5');
        
        // Run multiple tasks to trigger meta-cognition
        const tasks = [
            'Explain quantum computing',
            'Solve a logic puzzle',
            'Write a haiku about AI',
            'Calculate fibonacci sequence',
            'Explain machine learning',
            'Debug a Python function',
            'Design a REST API',
            'Optimize an algorithm'
        ];
        
        console.log('Running multiple tasks to demonstrate meta-cognition...\n');
        
        for (const task of tasks) {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`TASK: ${task}`);
            console.log('='.repeat(60));
            
            const result = await runMECHAdvanced(agent, task, context, false);
            
            console.log(`\n✅ Task completed: ${result.status}`);
            console.log(`   Duration: ${result.durationSec}s`);
        }
        
        // Show model usage statistics
        console.log('\n\n📊 Model Usage Statistics:');
        console.log('-'.repeat(50));
        console.log(`Total LLM calls: ${llmCallCount}`);
        console.log(`Meta-cognition triggers: ${Math.floor(llmCallCount / mechState.metaFrequency)}`);
        console.log('\nModel distribution:');
        
        for (const [model, count] of modelUsage.entries()) {
            const percentage = ((count / llmCallCount) * 100).toFixed(1);
            console.log(`  ${model}: ${count} calls (${percentage}%)`);
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}