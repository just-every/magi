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
# Create .env file with your API key
echo "OPENAI_API_KEY=your_api_key_here" > .env

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

You can also test individual agents directly with python using:
```bash
test/magi-python.sh -p "your prompt here" -a code
```
Where `code` is the name of the agent you want to test;
`supervisor`, `code`, `browser`, `shell`, `search`, `reasoning` or `worker`.

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
