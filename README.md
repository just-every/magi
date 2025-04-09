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

## System Architecture

The system consists of two primary components:

1. **Controller (Node.js Web Server)**
   - TypeScript/Express backend with Socket.IO for real-time communication
   - Docker container management for running AI agents
   - Web interface for interacting with the system
   - Provides a secure interface with host system (LLMs do not have direct access to the host)

2. **MAGI Agents (TypeScript Backend)**
   - Specialized agents for different tasks (coding, browsing, searching, etc.)
   - Runs in Docker containers for isolation and resource management
   - Modular design for easy extension
   - Supports multiple LLM providers

## Installation

### Prerequisites

- Node.js (v18+ recommended)
- Docker
- API keys for supported LLM providers (OpenAI, Anthropic Claude, Google Gemini, etc.)

### Setup

```bash
# Clone the repository
git clone https://github.com/has-context/magi-system.git
cd magi-system

# Run setup
npm run setup
```

## Usage

### Starting the System

```bash
# Build Docker images and start the system
npm run dev
```

This will:
1. Build the Docker images for the controller and MAGI base
2. Start the system with Docker Compose
3. Make the web interface available at http://localhost:3011

### Running Tests

```bash
# Install Playwright dependencies (first time only)
npm run test:install

# Run automated tests
npm test

# Run tests with UI for debugging
npm run test:ui
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
magi-system/
├── controller/           # Node.js web server & client
│   ├── client/           # Frontend TypeScript/CSS/HTML
│   │   ├── css/          # Stylesheet files
│   │   ├── html/         # HTML templates
│   │   └── js/           # Client-side TypeScript
│   └── server/           # Server TypeScript files
├── magi/                 # Agent implementation
│   ├── src/              # TypeScript source code
│   │   ├── magi_agents/  # Agent implementations
│   │   └── model_providers/ # LLM provider integrations
│   └── docker/           # Docker configuration
├── test/                 # Testing infrastructure
│   └── playwright/       # Automated tests
├── scripts/              # Utility scripts
└── setup/                # Setup scripts
```

### Development Workflow

1. Make code changes
2. Run linting to check for errors:
   ```bash
   npm run lint        # Check for errors
   npm run lint:fix    # Fix automatically fixable errors
   ```
3. Run tests to verify functionality:
   ```bash
   npm test
   ```
4. Start the system:
   ```bash
   npm run dev
   ```

## Key Features

- **Multi-Provider Support**: Works with OpenAI, Claude, Google Gemini, and other LLM providers
- **Fallback Mechanism**: Automatically falls back to alternative models when rate limits are encountered
- **Quota Management**: Tracks usage quotas across providers to optimize cost
- **Streaming Responses**: Real-time streaming of LLM outputs and tool usage
- **Tool Integration**: Agents can use tools like web search, code execution, and browser automation
- **Cost Tracking**: Monitors and reports on API usage costs

## Command Line Utilities

- **List Process Output**: `./scripts/list-output.sh`
- **Clear Process Output**: `./scripts/clear-process-output.sh <process-id>`
- **Clear All Output**: `./scripts/clear-output.sh`

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
