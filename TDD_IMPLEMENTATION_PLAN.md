# TDD Implementation Plan for magi-system

Based on the analysis of the codebase and the existing tests, here's a comprehensive Test-Driven Development (TDD) strategy for the magi-system:

## 1. Testing Levels and Focus Areas

### Unit Tests
- **Model Providers**: Continue with the approach used in `model_provider.test.ts` focusing on mocking dependencies and testing individual functions.
- **Utility Functions**: Ensure all utility functions in `/magi/src/utils/` have proper unit tests.
- **Browser Interaction**: Test browser utilities by properly mocking the WebSocket connections and browser sessions.
- **Core Business Logic**: Focus on the agent systems and decision-making components.

### Integration Tests
- **Agent Communication**: Test how different agents communicate and collaborate.
- **End-to-End Workflows**: Test complete workflows from user input to final output.
- **Browser Extension Integration**: Test communication between the magi system and browser extension.

## 2. Key Testing Priorities

1. **Model Provider Layer**
   - All model provider implementations should be tested for correct handling of various responses, errors, and edge cases.
   - Tests should verify proper token usage tracking, quota management, and fallback mechanisms.

2. **Agent System**
   - Test the agent orchestration (how overseer agent delegates to specialized agents).
   - Verify agent state management and persistence.
   - Test agent-specific tools and capabilities.

3. **Browser Automation**
   - Test WebSocket connection handling, reconnection logic, and error recovery.
   - Test browser command execution with proper mocking of browser responses.
   - Verify security constraints and validation of inputs.

4. **File System Operations**
   - Test file reading, writing, and management operations.
   - Verify proper error handling for file system operations.

## 3. TDD Implementation Strategy

Follow these steps for implementing TDD across the codebase:

1. **Write the Test First**
   - Define the expected behavior before implementing the actual code.
   - Start with a minimal failing test.

2. **Run the Test (It Should Fail)**
   - Verify that the test fails as expected, indicating that the implementation is needed.

3. **Write the Minimal Implementation**
   - Implement just enough code to make the test pass.
   - Focus on simplicity rather than completeness at this stage.

4. **Run the Test Again (It Should Pass)**
   - Verify that your implementation satisfies the test requirements.

5. **Refactor**
   - Clean up your code while maintaining the passing tests.
   - Improve design, remove duplication, and enhance readability.

6. **Repeat**
   - Continue the cycle for each new feature or behavior.

## 4. Example: Model Provider Tests

The `model_provider.test.ts` file demonstrates a good TDD approach:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getProviderFromModel, getModelProvider, getModelFromClass } from './model_provider.js';
// Import dependencies...

// Mock dependencies
vi.mock('../utils/quota_manager.js', async () => ({
  quotaManager: { hasQuota: vi.fn().mockReturnValue(true) }
}));

// Mock model providers with predictable behavior
vi.mock('./openai.js', () => ({
  openaiProvider: {
    createResponseStream: vi.fn().mockImplementation(async function*() {
      yield { type: 'message_delta', content: 'Hello', message_id: 'msg1', order: 0 };
      yield { type: 'message_complete', content: 'Hello world', message_id: 'msg1' };
    }),
  },
}));

describe('model_provider', () => {
  // Setup and teardown
  beforeEach(() => { /* setup environment */ });
  afterEach(() => { /* cleanup */ });

  // Test specific functions
  describe('getProviderFromModel', () => {
    it('should return openai for GPT models', () => {
      expect(getProviderFromModel('gpt-4o')).toBe('openai');
      // More assertions...
    });
    
    // More tests...
  });
  
  // Test other functions...
});
```

## 5. Next Components to Test

Based on the importance in the system, these should be the next testing targets:

1. **Browser Agent** (`magi/src/magi_agents/common_agents/browser_agent.ts`)
   - Test browser interaction capabilities
   - Verify handling of browser session management
   - Test error handling for browser operations

2. **Reasoning Agent** (`magi/src/magi_agents/common_agents/reasoning_agent.ts`)
   - Test reasoning capabilities
   - Verify response generation and processing
   - Test handling of different input types

3. **Overseer Agent** (`magi/src/magi_agents/overseer_agent.ts`)
   - Test task delegation to specialized agents
   - Verify coordination of complex tasks
   - Test error recovery and fallback mechanisms

4. **TDD Orchestrator** (`magi/src/magi_agents/godel_machine/tdd_orchestrator.ts`)
   - Test the orchestration of test-driven development
   - Verify the generation and evaluation of tests
   - Test the ability to implement code based on tests

## 6. Mocking Strategies

For effective testing, use these mocking approaches:

1. **Mock External APIs**: Use Vitest's mocking capabilities to isolate the component being tested from external dependencies.
   
   ```typescript
   vi.mock('./external_module.js', () => ({
     externalFunction: vi.fn().mockReturnValue('mocked result')
   }));
   ```

2. **Mock File System**: Mock file system operations to avoid actual file I/O during tests.
   
   ```typescript
   vi.mock('fs', () => ({
     readFileSync: vi.fn().mockReturnValue('file content'),
     writeFileSync: vi.fn(),
     existsSync: vi.fn().mockReturnValue(true)
   }));
   ```

3. **Mock Browser Interactions**: Create mock implementations of the browser session to test browser utilities.
   
   ```typescript
   vi.mock('./browser_session.js', () => ({
     getAgentBrowserSession: vi.fn().mockReturnValue({
       navigate: vi.fn().mockResolvedValue('navigation result'),
       get_page_content: vi.fn().mockResolvedValue('page content')
     })
   }));
   ```

## 7. Test Data Management

- Create fixtures for common test data (e.g., model responses, browser states)
- Use shared test utilities (like our `test_mocks.ts`)
- Consider parameterized tests for similar testing logic with different inputs

## 8. Continuous Integration

- Setup Vitest to run in the CI pipeline
- Ensure tests are fast (mock expensive operations)
- Track test coverage metrics
- Make specific test suites runnable in isolation

## 9. TDD Implementation Timeline

1. **Phase 1: Core Utilities**
   - File system operations
   - Browser utilities
   - Model provider interfaces

2. **Phase 2: Agent Systems**
   - Individual agent tests
   - Agent interaction tests
   - Agent tool usage tests

3. **Phase 3: Integration**
   - End-to-end workflows
   - Complex task handling
   - Error recovery paths

By implementing this TDD approach systematically across the codebase, the magi-system will gain:

1. Better reliability and fewer regressions
2. Clearer documentation of expected behavior
3. Easier refactoring and maintenance
4. More confidence when adding new features
