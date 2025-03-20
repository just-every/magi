# MAGI System

<p align="center">
<strong>M</strong>ostly<br/>
<strong>A</strong>utonomous<br/>
<strong>G</strong>enerative<br/>
<strong>I</strong>ntelligence
</p>

The MAGI System (pronounced “MAH-jeye”) is designed for complex AI automation tasks through a multi-agent architecture. It enables multiple specialized AI agents to work in concert, each focused on different aspects of problem-solving.

## Features

- **Multi-Agent Architecture**: Specialized agents work collaboratively on complex tasks
- **Web-Based Interface**: Real-time interaction and monitoring via browser
- **Docker Integration**: Containerized Python backend for isolation and portability
- **Extensible Framework**: Add new agent types or enhance existing ones
- **Persistent Memory**: Conversations and context maintained between sessions
- **Interactive Sessions**: Send follow-up commands to ongoing processes
- **Real-Time Updates**: Stream results as they become available

## System Architecture

The MAGI System consists of two primary components that work together:

### 1. Node.js Web Server

- **TypeScript/Express Backend**: Type-safe server implementation
- **Socket.IO Integration**: Real-time bidirectional communication
- **Docker Management**: Container creation, monitoring, and cleanup
- **Modern Web Interface**: Interactive UI with process management
- **Auto Port Selection**: Finds available ports automatically

### 2. Python Backend (Docker Container)

- **OpenAI Agents Framework**: Built on the latest agent technologies
- **Agent Specialization**: Purpose-built agents for different tasks
- **Supervisor Orchestration**: Central coordinator for sub-agents
- **FIFO Command Interface**: Pass commands to running containers
- **Stream Processing**: Real-time output streaming

## Agent Capabilities

| Agent | Responsibility | Tools |
|-------|----------------|-------|
| **Supervisor** | Orchestrates other agents | Task planning, delegation |
| **Code** | Programming tasks | Claude CLI integration |
| **Filesystem** | File operations | Shell command execution |
| **Search** | Web research | Web search tools |
| **Browser** | Website interaction | Playwright automation |
| **Self-Optimization** | Code modification | Repo management, code editing |

### Self-Optimization

The MAGI System includes a powerful self-optimization feature that:

1. Analyzes incoming tasks to determine required capabilities
2. Creates a copy of the codebase in a temporary directory
3. Modifies the code to better handle the specific task
4. Tests the modifications thoroughly
5. Executes the task using the optimized code

This enables the system to adapt itself to better handle specific types of tasks, improving performance and capabilities over time. The feature can be enabled or disabled via command-line arguments or environment variables.

## Installation Requirements

- **Node.js**: v16+ (v18+ recommended)
- **Docker**: Latest version
- **OpenAI API Key**: Required for agent capabilities
- **Claude CLI**: Optional but recommended for code tasks

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/has-context/magi-system.git
cd magi-system
```

### 2. Installation Options

#### Automated Setup (Recommended)

```bash
npm run setup
```

This script will:
- Prompt for your OpenAI API key
- Install Node.js dependencies
- Build the Docker image
- Set up Claude CLI integration

#### Manual Setup

```bash

# Install dependencies
npm ci

# Build Docker image
docker build -t magi-system:latest -f magi/docker/Dockerfile .

# Set up Claude integration (if available)
npm run setup-claude
```

### 3. Starting MAGI System

```bash
npm run dev
```

The server will:
1. Start on port 3001 (or the next available port)
2. Open your browser to the web interface automatically
3. Build the Docker image if it doesn't exist

## Usage

### Web Interface

1. **Enter a command in the input field** to start a new process
2. **Monitor real-time progress** as the system works
3. **Send follow-up commands** to active processes
4. **View results directly** in the interface
5. **Terminate processes** if needed

### Command Line Testing

For testing the Docker/Python backend directly:

```bash
test/magi-docker.sh -p "your prompt here"
```

You can also test individual agents directly with node using:
```bash
test/magi-node.sh -p "your prompt here" -a code
```
Where `code` is the name of the agent you want to test;
`supervisor`, `code`, `browser`, `shell`, `search`, `reasoning`, `worker`, or `self-optimization`.

#### Self-Optimization Options

Enable or disable the self-optimization feature using the `--self-optimization` flag:

```bash
test/magi-docker.sh -p "your prompt here" --self-optimization true
test/magi-docker.sh -p "your prompt here" --self-optimization false
```

You can also control this feature using the `MAGI_ENABLE_SELF_OPTIMIZATION` environment variable:

```bash
MAGI_ENABLE_SELF_OPTIMIZATION=false test/magi-docker.sh -p "your prompt here"
```

## Development

### Key Directories

- `/magi/`: Python backend and agent implementation
  - `/magi/magi_agents/`: Specialized agent definitions
  - `/magi/utils/`: Shared utilities
  - `/magi/docker/`: Docker configuration
- `/controller/`: TypeScript server implementation
  - `/controller/client/`: Web interface assets
    - `/controller/client/css/`: Stylesheet files
    - `/controller/client/html/`: HTML templates
    - `/controller/client/utils/`: Client utilities
  - `/controller/server/`: Server implementation
- `/utils/`: Node.js utility scripts
- `/test/`: Testing scripts

### Recent Improvements (2025-03-20)

- **Removed Mock Values**: Eliminated fallback text to ensure genuine LLM responses
- **Enhanced Error Handling**: Full stack traces and proper error propagation
- **Improved Fallback System**: Intelligent model fallbacks with appropriate defaults
- **Fixed Test Scripts**: Better testing workflow and environment setup
- **Reduced Error Suppression**: Exposed previously hidden errors for easier debugging

### Development Workflow

1. Make changes to the code
2. Lint code with `npm run lint`
3. Run server with `npm run dev`
4. Test functionality
5. Fix any errors
6. Repeat until everything works correctly

## Troubleshooting

- **Docker Connection Issues**: Ensure Docker is running
- **Permission Errors**: May need sudo/admin for Docker operations
- **API Key Problems**: Verify your OpenAI API key is valid
- **Port Conflicts**: If port 3001 is in use, the system will try alternative ports

## License

See the [LICENSE](LICENSE) file for details.
