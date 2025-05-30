# MECH Examples

This directory contains examples demonstrating the Meta-cognition Ensemble Chain-of-thought Hierarchy (MECH) system.

## Running Examples

Build MECH first, then run examples:

```bash
# From the mech directory
npm run build
node dist/examples/simple-mech.js
```

## Examples Overview

### 1. Simple MECH (`simple-mech.ts`)
The simplest way to use MECH with minimal setup.

**Key concepts:**
- Basic MECH configuration
- Simple agent definition
- Status and history callbacks
- Mock LLM integration

### 2. MECH with Memory (`mech-with-memory.ts`)
Demonstrates memory features for context-aware task execution.

**Key concepts:**
- Embedding generation
- Memory lookup and storage
- Context enrichment
- Memory-aware responses

### 3. Meta-cognition (`meta-cognition.ts`)
Shows MECH's self-reflection and model rotation capabilities.

**Key concepts:**
- Meta-cognition frequency
- Model scoring and rotation
- Automatic model selection
- Performance tracking

### 4. Thought Management (`thought-management.ts`)
Demonstrates thought delays and interruption handling.

**Key concepts:**
- Configurable thought delays
- Thought interruption
- Timing and performance
- Reasoning flow control

## Core Concepts

### Simple API
```typescript
import { runSimpleMECH } from '@magi-system/mech';

const result = await runSimpleMECH({
    agent: { name: 'MyBot' },
    task: 'Solve this problem',
    runAgent: myLLMFunction
});
```

### Advanced API
```typescript
import { runMECHAdvanced } from '@magi-system/mech';

const context: MechContext = {
    // Required functions
    sendComms: (msg) => { /* ... */ },
    getCommunicationManager: () => { /* ... */ },
    // ... other required functions
};

const result = await runMECHAdvanced(agent, task, context);
```

### Meta-cognition Control
```typescript
import { set_meta_frequency, mechState } from '@magi-system/mech';

// Run meta-cognition every 10 LLM calls
set_meta_frequency('10');

// Check current state
console.log(mechState.metaFrequency);
console.log(mechState.llmRequestCount);
```

### Thought Delays
```typescript
import { set_thought_delay, getThoughtDelay } from '@magi-system/mech';

// Set 4-second delay between thoughts
set_thought_delay('4');

// Check current delay
const currentDelay = getThoughtDelay(); // Returns '4'
```

## Integration Tips

1. **Start Simple**: Use `runSimpleMECH` for basic tasks
2. **Add Memory**: Include embedding functions for context awareness
3. **Enable Meta-cognition**: Let MECH self-optimize with meta-cognition
4. **Custom Context**: Build full `MechContext` for advanced features

## Common Patterns

### Mock LLM for Testing
```typescript
const mockLLM = async (agent, input, history) => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    return {
        response: `Processed: ${input}`,
        tool_calls: []
    };
};
```

### Memory Integration
```typescript
const options = {
    // ... other options
    embed: async (text) => generateEmbedding(text),
    lookupMemories: async (embedding) => searchMemories(embedding),
    saveMemory: async (taskId, memories) => storeMemories(taskId, memories)
};
```

### Status Monitoring
```typescript
onStatus: (status) => {
    switch (status.type) {
        case 'meta_cognition_triggered':
            console.log('Meta-cognition running...');
            break;
        case 'model_rotated':
            console.log('Switched to:', status.model);
            break;
    }
}
```