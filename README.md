# MAGI System

<p align="center">
<strong>M</strong>ostly<br/>
<strong>A</strong>utonomous<br/>
<strong>G</strong>enerative<br/>
<strong>I</strong>ntelligence
</p>

The MAGI System (pronounced "MAH-jeye") is a multi-agent AI framework designed for orchestrating specialized AI agents to work on complex tasks collaboratively.

## System Architecture

The system consists of two primary components:

1. **Controller (Node.js Web Server)**
   - TypeScript/Express backend with Socket.IO for real-time communication
   - Docker container management for running AI agents
   - Web interface for interacting with the system

2. **MAGI Agents (TypeScript Backend)**
   - Specialized agents for different tasks (coding, browsing, searching, etc.)
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

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys
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
3. Make the web interface available at http://localhost:3000

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
└── scripts/              # Utility scripts
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
4. Start the system to test manually:
   ```bash
   npm run dev
   ```

### Controller Development

```bash
# Navigate to the controller directory
cd controller

# Build the controller
npm run build

# Start the controller in development mode
npm run dev
```

### MAGI Development

```bash
# Navigate to the magi directory
cd magi

# Build the TypeScript code
npm run build

# Run the MAGI system
npm start
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