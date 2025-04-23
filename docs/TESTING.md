# MAGI System Testing

This directory contains test scripts and frameworks for testing the MAGI System.

## Test Directories

- `playwright/`: Comprehensive test suite using Playwright for automated testing
- `magi-docker.sh`: Script to test the magi Docker backend
- `telegram-test.sh`: Script to test Telegram integration

## Running Tests

### Automated Test Suite

To run the full automated test suite:

```bash
npm test
```

or with the UI:

```bash
npm run test:ui
```

See the `test/playwright/README.md` for more details on running specific tests.

### Docker Backend Test

To test the magi Docker backend:

```bash
test/magi-docker.sh -p "your prompt here"
```

### Agent Tests

To test individual agents directly:

```bash
test/magi-docker.sh -p "your prompt here" -a <agent>
```

Replace `<agent>` with one of:

- `supervisor`
- `code`
- `browser`
- `shell`
- `search`
- `reasoning`
- `worker`

## Test Provider

The automated tests include a specialized test provider (`test_provider.ts`) that simulates various LLM behaviors without requiring real API calls. This enables testing scenarios like:

- Rate limiting and error handling
- Quota management
- Model fallback behavior
- Tool calling
- Cost tracking

## Adding New Tests

See the `test/playwright/README.md` for details on adding new tests to the automated test suite.
