# Running Tests in magi-system

Based on the package.json and vitest.config.ts files, here are the different ways to run tests in the magi-system:

## Basic Test Commands

### Run All Tests Once

To run all tests in the project once:

```bash
npm test
```

This is aliased to `vitest run` and will execute all tests matching the patterns in vitest.config.ts, including:
- magi/src/**/*.{test,spec}.{ts,tsx}
- controller/src/**/*.{test,spec}.{ts,tsx}
- browser/extension/src/**/*.{test,spec}.{ts,tsx}
- browser/bridge/**/*.{test,spec}.{ts,tsx}
- setup/**/*.{test,spec}.{ts,tsx}

### Watch Mode

To run tests in watch mode (tests automatically re-run when files change):

```bash
npm run test:watch
```

This runs `vitest` without the run command, enabling interactive watch mode.

### UI Mode

For a visual UI to run and debug tests:

```bash
npm run test:ui
```

This runs Vitest with the UI interface, making it easier to navigate and debug tests visually.

### Code Coverage

To run tests with code coverage reports:

```bash
npm run test:coverage
```

This will generate coverage reports in text, JSON, and HTML formats.

### End-to-End Tests

To run end-to-end tests with Playwright:

```bash
npm run test:e2e
```

This runs the Playwright tests located in the test/playwright directory.

## Running Specific Tests

### Run Tests in a Specific File

To run tests from a specific file:

```bash
npx vitest run magi/src/model_providers/model_provider.test.ts
```

### Run Tests Matching a Pattern

To run tests that match a specific pattern:

```bash
npx vitest run --testNamePattern="should return openai for GPT models"
```

### Run Tests in a Specific Directory

To run all tests in a specific directory:

```bash
npx vitest run magi/src/model_providers/
```

## Debugging Tests

For debugging tests, you can:

1. Use the UI mode for visual debugging:
```bash
npm run test:ui
```

2. Add `console.log()` statements to see values during test execution.

3. Use the node inspector by running:
```bash
node --inspect-brk node_modules/.bin/vitest run magi/src/model_providers/model_provider.test.ts
```

Then connect to the debugger in Chrome by navigating to chrome://inspect.

## Test Configuration

The test configuration is defined in `vitest.config.ts`, which includes:

- Test file patterns
- Environment settings (Node.js for server code, jsdom for browser code)
- Module aliases for import paths
- Coverage settings

## Best Practices

1. **Create Isolated Tests**: Make sure tests don't depend on each other
2. **Mock External Dependencies**: Use Vitest's mocking capabilities
3. **Group Related Tests**: Use describe blocks to organize tests by functionality
4. **Clear Setup and Teardown**: Use beforeEach and afterEach for consistent test state
5. **Review Test Output**: Pay attention to failed tests and fix them before moving forward

## Troubleshooting

If you encounter issues running tests:

1. Check that all dependencies are installed: `npm install`
2. Verify the test file follows proper naming conventions (*.test.ts or *.spec.ts)
3. Ensure the test file is in a directory included in the vitest.config.ts patterns
4. For errors about missing modules, check import paths and module resolution
