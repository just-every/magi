# @magi-system/mech

Meta-cognition Ensemble Chain-of-thought Hierarchy (MECH) for MAGI System

## Overview

MECH is an advanced orchestration system for LLM agents that combines four key capabilities:

- **Meta-cognition**: The system periodically "thinks about its own thinking," analyzing recent reasoning history and adjusting its approach if needed.
- **Ensemble**: Multiple models are used in parallel or sequence, with their outputs compared, judged, or merged for higher reliability.
- **Chain-of-thought**: The agent maintains a connected thread of thoughts, allowing for multi-step reasoning and context-aware problem solving.
- **Hierarchy**: Model selection is weighted by a dynamic score, so more capable models are chosen more often, but all models can participate.

## Installation

```bash
npm install @magi-system/mech @magi-system/ensemble
```

## Quick Start - Simple API

The simple API requires minimal setup - just provide your agent and a function to run it:

```typescript
import { runMECH, runMECHWithMemory } from '@magi-system/mech';

// Basic usage - only requires agent name and runAgent function
const result = await runMECH({
    agent: { name: 'MyAgent' },
    task: 'Analyze this code and suggest improvements',
    runAgent: async (agent, input, history) => {
        // Your LLM call here (OpenAI, Anthropic, etc.)
        const response = await callYourLLM(input, history);
        return { response };
    }
});

console.log(result.outcome); // 'completed' or 'fatal_error'
console.log(result.output);  // The agent's response
```

### With Optional Callbacks

```typescript
const result = await runMECH({
    agent: { 
        name: 'CodeAnalyzer',
        model: 'claude-3-opus-20240229',  // optional: specify model
        tools: [/* your tools */]         // optional: provide tools
    },
    task: 'Review this pull request',
    runAgent: async (agent, input, history) => {
        // Your LLM implementation
        return await yourLLM.complete(input, history);
    },
    loop: true,  // optional: allow multi-turn conversation
    
    // Optional callbacks
    onHistory: (item) => console.log('New history:', item),
    onStatus: (status) => console.log('Status update:', status)
});
```

### With Memory Features

```typescript
const result = await runMECHWithMemory({
    agent: { name: 'ProjectBuilder' },
    task: 'Create a React dashboard with user authentication',
    runAgent: async (agent, input, history) => {
        return await yourLLM.complete(input, history);
    },
    
    // Optional memory functions - provide only what you need
    embed: async (text) => {
        // Your embedding function (OpenAI, Cohere, etc.)
        return await embeddings.create(text);
    },
    lookupMemories: async (embedding) => {
        // Your vector DB lookup (Pinecone, Weaviate, etc.)
        return await vectorDB.findSimilar(embedding, 10);
    },
    saveMemory: async (taskId, memories) => {
        // Your memory storage
        await db.saveMemories(taskId, memories);
    }
});
```

### Cost Tracking

```typescript
import { getTotalCost, resetCostTracker } from '@magi-system/mech';

// Run your MECH operations...

// Check total cost across all MECH runs
const totalCost = getTotalCost();
console.log(`Total cost: $${totalCost.toFixed(4)}`);

// Reset for new session
resetCostTracker();
```

## Advanced Usage

For users who need more control, MECH provides the full API with all configuration options:

```typescript
import { runMECHAdvanced, mechState, set_thought_delay } from '@magi-system/mech';

// Adjust MECH behavior
mechState.metaFrequency = '10';  // Meta-cognition every 10 requests
set_thought_delay('8');          // 8 second delay between thoughts

// Use the advanced API with full MechContext
const context: MechContext = {
    // ... your full context implementation
};

const result = await runMECHAdvanced(agent, task, context, true);
```

## Features

### Model Rotation
MECH automatically rotates between models based on their performance scores:

```typescript
import { rotateModel } from '@magi-system/mech';

const nextModel = rotateModel(agent, 'reasoning');
```

### Meta-cognition
The system periodically analyzes its own performance and can:
- Adjust model scores
- Enable/disable models
- Change meta-cognition frequency
- Inject strategic thoughts

### Thought Delay
Control the pacing of agent thoughts:

```typescript
import { set_thought_delay, getThoughtDelay } from '@magi-system/mech';

// Set delay to 8 seconds
set_thought_delay('8');

// Get current delay
const currentDelay = getThoughtDelay();
```

### State Management
Access and modify MECH state:

```typescript
import { mechState, set_model_score, disable_model } from '@magi-system/mech';

// Set a model's score
set_model_score('gpt-4-turbo-preview', 85);

// Disable a model temporarily
disable_model('claude-2.1');

// Check state
console.log(mechState.metaFrequency); // '5'
console.log(mechState.disabledModels); // Set { 'claude-2.1' }
```

## What MECH Provides

When you use MECH, you automatically get:

1. **Intelligent Model Rotation** - MECH rotates between different models based on performance scores
2. **Cost Tracking** - Built-in cost tracking from @magi-system/ensemble
3. **Meta-cognition** - Periodic self-reflection to improve performance
4. **Thought Management** - Pacing and delay controls for better reasoning
5. **History Management** - Automatic conversation history tracking
6. **Task Completion Tools** - Built-in tools for marking tasks complete or failed

## API Reference

### Simple API Functions

- `runMECH(options)` - Run MECH with minimal setup
  - `options.agent` - Simple agent object (only `name` is required)
  - `options.task` - The task to perform
  - `options.runAgent` - Your LLM function
  - `options.loop?` - Enable multi-turn (default: false)
  - `options.model?` - Override model selection
  - `options.onHistory?` - History callback
  - `options.onStatus?` - Status update callback

- `runMECHWithMemory(options)` - Run MECH with memory features
  - All options from `runMECH`, plus:
  - `options.embed?` - Text embedding function
  - `options.lookupMemories?` - Vector similarity search
  - `options.saveMemory?` - Memory persistence

- `getTotalCost()` - Get total cost across all MECH operations
- `resetCostTracker()` - Reset the cost tracker

### Advanced API Functions

- `runMECHAdvanced(agent, content, context, loop?, model?)` - Full control with MechContext
- `runMECHWithMemoryAdvanced(agent, content, context, loop?, model?)` - Full control with memory

### State Management

- `mechState` - Global MECH state object
- `set_meta_frequency(frequency)` - Set meta-cognition frequency (5, 10, 20, or 40)
- `set_model_score(modelId, score)` - Set a model's performance score (0-100)
- `disable_model(modelId)` - Temporarily disable a model
- `enableModel(modelId)` - Re-enable a disabled model

### Thought Management

- `getThoughtDelay()` - Get current thought delay
- `set_thought_delay(delay)` - Set thought delay (0, 2, 4, 8, 16, 32, 64, or 128 seconds)
- `runThoughtDelay()` - Execute the thought delay
- `setDelayInterrupted(interrupted)` - Interrupt/resume thought delay

### Tools

- `getMECHTools(context)` - Get MECH-specific tools (task_complete, task_fatal_error)
- `getThoughtTools(context)` - Get thought management tools
- `getMetaCognitionTools(context)` - Get meta-cognition tools

## Migration from Full Context

If you're migrating from using the full MechContext:

```typescript
// Before - complex setup
const context: MechContext = {
    sendComms: comms.send,
    getCommunicationManager: () => comms,
    addHistory: history.add,
    getHistory: history.get,
    // ... many more fields
};
const result = await runMECH(agent, task, context, true);

// After - simple setup
const result = await runMECH({
    agent: { name: 'MyAgent' },
    task: task,
    runAgent: myLLMFunction
});
```

## How It Works

The simple API:
1. **Provides sensible defaults** for all required MechContext fields
2. **Imports CostTracker** from @magi-system/ensemble automatically
3. **Manages history** internally if you don't provide your own
4. **Routes status messages** to your callbacks or console
5. **Converts simple agents** to full MechAgent interface

This means you can get started with just:
- An agent name
- A task description  
- A function that calls your LLM

Everything else is handled automatically!

## Examples

The `examples/` directory contains practical demonstrations:

### Running Examples

```bash
npm run build
node dist/examples/simple-mech.js
```

### Available Examples

1. **simple-mech.ts** - Basic MECH usage with minimal setup
2. **mech-with-memory.ts** - Memory features for context-aware execution
3. **meta-cognition.ts** - Meta-cognition and model rotation
4. **thought-management.ts** - Thought delays and interruption handling

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test mech_state.test.ts
```

## Project Structure

```
mech/
├── examples/      # Practical examples
├── test/          # Test suite
├── utils/         # Internal utilities
├── index.ts       # Main exports
├── simple.ts      # Simple API implementation
├── types.ts       # TypeScript type definitions
├── mech_state.ts  # State management
├── mech_tools.ts  # Core MECH tools
├── thought_utils.ts # Thought management
└── meta_cognition.ts # Meta-cognition implementation
```

## License

MIT