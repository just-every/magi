# Ensemble Examples

This directory contains practical examples demonstrating how to use the ensemble module.

## Running Examples

All examples can be run directly with Node.js:

```bash
# From the ensemble directory
npm run build
node dist/examples/basic-request.js
```

## Examples Overview

### 1. Basic Request (`basic-request.ts`)
Shows the simplest way to make an LLM request and handle the streaming response.

**Key concepts:**
- Creating request messages
- Handling streaming events
- Error handling

### 2. Tool Calling (`tool-calling.ts`)
Demonstrates how to define and use tools (function calling) with LLMs.

**Key concepts:**
- Defining tool functions
- Tool parameter schemas
- Processing tool calls in the stream

### 3. Model Rotation (`model-rotation.ts`)
Shows ensemble's intelligent model selection and rotation based on scores.

**Key concepts:**
- Model classes (standard, code, reasoning, monologue)
- Score-based selection
- Rate limit fallbacks
- Model information queries

### 4. Stream Conversion (`stream-conversion.ts`)
Advanced example showing how to convert streaming events into conversation history.

**Key concepts:**
- Stream-to-message conversion
- Building conversation threads
- Handling tool calls and results
- Custom callbacks for events

## Common Patterns

### Error Handling
```typescript
try {
    const stream = request(model, messages);
    for await (const event of stream) {
        if (event.type === 'error') {
            // Handle error event
        }
    }
} catch (error) {
    // Handle stream failure
}
```

### Tool Definition
```typescript
const tool: ToolFunction = {
    function: async (args) => {
        // Implementation
        return 'result string';
    },
    definition: {
        type: 'function',
        function: {
            name: 'tool_name',
            description: 'What this tool does',
            parameters: {
                type: 'object',
                properties: { /* ... */ },
                required: [ /* ... */ ]
            }
        }
    }
};
```

### Message Building
```typescript
const messages: ResponseInput = [
    { type: 'message', role: 'developer', content: 'System prompt' },
    { type: 'message', role: 'user', content: 'User input' },
    // Tool results appear as:
    { type: 'function_call', /* ... */ },
    { type: 'function_call_output', /* ... */ }
];
```