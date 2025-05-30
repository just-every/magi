# Ensemble Utilities

This directory contains utility modules that support the ensemble framework's core functionality.

## Modules Overview

### Core Infrastructure

#### `async_queue.ts`
An async-iterable queue for managing streaming data flow.
- Used for buffering events between producers and consumers
- Supports error propagation and completion signaling
- Essential for the streaming API implementation

#### `communication.ts`
Placeholder for future inter-process communication utilities.
- Reserved for IPC between ensemble components
- Currently minimal implementation

### Stream Processing

#### `delta_buffer.ts`
Accumulates text deltas from streaming responses.
- Buffers incremental text chunks
- Used by providers to build complete messages
- Simple append and clear operations

#### `stream_converter.ts`
Converts raw streaming events into structured conversation history.
- Transforms `EnsembleStreamEvent` stream to `ResponseInput` messages
- Handles tool call processing
- Manages thinking/response callbacks
- Key utility for building conversation threads

### Cost & Resource Management

#### `cost_tracker.ts`
Tracks API usage costs across all LLM providers.
- Records token usage and costs per request
- Provides aggregated cost reporting
- Supports cost breakdown by model and agent
- Essential for budget monitoring

#### `quota_tracker.ts`
Manages rate limits and quotas for LLM providers.
- Tracks requests per minute/hour/day
- Implements quota checking and warnings
- Prevents exceeding provider limits
- Configurable limits per model

### Logging & Monitoring

#### `llm_logger.ts`
Comprehensive logging for LLM interactions.
- Logs requests, responses, and errors
- Configurable log levels and output
- Performance metrics tracking
- Debug mode for detailed traces

### Image Processing

#### `image_utils.ts`
Utilities for handling images in LLM requests.
- Image URL validation
- Base64 encoding/decoding
- Image type detection
- Token estimation for vision models

#### `image_to_text.ts`
Converts images to text descriptions using vision models.
- Supports multiple image formats
- Handles both URLs and base64 data
- Configurable detail levels
- Used for multi-modal interactions

## Usage Examples

### AsyncQueue
```typescript
const queue = new AsyncQueue<Event>();
// Producer
queue.push(event);
queue.complete();
// Consumer
for await (const event of queue) {
    processEvent(event);
}
```

### CostTracker
```typescript
const tracker = new CostTracker();
tracker.addCost(model, tokens, cost);
console.log(tracker.getTotalCost());
console.log(tracker.getCostByModel());
```

### StreamConverter
```typescript
const result = await convertStreamToMessages(
    eventStream,
    initialMessages,
    {
        model: 'gpt-4',
        processToolCall: async (calls) => { /* ... */ }
    }
);
```

## Best Practices

1. **Error Handling**: All utilities include proper error handling and propagation
2. **Type Safety**: Full TypeScript typing for all interfaces
3. **Performance**: Optimized for streaming and real-time processing
4. **Modularity**: Each utility is independent and focused on a single responsibility
5. **Testing**: Comprehensive test coverage in the `test/` directory