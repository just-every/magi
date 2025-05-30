/**
 * MECH with Memory Example
 * 
 * This example demonstrates using MECH with memory features
 * for context-aware task execution.
 */

import { runSimpleMECH } from '../simple.js';
import type { RunMechOptions, MemoryItem } from '../types.js';

// Simulate a memory store
const memoryStore = new Map<string, MemoryItem[]>();

async function main() {
    console.log('🧠 MECH with Memory Example\n');
    
    // Mock embedding function
    const mockEmbed = async (text: string): Promise<number[]> => {
        // Simple mock: use text length and char codes for "embedding"
        const embedding = new Array(8).fill(0);
        for (let i = 0; i < Math.min(text.length, 8); i++) {
            embedding[i] = text.charCodeAt(i) / 255;
        }
        console.log(`\n🔢 Created embedding for: "${text.substring(0, 30)}..."`);
        return embedding;
    };
    
    // Mock memory lookup
    const mockLookupMemories = async (embedding: number[]): Promise<MemoryItem[]> => {
        console.log('\n🔍 Looking up memories...');
        
        // For demo, return some pre-stored memories
        const relevantMemories: MemoryItem[] = [
            {
                text: 'The user previously asked about Python programming.',
                metadata: { timestamp: new Date(Date.now() - 3600000).toISOString() }
            },
            {
                text: 'The user is interested in machine learning topics.',
                metadata: { timestamp: new Date(Date.now() - 7200000).toISOString() }
            }
        ];
        
        console.log(`   Found ${relevantMemories.length} relevant memories`);
        return relevantMemories;
    };
    
    // Mock memory save
    const mockSaveMemory = async (taskId: string, memories: MemoryItem[]): Promise<void> => {
        console.log(`\n💾 Saving ${memories.length} memories for task ${taskId}`);
        memoryStore.set(taskId, memories);
        for (const memory of memories) {
            console.log(`   - ${memory.text}`);
        }
    };
    
    // Mock LLM with memory awareness
    const memoryAwareLLM = async (agent: any, input: string, history: any[]) => {
        console.log(`\n📤 Memory-aware LLM Request:`);
        console.log(`   Agent: ${agent.name}`);
        console.log(`   Input: "${input}"`);
        console.log(`   History length: ${history.length}`);
        
        // Check if memories were added to context
        const memoryContext = history.find(h => 
            h.type === 'message' && 
            h.content?.includes('Relevant memories:')
        );
        
        if (memoryContext) {
            console.log('   ✓ Memory context found in history');
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const response = `Based on your previous interests in Python and machine learning, 
I recommend exploring scikit-learn for your data science project. 
This builds on our earlier discussions about Python programming.`;
        
        return { response, tool_calls: [] };
    };
    
    // Configure MECH with memory
    const options: RunMechOptions = {
        agent: {
            name: 'MemoryBot',
            instructions: 'You are an assistant with memory of past conversations.'
        },
        task: 'What data science library should I use for my project?',
        runAgent: memoryAwareLLM,
        embed: mockEmbed,
        lookupMemories: mockLookupMemories,
        saveMemory: mockSaveMemory,
        onHistory: (item) => {
            if (item.type === 'message' && item.content) {
                const preview = item.content.substring(0, 50);
                console.log(`\n📝 History [${item.role}]: ${preview}...`);
            }
        }
    };
    
    try {
        console.log('Starting MECH with memory features...\n');
        const result = await runSimpleMECH(options);
        
        console.log('\n\n✅ MECH Result:');
        console.log('-'.repeat(50));
        console.log(`Status: ${result.status}`);
        console.log(`Duration: ${result.durationSec}s`);
        
        if (result.mechOutcome?.result) {
            console.log(`\n📌 Final Result:\n${result.mechOutcome.result}`);
        }
        
        // Show saved memories
        console.log('\n\n💾 Memories saved during execution:');
        for (const [taskId, memories] of memoryStore.entries()) {
            console.log(`\nTask ${taskId}:`);
            memories.forEach((m, i) => {
                console.log(`  ${i + 1}. ${m.text}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}