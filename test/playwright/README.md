# MAGI System Tests

This directory contains automated tests for the MAGI System using Playwright.

## Test Structure

Tests are organized into the following categories:

- `api/` - Tests for the internal API calls and services
- `models/` - Tests for model providers and their behavior
- `agents/` - Tests for agent functionality and tools
- `runner/` - Tests for agent runner mechanisms
- `e2e/` - End-to-end tests of larger system behaviors

## Running Tests

To run the tests, you need to have Node.js installed. Then:

1. Install dependencies:
   ```bash
   npm run test:install
   ```

2. Run all tests:
   ```bash
   npm test
   ```

3. Run with UI for debugging:
   ```bash
   npm run test:ui
   ```

4. Run specific test suites:
   ```bash
   # API tests
   npm run test:api
   
   # Model tests
   npm run test:models
   
   # Agent tests
   npm run test:agents
   
   # Runner tests
   npm run test:runner
   
   # E2E tests
   npm run test:e2e
   ```

## Test Provider

The test suite includes a `test_provider.ts` module that simulates various LLM model behaviors for testing without requiring real API calls. 

Key features of the test provider:
- Simulate rate limiting (HTTP 429)
- Simulate errors
- Simulate tool calls
- Simulate thinking in reasoning agents
- Track token usage for cost calculation
- Control response content and timing

## Controlling Test Behavior

You can configure the test provider for specific test cases:

```ts
import { test } from '../../utils/test-utils';
import { testProviderConfig } from '../../../../magi/src/model_providers/test_provider.js';

test('should simulate specific behavior', async ({ configureTestProvider }) => {
  // Configure the test provider for this test
  configureTestProvider({
    fixedResponse: 'Custom response for testing',
    streamingDelay: 10,
    simulateToolCall: true,
    toolName: 'web_search'
  });
  
  // Run your test...
});
```

## Adding New Tests

To add a new test:

1. Create a new test file in the appropriate directory
2. Import the extended test utilities:
   ```ts
   import { test, expect } from '../../utils/test-utils';
   ```
3. Use Playwright's test structure with our extensions
4. Use the `configureTestProvider` fixture to control test behavior

## Test Utilities

The test suite includes several utilities to help with testing:

- `configureTestProvider`: Configure the test provider behavior
- `createTempFile`: Create temporary test files
- `waitForOutput`: Wait for specific content in output files