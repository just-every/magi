# @magi-system/ensemble

Shared model-provider utilities for MAGI System. This package provides a unified interface for interacting with multiple LLM providers including OpenAI, Anthropic Claude, Google Gemini, Deepseek, Grok, and OpenRouter.

## Features

- **Multi-provider support**: Claude, OpenAI, Gemini, Deepseek, Grok, OpenRouter
- **Event-driven API**: Callback-based streaming for better performance
- **Cancellation support**: Explicit request cancellation with cleanup
- **Tool calling**: Function calling support where available
- **Image processing**: Image-to-text and image utilities
- **Cost tracking**: Token usage and cost monitoring
- **Quota management**: Rate limiting and usage tracking
- **Pluggable logging**: Configurable request/response logging
- **Type safety**: Full TypeScript support

## Installation

```bash
npm install @magi-system/ensemble
```

## Quick Start

```typescript
import { request } from '@magi-system/ensemble';

// Simple request with callback API
const cancel = request('claude-3-5-sonnet-20241022', [
  { type: 'message', role: 'user', content: 'Hello, world!' }
], {
  onEvent: (event) => {
    if (event.type === 'message_delta') {
      console.log(event.content);
    } else if (event.type === 'message_complete') {
      console.log('Request completed!');
    }
  },
  onError: (error) => {
    console.error('Request failed:', error);
  }
});

// Cancel the request if needed
// cancel.cancel();

// With tools
const cancelWithTools = request('gpt-4o', [
  { type: 'message', role: 'user', content: 'What is the weather?' }
], {
  tools: [{
    name: 'get_weather',
    description: 'Get current weather',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string' }
      }
    }
  }],
  onEvent: (event) => {
    if (event.type === 'tool_call') {
      console.log('Tool called:', event.tool_calls[0].function.name);
    } else if (event.type === 'message_delta') {
      console.log(event.content);
    }
  },
  onError: console.error
});
```

## API Reference

### `request(model, messages, params)`

Main function for making LLM requests using the new callback-based API.

**Parameters:**
- `model` (string): Model identifier
- `messages` (ResponseInput): Array of message objects
- `params` (RequestParams): Configuration object with required `onEvent` callback

**Returns:** CancelHandle with `cancel()` method

```typescript
interface RequestParams {
  agentId?: string;
  tools?: ToolFunction[];
  modelSettings?: ModelSettings;
  modelClass?: ModelClassID;
  onEvent: (event: StreamingEvent) => void;    // required
  onError?: (error: unknown) => void;          // optional
}

interface CancelHandle {
  cancel(): void;
}
```


### Model Provider Interface

Each provider implements the `ModelProvider` interface:

```typescript
interface ModelProvider {
  createResponse(
    model: string, 
    messages: ResponseInput, 
    agent: EnsembleAgent,
    onEvent: (event: StreamingEvent) => void,
    onError?: (error: unknown) => void
  ): CancelHandle;
}
```

### Utilities

- **AsyncQueue**: Generic async queue for bridging callbacks to async iteration
- **Cost Tracking**: Monitor token usage and costs with cost_tracker
- **Quota Management**: Track API quotas and rate limits with quota_tracker
- **Image Processing**: Convert images to text, resize, and optimize
- **Logging System**: Pluggable request/response logging with configurable backends
- **Communication**: Logging and debugging utilities
- **Delta Buffer**: Handle streaming response deltas

#### AsyncQueue Example

```typescript
import { AsyncQueue } from '@magi-system/ensemble';

// Bridge callback events to async iteration
const queue = new AsyncQueue<string>();

// Push events
queue.push('event1');
queue.push('event2');
queue.complete();

// Consume as async iterator
for await (const event of queue) {
  console.log(event);
}
```

### Logging

The ensemble package includes a pluggable logging system for LLM requests and responses:

```typescript
import { setEnsembleLogger, EnsembleLogger } from '@magi-system/ensemble';

// Implement custom logger
class CustomLogger implements EnsembleLogger {
  log_llm_request(agentId: string, providerName: string, model: string, requestData: unknown, timestamp?: Date): string {
    // Log request and return request ID for correlation
    console.log(`Request: ${agentId} -> ${providerName}/${model}`);
    return `req_${Date.now()}`;
  }

  log_llm_response(requestId: string | undefined, responseData: unknown, timestamp?: Date): void {
    // Log response using request ID
    console.log(`Response for: ${requestId}`);
  }

  log_llm_error(requestId: string | undefined, errorData: unknown, timestamp?: Date): void {
    // Log error using request ID
    console.log(`Error for: ${requestId}`);
  }
}

// Enable logging
setEnsembleLogger(new CustomLogger());

// All ensemble requests will now be logged
```

## Environment Variables

Set up API keys for the providers you want to use:

```bash
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
GOOGLE_API_KEY=your_key_here
DEEPSEEK_API_KEY=your_key_here
XAI_API_KEY=your_key_here
OPENROUTER_API_KEY=your_key_here
```

## License

MIT
