/**
 * Thought Management Example
 * 
 * This example shows how MECH manages thought delays and
 * interruptions for better reasoning flow.
 */

import { runMECHAdvanced } from '../index.js';
import { set_thought_delay, getThoughtDelay, setDelayInterrupted } from '../thought_utils.js';
import type { MechAgent, MechContext } from '../types.js';

async function simulateThoughtProcess() {
    console.log('💭 Thought Management Example\n');
    
    // Track thought timing
    const thoughtTimings: { thought: string; duration: number }[] = [];
    let lastThoughtTime = Date.now();
    
    // Create context with thought tracking
    const context: MechContext = {
        sendComms: (msg) => {
            if (typeof msg === 'object' && 'type' in msg) {
                const m = msg as any;
                if (m.type === 'thought_delay') {
                    console.log(`\n⏱️  Thought delay: ${m.delayMs}ms`);
                } else if (m.type === 'thought_complete') {
                    const duration = Date.now() - lastThoughtTime;
                    console.log(`   ✓ Thought completed in ${duration}ms`);
                    lastThoughtTime = Date.now();
                }
            }
        },
        
        getCommunicationManager: () => ({
            send: () => {},
            isClosed: () => false,
            close: () => {}
        }),
        
        addHistory: (item) => {
            if (item.type === 'thinking' && 'content' in item) {
                const duration = Date.now() - lastThoughtTime;
                const thought = String(item.content).substring(0, 50);
                thoughtTimings.push({ thought, duration });
                console.log(`\n💭 Thinking: "${thought}..."`);
            }
        },
        
        getHistory: () => [],
        processPendingHistoryThreads: async () => {},
        describeHistory: (agent, messages) => messages,
        costTracker: { getTotalCost: () => 0 },
        
        runStreamedWithTools: async (agent, input) => {
            // Simulate thinking with current delay
            const delay = parseInt(getThoughtDelay()) * 1000;
            console.log(`\n🤔 Processing with ${delay}ms thought delay...`);
            
            if (delay > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            return {
                response: `After careful consideration (${delay}ms): ${input}`,
                tool_calls: []
            };
        },
        
        dateFormat: () => new Date().toISOString(),
        readableTime: (ms) => `${(ms / 1000).toFixed(1)}s`
    };
    
    const agent: MechAgent = {
        name: 'ThoughtfulBot',
        agent_id: 'thought-bot-001',
        modelClass: 'reasoning',
        instructions: 'You think carefully before responding.',
        export: () => ({ name: 'ThoughtfulBot' }),
        getTools: async () => []
    };
    
    try {
        // Test different thought delays
        const delays = ['0', '2', '4'] as const;
        
        for (const delay of delays) {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`Testing with thought delay: ${delay} seconds`);
            console.log('='.repeat(60));
            
            set_thought_delay(delay);
            
            const startTime = Date.now();
            const result = await runMECHAdvanced(
                agent,
                `Quick question with ${delay}s delay: What is 2+2?`,
                context,
                false
            );
            
            const totalTime = Date.now() - startTime;
            console.log(`\n✅ Completed in ${(totalTime / 1000).toFixed(1)}s`);
            console.log(`   Status: ${result.status}`);
        }
        
        // Test thought interruption
        console.log(`\n\n${'='.repeat(60)}`);
        console.log('Testing thought interruption');
        console.log('='.repeat(60));
        
        set_thought_delay('8'); // Set a long delay
        
        // Start a task
        const interruptPromise = runMECHAdvanced(
            agent,
            'Complex question that might be interrupted',
            context,
            false
        );
        
        // Interrupt after 2 seconds
        setTimeout(() => {
            console.log('\n⚡ INTERRUPTING THOUGHT PROCESS!');
            setDelayInterrupted(true);
        }, 2000);
        
        const interruptResult = await interruptPromise;
        console.log(`\n✅ Interrupted task status: ${interruptResult.status}`);
        
        // Summary
        console.log('\n\n📊 Thought Timing Summary:');
        console.log('-'.repeat(50));
        
        if (thoughtTimings.length > 0) {
            const avgDuration = thoughtTimings.reduce((sum, t) => sum + t.duration, 0) / thoughtTimings.length;
            console.log(`Total thoughts: ${thoughtTimings.length}`);
            console.log(`Average duration: ${(avgDuration / 1000).toFixed(1)}s`);
            
            console.log('\nIndividual thoughts:');
            thoughtTimings.forEach((t, i) => {
                console.log(`  ${i + 1}. "${t.thought}..." (${(t.duration / 1000).toFixed(1)}s)`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

async function main() {
    await simulateThoughtProcess();
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}