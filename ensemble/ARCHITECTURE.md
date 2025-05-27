# Ensemble Architecture Proposal

## Overview

The ensemble module should be restructured as a standalone library that makes it easy to:
1. Chain responses between different models
2. Handle streaming events consistently
3. Convert between formats automatically
4. Support various interleaving patterns

## Core Design Principles

### 1. **Unified Message Format**
- Use `ResponseInput` as the universal format
- All providers convert to/from this format internally
- No separate event types for ensemble vs application

### 2. **Streaming-First Architecture**
- All operations return streams of events
- Streams can be composed, transformed, and merged
- Built-in backpressure and cancellation support

### 3. **Provider Abstraction**
- Each provider implements a simple interface
- Automatic format conversion handled by the core
- Providers don't need to know about other providers

## Proposed API

### Basic Usage

```typescript
import { ensemble } from '@anthropic/ensemble';

// Simple request
const response = await ensemble.request('claude-3-5-sonnet-20241022', {
  messages: [
    { role: 'user', content: 'Hello!' }
  ]
});

// Streaming request
const stream = ensemble.stream('gpt-4o', {
  messages: [
    { role: 'user', content: 'Tell me a story' }
  ],
  onEvent: (event) => console.log(event)
});
```

### Chaining Models

```typescript
// Sequential chain
const chain = ensemble.chain()
  .model('claude-3-5-sonnet-20241022', 'Analyze this problem')
  .model('gpt-4o', (prev) => `Given this analysis: ${prev}, what's your solution?`)
  .model('gemini-2.0-flash-exp', (prev) => `Critique this solution: ${prev}`)
  .execute();

// With context preservation
const conversation = ensemble.conversation()
  .system('You are a helpful assistant')
  .user('What is quantum computing?')
  .model('claude-3-5-sonnet-20241022')
  .user('Can you explain it simpler?')
  .model('gpt-4o')
  .execute();
```

### Parallel Execution

```typescript
// Parallel with voting
const result = await ensemble.parallel()
  .models(['claude-3-5-sonnet-20241022', 'gpt-4o', 'gemini-2.0-flash-exp'])
  .prompt('What is 2+2?')
  .merge('majority-vote')
  .execute();

// Parallel with custom merge
const merged = await ensemble.parallel()
  .models(['model1', 'model2'])
  .prompt('Write a poem')
  .merge((responses) => {
    // Custom merge logic
    return responses.join('\n---\n');
  })
  .execute();
```

### Stream Composition

```typescript
// Transform events
const transformed = ensemble.stream('claude-3-5-sonnet-20241022', { messages })
  .map(event => ({ ...event, source: 'claude' }))
  .filter(event => event.type !== 'message_delta')
  .execute();

// Merge multiple streams
const merged = ensemble.merge([
  ensemble.stream('model1', { messages }),
  ensemble.stream('model2', { messages })
]).execute();

// Race condition - first to complete wins
const fastest = ensemble.race([
  ensemble.stream('claude-3-5-sonnet-20241022', { messages }),
  ensemble.stream('gpt-4o', { messages })
]).execute();
```

### Tool Handling

```typescript
// Unified tool interface
const tools = [
  {
    name: 'calculator',
    description: 'Performs calculations',
    parameters: { /* ... */ },
    execute: async (args) => { /* ... */ }
  }
];

const response = await ensemble.request('claude-3-5-sonnet-20241022', {
  messages,
  tools,
  onToolCall: async (call) => {
    // Automatic tool execution
    const tool = tools.find(t => t.name === call.name);
    return tool ? await tool.execute(call.args) : 'Tool not found';
  }
});
```

## Implementation Structure

```
ensemble/
├── core/
│   ├── request.ts       # Basic request functionality
│   ├── stream.ts        # Stream utilities and transformations
│   ├── chain.ts         # Sequential chaining
│   ├── parallel.ts      # Parallel execution
│   ├── conversation.ts  # Conversation builder
│   └── merge.ts         # Merge strategies
├── providers/
│   ├── base.ts          # Base provider interface
│   ├── claude.ts
│   ├── openai.ts
│   └── ...
├── utils/
│   ├── format.ts        # Format conversion utilities
│   ├── events.ts        # Event type definitions
│   └── tools.ts         # Tool handling utilities
├── types.ts             # Core type definitions
└── index.ts             # Public API exports
```

## Migration Path

### Phase 1: Internal Refactoring
1. Consolidate event types (remove distinction between EnsembleStreamEvent and StreamingEvent)
2. Create format conversion utilities
3. Implement base provider class with automatic conversions

### Phase 2: New API Layer
1. Implement builder patterns (chain, parallel, conversation)
2. Add stream transformation utilities
3. Create merge strategies

### Phase 3: Standalone Package
1. Extract to separate repository
2. Publish to npm as `@anthropic/ensemble`
3. Update magi to use published package

## Benefits

1. **Simplicity**: Clean API that's easy to understand and use
2. **Flexibility**: Support for various interleaving patterns
3. **Composability**: Streams can be easily composed and transformed
4. **Type Safety**: Full TypeScript support with proper types
5. **Extensibility**: Easy to add new providers and patterns

## Example: Current vs Proposed

### Current (in magi)
```typescript
const messageItems: ResponseInput = [];
for await (const event of stream) {
  switch (event.type) {
    case 'message_complete':
      messageItems.push({
        type: 'message',
        role: 'assistant',
        content: event.content,
        // ... lots of manual conversion
      });
      break;
    // ... handle other events
  }
}
```

### Proposed
```typescript
const response = await ensemble.request(model, { messages });
// Response is already in ResponseInput format
```

## Next Steps

1. Create base provider interface with automatic format conversion
2. Implement streaming utilities for composition
3. Build chain/parallel/conversation APIs on top of streaming
4. Gradually migrate existing providers to new structure