# MAGI System

> **M**ostly
> **A**utonomous
> **G**enerative
> **I**ntelligence

The MAGI System (pronounced "MAH-jeye") is an ensemble autonomous AI framework designed to solve tasks with almost no human intervention.

It has a persistent chain of thought with a single AI persona Magi (pronounced "Mag-gie") which manages the system orchestration and task management. The system is designed to be modular and fault-tolerant. The core aim is not to solve problems as fast as possible, but in the best way possible by recovering from errors and failures gracefully.

MAGI uses an ensemble of LLM models to provide a more robust and flexible solution. It can switch between different models based on availability, cost, and performance. For it's core chain of thoughts it interleaves models continuously, offers a unique perspective on how to approach problems and helps to resolve the 'stuck in a loop' problem autonomous systems often face.

A core principal of MAGI is self-improvement. By being Open Source and using git internally for code changes, MAGI's goal is to improve itself with each task it performs and bring the best improvements back into the core code base.

Think of Magi like a co-worker. She might make some mistakes, but she learns from them and improves over time. She is not perfect, but she is getting better every day.

## Architecture Overview

Magí consists of four core components:

• **Controller Service** (`controller/`)
  - Node.js (TypeScript) Express backend + Socket.IO
  - React/HTML/CSS frontend (UI at http://localhost:3010)
  - Manages Docker agent containers via Dockerode

• **Magi Agents** (`magi/`)
  - TypeScript runtime executing chain-of-thought loops
  - Tool integrations: browser automation (CDP), shell, web search, code execution
  - Runs in isolated Docker containers (`magi-base` image)
  - Supports multiple LLM providers with fallback and cost tracking

• **Browser Bridge** (`host/`)
  - CLI to launch/kill/toggle Chrome via DevTools Protocol
  - Manages user-data directories, profile cloning and merging
  - Commands: `npm run browser:start|status|kill|toggle|clone-profile|merge-profile`

• **Shared Database** (`db/`)
  - PostgreSQL + pgvector for history, memory, and usage tracking
  - Migrations in `db/migrations`, auto-run on controller startup

## Installation

### Prerequisites

- Node.js v18+ (npm)
- Docker & Docker Compose v2+
- Google Chrome or Chromium (for CDP)
- API keys for OpenAI, Anthropic, Google GenAI, etc.

### Setup

```bash
# Clone the repository
git clone https://github.com/has-context/magi-system.git
cd magi-system

# Install dependencies
npm install

# Run the automated setup
npm run setup

```

## Usage

### Starting the System

```bash
git clone https://github.com/has-context/magi-system.git
cd magi-system
npm install
npm run setup
npm run dev
```

This will:
- Launch a detached CDP Chrome instance
- Build Docker images (controller & magi-base)
- Start Postgres and controller (`docker compose up`)
- Serve the web UI at http://localhost:3010


### Running Tests

```bash
npm test                    # Unit & integration (Vitest)
cd test/playwright && npm install
npm run test:e2e            # End-to-end (Playwright)
```

### Testing Individual Components

```bash
# Test the MAGI Docker backend
test/magi-docker.sh -p "your prompt here"

# Test individual agents directly
test/magi-node.sh -p "your prompt here" -a <agent>
```

Replace `<agent>` with one of: `supervisor`, `code`, `browser`, `shell`, `search`, `reasoning`, or `worker`.

## Development

### Project Structure

```
common/     Shared TS types & templates
db/         Postgres migrations
host/       Browser bridge CLI
controller/ Web UI & container manager
magi/       Agent runtime & model providers
test/       E2E tests (Playwright)
docker-compose.yml
```

### Development Workflow

1. Edit code in `host/`, `controller/`, or `magi/`
2. Lint & type-check:
   ```bash
   npm run lint
   npm run lint:fix
   ```
3. Run tests:
   ```bash
   npm test
   ```
4. Build & run locally:
   ```bash
   npm run dev
   ```

## Key Features

- **Multi-Provider Support**: Works with OpenAI, Claude, Google Gemini, and other LLM providers
- **Fallback Mechanism**: Automatically falls back to alternative models when rate limits are encountered
- **Quota Management**: Tracks usage quotas across providers to optimize cost
- **Streaming Responses**: Real-time streaming of LLM outputs and tool usage
- **Tool Integration**: Agents can use tools like web search, code execution, and browser automation
- **Browser Integration**: Chrome extension allows direct interaction with the web browser
- **Smart Design Search**: Aggregates screenshots from multiple design sources and ranks them automatically
- **Cost Tracking**: Monitors and reports on API usage costs
- **Verifier Agents**: Optional verifier agents can call any tools; failures trigger automatic retries (default 2)
- **Custom Tools API**: Exposes HTTP endpoints for listing and inspecting dynamic tools
- **Custom Tools Viewer**: View and inspect dynamic tools directly in the web UI

## Command Line Utilities

- **List Process Output**: `./scripts/list-output.sh`
- **Clear Process Output**: `./scripts/clear-process-output.sh <process-id>`
- **Clear All Output**: `./scripts/clear-output.sh`

## API Endpoints

- **GET /api/custom-tools** – List all available custom tools
- **GET /api/custom-tools/:name** – Retrieve a specific custom tool by name

## Testing

The system includes a comprehensive testing suite using Playwright:

- **Model Tests**: Tests for model providers and their interactions
- **Agent Tests**: Tests for agent functionality and tool usage
- **Runner Tests**: Tests for agent execution and fallback mechanisms
- **API Tests**: Tests for internal API functionality
- **E2E Tests**: End-to-end tests of system components

The testing framework includes a specialized test provider (`test_provider.ts`) that simulates various LLM behaviors without requiring real API calls.

## License

See the [LICENSE](LICENSE) file for details.
