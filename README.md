# MAGI System

> **M**ostly **A**utonomous **G**enerative **I**ntelligence

An ensemble autonomous AI framework designed to solve complex tasks with minimal human intervention.

[![GitHub Actions](https://github.com/just-every/magi/workflows/Release/badge.svg)](https://github.com/just-every/magi/actions)
[![CI/CD Build Status](https://github.com/just-every/magi/workflows/CI/CD%20Pipeline/badge.svg)](https://github.com/just-every/magi/actions?query=workflow%3A%22CI%2FCD+Pipeline%22)
[![CI/CD Test Status](https://github.com/just-every/magi/workflows/CI/CD%20Pipeline/badge.svg)](https://github.com/just-every/magi/actions?query=workflow%3A%22CI%2FCD+Pipeline%22)
<!-- Coverage badge will need a dedicated service like Codecov or Coveralls -->

## Overview

The MAGI System (pronounced "MAH-jeye") is an ensemble autonomous AI framework designed to solve tasks with almost no human intervention.

It has a persistent chain of thought with a single AI persona Magi (pronounced "Mag-gie") which manages the system orchestration and task management. The system is designed to be modular and fault-tolerant. The core aim is not to solve problems as fast as possible, but in the best way possible by recovering from errors and failures gracefully.

MAGI uses an ensemble of LLM models to provide a more robust and flexible solution. It can switch between different models based on availability, cost, and performance. For it's core chain of thoughts it interleaves models continuously, offers a unique perspective on how to approach problems and helps to resolve the 'stuck in a loop' problem autonomous systems often face.

A core principal of MAGI is self-improvement. By being Open Source and using git internally for code changes, MAGI's goal is to improve itself with each task it performs and bring the best improvements back into the core code base.

Think of Magi like a co-worker. She might make some mistakes, but she learns from them and improves over time. She is not perfect, but she is getting better every day.

## Features

- 🤖 **Multi-Agent System** - Specialized agents for code, browser, search, shell, and reasoning
- 🔄 **Ensemble LLM** - Automatic model rotation and fallback across providers
- 🧠 **Meta-cognition** - Self-reflection and strategy adjustment
- 🛠️ **Tool Integration** - Browser automation, code execution, web search
- 📊 **Cost Tracking** - Real-time monitoring of API usage and costs
- 🔌 **Custom Tools** - Agents can create and modify tools at runtime
- 🐳 **Containerized** - Isolated Docker environments for each agent
- 🎯 **Fault Tolerant** - Graceful error recovery and retry mechanisms

## Architecture Overview

Magi consists of four core components:

### Controller Service (`controller/`)
- Node.js (TypeScript) Express backend + Socket.IO
- React/HTML/CSS frontend (UI at http://localhost:3010)
- Manages Docker agent containers via Dockerode

### Magi Agents (`engine/`)
- TypeScript runtime executing chain-of-thought loops
- Tool integrations: browser automation (CDP), shell, web search, code execution
- Runs in isolated Docker containers (`magi-engine` image)
- Supports multiple LLM providers with fallback and cost tracking

### Browser Bridge (`host/`)
- CLI to launch/kill/toggle Chrome via DevTools Protocol
- Manages user-data directories, profile cloning and merging
- Commands: `npm run browser:start|status|kill|toggle|clone-profile|merge-profile`

### Shared Database (`db/`)
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
git clone https://github.com/just-every/magi.git
cd magi

# Install dependencies
npm install

# Run the automated setup
npm run setup

```

## Usage

### Starting the System

```bash
git clone https://github.com/just-every/magi.git
cd magi
npm install
npm run setup
npm run dev
```

This will:
- Launch a detached CDP Chrome instance
- Build Docker images (controller & magi-engine)
- Start Postgres and controller (`docker compose up`)
- Serve the web UI at http://localhost:3010

### Project Containers

If a task references a project, its Dockerfile is built and started automatically. The controller exposes running service ports via the `PROJECT_PORTS` environment variable. Agents can inspect this mapping using `getProcessProjectPorts()` to open the project at `http://localhost:<port>`.


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
engine/     Agent runtime & model providers
test/       E2E tests (Playwright)
docker-compose.yml
```

### Development Workflow

1. Edit code in `host/`, `controller/`, or `engine/`
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

### Development Options

#### Docker Development (Full System)
From the root directory:
```bash
npm run dev  # Builds and runs everything in Docker
```
This is the production-like environment with all services containerized.

#### Local Development (Without Docker)

For faster development iteration, you can run the controller and task modules directly:

**Controller Development:**
```bash
cd controller
cp .env.example .env  # First time only
npm install           # First time only
./start-dev.sh        # Or npm run dev
```
This starts the controller with auto-reload on file changes at http://localhost:3010

**Engine (Agent) Development:**
```bash
cd engine
cp .env.example .env  # Configure API keys
npm install          # First time only
./start-dev.sh       # Watch mode
# Or run specific agent:
./start-dev.sh --agent browser "search TypeScript"
```

**Note:** The package.json scripts in subdirectories have been updated:
- `npm run dev` - For local development with hot reload
- `npm run start:docker` - For Docker builds (used by root npm run dev)

See `controller/README.dev.md` and `engine/README.dev.md` for detailed local development guides.

## Advanced Features

- **Multi-Provider Support**: Works with OpenAI, Claude, Google Gemini, and other LLM providers
- **Fallback Mechanism**: Automatically falls back to alternative models when rate limits are encountered
- **Quota Management**: Tracks usage quotas across providers to optimize cost
- **Streaming Responses**: Real-time streaming of LLM outputs and tool usage
- **Tool Integration**: Agents can use tools like web search, code execution, and browser automation
- **Browser Integration**: Chrome extension allows direct interaction with the web browser
- **Smart Design Search**: Aggregates screenshots from multiple design sources and ranks them automatically
- **Design Asset Collage**: Automatically builds a numbered collage of recent design assets
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

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`feat/your-feature`)
3. Follow conventional commits
4. Add tests for new functionality
5. Submit a pull request

See our contributing guidelines for more details.

## Troubleshooting

### Common Issues

- **Docker not running**: Ensure Docker Desktop is running
- **Port conflicts**: Check ports 3010 (UI) and 5432 (PostgreSQL)
- **API key errors**: Verify your `.env` file has valid keys
- **Chrome not found**: Run `npm run browser:start` to launch Chrome

### Getting Help

- Check the [documentation](docs/)
- Open an [issue](https://github.com/just-every/magi/issues)
- Join our [Discord community](https://discord.gg/justevery)

## License

See the [LICENSE](LICENSE) file for details.
