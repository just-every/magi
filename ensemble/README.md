# @magi-system/ensemble

Shared model-provider utilities for MAGI System. This package provides a unified interface for interacting with multiple LLM providers including OpenAI, Anthropic Claude, Google Gemini, Deepseek, Grok, and OpenRouter.

## Features

- **Multi-provider support**: Claude, OpenAI, Gemini, Deepseek, Grok, OpenRouter
- **AsyncGenerator API**: Clean, native async iteration for streaming responses
- **Simple interface**: Direct async generator pattern matches native LLM APIs
- **Tool calling**: Function calling support where available
- **Stream conversion**: Convert streaming events to conversation history for chaining
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

// Simple request with AsyncGenerator API
const stream = request('claude-3-5-sonnet-20241022', [
  { type: 'message', role: 'user', content: 'Hello, world!' }
]);

// Process streaming events
for await (const event of stream) {
  if (event.type === 'message_delta') {
    console.log(event.content);
  } else if (event.type === 'message_complete') {
    console.log('Request completed!');
  } else if (event.type === 'error') {
    console.error('Request failed:', event.error);
  }
}

// With tools
const toolStream = request('gpt-4o', [
  { type: 'message', role: 'user', content: 'What is the weather?' }
], {
  tools: [{
    function: async (location: string) => {
      // Tool implementation
      return `Weather in ${location}: Sunny, 72°F`;
    },
    definition: {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get current weather',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string' }
          },
          required: ['location']
        }
      }
    }
  }]
});

// Process tool calls
for await (const event of toolStream) {
  if (event.type === 'tool_start') {
    console.log('Tool called:', event.tool_calls[0].function.name);
  } else if (event.type === 'message_delta') {
    console.log(event.content);
  }
}

// Early termination
const earlyStream = request('claude-3-5-sonnet-20241022', [
  { type: 'message', role: 'user', content: 'Count to 100' }
]);

let count = 0;
for await (const event of earlyStream) {
  if (event.type === 'message_delta') {
    count++;
    if (count >= 10) break; // Stop after 10 events
  }
}
```

## API Reference

### `request(model, messages, options?)`

Main function for making LLM requests using the AsyncGenerator API.

**Parameters:**
- `model` (string): Model identifier
- `messages` (ResponseInput): Array of message objects
- `options` (RequestOptions): Optional configuration object

**Returns:** `AsyncGenerator<EnsembleStreamEvent>` - An async generator that yields streaming events

```typescript
interface RequestOptions {
  agentId?: string;
  tools?: ToolFunction[];
  modelSettings?: ModelSettings;
  modelClass?: ModelClassID;
}

// Usage with try/catch for error handling
try {
  for await (const event of request(model, messages, options)) {
    // Process events
  }
} catch (error) {
  // Handle errors
}
```


### Model Provider Interface

Each provider implements the `ModelProvider` interface:

```typescript
interface ModelProvider {
  createResponseStream(
    model: string, 
    messages: ResponseInput, 
    agent: EnsembleAgent
  ): AsyncGenerator<EnsembleStreamEvent>;
}
```

### Utilities

- **Cost Tracking**: Monitor token usage and costs with cost_tracker
- **Quota Management**: Track API quotas and rate limits with quota_tracker
- **Image Processing**: Convert images to text, resize, and optimize
- **Logging System**: Pluggable request/response logging with configurable backends
- **Communication**: Logging and debugging utilities
- **Delta Buffer**: Handle streaming response deltas
- **AsyncQueue**: Generic async queue for bridging callbacks to async iteration (used internally)

### Stream Conversion

Convert streaming events into conversation history for chaining LLM calls:

```typescript
import { convertStreamToMessages, chainRequests } from '@magi-system/ensemble';

// Convert a single stream to messages
const stream = request('claude-3-5-sonnet-20241022', [
  { type: 'message', role: 'user', content: 'Tell me a joke' }
]);

const result = await convertStreamToMessages(stream);
console.log(result.messages); // Array of ResponseInput items
console.log(result.fullResponse); // Complete response text

// Chain multiple requests together
const chainResult = await chainRequests([
  {
    model: 'claude-3-5-sonnet-20241022',
    systemPrompt: 'You are a helpful assistant that tells jokes.',
  },
  {
    model: 'gpt-4o',
    systemPrompt: 'Rate the previous joke on a scale of 1-10.',
  }
], [
  { type: 'message', role: 'user', content: 'Tell me a joke about programming' }
]);

// Custom tool processing during conversion
const streamWithTools = request('gpt-4o', messages, {
  tools: [weatherTool]
});

const toolResult = await convertStreamToMessages(streamWithTools, [], {
  processToolCall: async (toolCalls) => {
    // Process tool calls and return results
    const results = await Promise.all(
      toolCalls.map(call => processMyTool(call))
    );
    return results;
  },
  onThinking: (msg) => console.log('Thinking:', msg.content),
  onResponse: (msg) => console.log('Response:', msg.content),
});
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
