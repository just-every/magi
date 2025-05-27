# Ensemble Migration Guide

## Overview

This guide explains how to migrate the ensemble module to the new architecture that better supports interleaving responses from multiple LLM providers.

## Key Changes

### 1. Event Type Consolidation

**Current**: Two separate event hierarchies (EnsembleStreamEvent and StreamingEvent)
**New**: Single unified event type used everywhere

```typescript
// Before
type EnsembleStreamEvent = { /* ensemble events */ }
type StreamingEvent = EnsembleStreamEvent & { agent: Agent }

// After
type StreamEvent = { /* all events */ }
// Agent info is optional metadata, not required
```

### 2. Response Format Standardization

**Current**: Manual conversion from events to ResponseInput
**New**: Automatic conversion handled by the framework

```typescript
// Before - in runStreamedWithTools
const messageItems: ResponseInput = [];
for await (const event of stream) {
    switch (event.type) {
        case 'message_complete':
            messageItems.push({
                type: 'message',
                role: 'assistant',
                content: event.content,
                // ... manual mapping
            });
            break;
        // ... more cases
    }
}

// After
const response = await ensemble.request(model, { messages });
// response is already ResponseInput[]
```

### 3. Provider Interface Simplification

**Current**: Providers must handle streaming and format conversion
**New**: Providers only need to implement core functionality

```typescript
// Before
class ClaudeProvider implements ModelProvider {
    async *createResponseStream(model, messages, agent) {
        // Complex streaming logic
        // Manual format conversion
        // Event emission
    }
}

// After
class ClaudeProvider extends BaseProvider {
    async makeRequest(model, messages, settings) {
        // Just make the API call
        // Base class handles streaming and conversion
        return apiResponse;
    }
}
```

## Implementation Steps

### Step 1: Create Base Provider Class

```typescript
// ensemble/providers/base.ts
export abstract class BaseProvider {
    abstract makeRequest(
        model: string,
        messages: ResponseInput,
        settings?: ModelSettings
    ): Promise<any> | AsyncGenerator<any>;
    
    // Handles streaming and format conversion
    async *createResponseStream(
        model: string,
        messages: ResponseInput,
        agent?: any
    ): AsyncGenerator<StreamEvent> {
        const response = await this.makeRequest(model, messages, agent?.modelSettings);
        
        // Handle both async generator and promise responses
        if (Symbol.asyncIterator in response) {
            yield* this.convertToStreamEvents(response);
        } else {
            yield* this.convertResponseToEvents(response);
        }
    }
    
    // Converts provider-specific format to standard events
    private async *convertToStreamEvents(stream: AsyncGenerator<any>): AsyncGenerator<StreamEvent> {
        // Implementation
    }
}
```

### Step 2: Update Providers

```typescript
// ensemble/providers/claude.ts
export class ClaudeProvider extends BaseProvider {
    async makeRequest(model: string, messages: ResponseInput, settings?: ModelSettings) {
        // Just the Anthropic API call
        const response = await anthropic.messages.create({
            model,
            messages: this.formatMessages(messages),
            ...settings
        });
        return response;
    }
}
```

### Step 3: Create High-Level API

```typescript
// ensemble/core/request.ts
export class Ensemble {
    async request(
        model: string,
        options: RequestOptions
    ): Promise<ResponseInput> {
        const events: StreamEvent[] = [];
        const stream = this.stream(model, options);
        
        for await (const event of stream) {
            events.push(event);
        }
        
        return this.eventsToResponseInput(events);
    }
    
    stream(
        model: string,
        options: RequestOptions
    ): AsyncGenerator<StreamEvent> {
        const provider = getModelProvider(model);
        return provider.createResponseStream(
            model,
            options.messages,
            options
        );
    }
}
```

### Step 4: Add Builder APIs

```typescript
// ensemble/core/chain.ts
export class Chain {
    private steps: ChainStep[] = [];
    
    model(model: string, input?: string | ((prev: string) => string)) {
        this.steps.push({ type: 'model', model, input });
        return this;
    }
    
    user(content: string | ((prev: string) => string)) {
        this.steps.push({ type: 'user', content });
        return this;
    }
    
    async execute(): Promise<ResponseInput> {
        let messages: ResponseInput = [];
        
        for (const step of this.steps) {
            if (step.type === 'user') {
                const content = typeof step.content === 'function' 
                    ? step.content(this.getLastResponse(messages))
                    : step.content;
                messages.push({
                    type: 'message',
                    role: 'user',
                    content
                });
            } else if (step.type === 'model') {
                const response = await ensemble.request(step.model, { messages });
                messages = [...messages, ...response];
            }
        }
        
        return messages;
    }
}
```

### Step 5: Update MAGI Integration

```typescript
// magi/src/utils/runner.ts
export class Runner {
    static async runStreamedWithTools(
        agent: Agent,
        input?: string,
        conversationHistory: ResponseInput = [],
        // ... other params
    ): Promise<string> {
        // Use new ensemble API
        const messages = [...conversationHistory];
        if (input) {
            messages.push({
                type: 'message',
                role: 'user',
                content: input
            });
        }
        
        const response = await ensemble.request(agent.model, {
            messages,
            tools: await agent.getTools(),
            modelSettings: agent.modelSettings,
            onEvent: (event) => {
                // Handle events as before
                comm.send(event);
                handlers.onEvent?.(event);
            },
            onToolCall: async (call) => {
                // Handle tool calls
                return await processToolCall(call, agent, handlers);
            }
        });
        
        // Response is already in ResponseInput format
        const lastMessage = response[response.length - 1];
        return lastMessage.content as string;
    }
}
```

## Benefits After Migration

1. **Simpler Integration**: No manual event-to-message conversion
2. **Better Composability**: Easy to chain models together
3. **Cleaner Providers**: Providers focus on API calls, not format conversion
4. **Type Safety**: Single source of truth for types
5. **Easier Testing**: Can test providers independently of streaming logic

## Gradual Migration Path

### Phase 1: Internal Refactoring (No API Changes)
1. Create BaseProvider class
2. Move format conversion logic to base class
3. Update providers to extend BaseProvider
4. Keep existing public API unchanged

### Phase 2: New API Addition (Backward Compatible)
1. Add new high-level APIs alongside existing ones
2. Mark old APIs as deprecated
3. Update documentation with new examples
4. Migrate internal usage gradually

### Phase 3: Standalone Package
1. Extract to separate repository
2. Remove MAGI-specific code
3. Publish to npm
4. Update MAGI to use published package

## Testing Strategy

1. **Unit Tests**: Test each provider's format conversion
2. **Integration Tests**: Test multi-model chains
3. **Compatibility Tests**: Ensure backward compatibility
4. **Performance Tests**: Verify no performance regression

## Timeline Estimate

- Phase 1: 1-2 weeks (internal refactoring)
- Phase 2: 2-3 weeks (new APIs and migration)
- Phase 3: 1 week (extraction and publishing)

Total: 4-6 weeks for complete migration