# MECH Utilities

This directory contains internal utilities that support the MECH (Meta-cognition Ensemble Chain-of-thought Hierarchy) system.

## Module Overview

### `internal_utils.ts`
Core utilities for building MECH contexts with sensible defaults.

#### Key Functions:

- **`createFullContext(options)`**: Converts simple options to a full MechContext
  - Provides default implementations for all required functions
  - Handles optional features like memory gracefully
  - Main bridge between simple and advanced APIs

- **`createDefaultHistory()`**: Simple in-memory history management
  - Add, get, and clear conversation history
  - Used when no external history system is provided

- **`defaultCreateToolFunction()`**: Creates ensemble-compatible tool functions
  - Converts simple function + description to ToolFunction format
  - Handles parameter type conversion
  - Ensures functions return strings

- **`defaultDateFormat()` & `defaultReadableTime()`**: Time utilities
  - ISO date formatting
  - Human-readable duration formatting (e.g., "2h 15m")

- **`createDefaultCommunicationManager()`**: Simple console-based comms
  - Logs messages to console
  - Provides required communication interface

- **`defaultFormatMemories()`**: Formats memory items as bullet list
  - Simple text representation of memories
  - Used for context enrichment

## Usage in MECH

The utilities are primarily used by the simple API to provide a low-friction interface:

```typescript
// Simple API uses createFullContext internally
const result = await runSimpleMECH({
    agent: { name: 'Bot' },
    task: 'Do something',
    runAgent: myLLMFunction
});

// Advanced API requires full context
const context = createFullContext({
    runAgent: myLLMFunction,
    onHistory: (item) => console.log(item)
});
const result = await runMECHAdvanced(agent, task, context);
```

## Design Philosophy

1. **Sensible Defaults**: Everything works out-of-the-box
2. **Progressive Enhancement**: Add features as needed
3. **Type Safety**: Full TypeScript support
4. **Zero Dependencies**: Only depends on types
5. **Testable**: Pure functions where possible

## Future Utilities

This directory is reserved for additional MECH-specific utilities as the system grows:

- Model selection strategies
- Advanced memory management
- Meta-cognition helpers
- Performance optimizations
- Debug utilities