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
- **Telegram Integration**: Two-way communication with Telegram for remote interaction

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

### 2. Setup and Running

#### Docker Setup (Recommended)

```bash
# Run setup (one time only)
./setup.sh

# Start the system
./start.sh

# Stop the system
./stop.sh
```

The setup script will:
- Prompt for your API keys (OpenAI, Anthropic, etc.)
- Configure directory access
- Build the Docker images
- Set up Claude CLI integration

#### Manual Setup

If you prefer to run Docker commands directly:

```bash
# Build and run setup
docker-compose build setup
docker-compose run --rm setup

# Start the system
docker-compose up

# Start in detached mode
docker-compose up -d

# Stop the system
docker-compose down
```

The server will:
1. Start on port 3010 for the web interface
2. Create Docker containers for AI processes as needed

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

### Container Output in Terminal

To see the output of Docker containers directly in your terminal when running the development server, set the `ATTACH_CONTAINER_STDOUT` environment variable to `true`:

```bash
ATTACH_CONTAINER_STDOUT=true npm run dev
```

This will show the real-time output of each container in the terminal where the dev server is running, which is useful for debugging.

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
2. Start the system with `./start.sh`
3. Test your changes (code changes to the controller's src directory will hot reload)
4. For changes to Docker configuration:
   - Stop the system with `./stop.sh`
   - Rebuild with `docker-compose build`
   - Start again with `./start.sh`
5. Fix any errors
6. Repeat until everything works correctly

## Docker Configuration

The MAGI System runs entirely in Docker containers for improved cross-platform compatibility:

### Docker Structure

- `docker/controller/`: Docker configuration for the controller service
- `docker/magi/`: Docker configuration for the AI agent service
- `docker/setup/`: Docker configuration for the setup service

The system is orchestrated by Docker Compose and includes these main components:

1. **Controller Service**: Handles web UI and Docker container orchestration
2. **MAGI Containers**: Dynamically created for each AI process
3. **Setup Service**: Only used during initial setup

### Docker Volumes

- `claude_credentials`: For storing Claude CLI authentication
- `magi_output`: For storing AI-generated files

For detailed Docker information, see [DOCKER.md](DOCKER.md) and [docker/README.md](docker/README.md).

## Telegram Integration

MAGI System supports two-way integration with Telegram for remote interaction:

### Setup Steps

1. **Create a Telegram Bot**:
   - Chat with [@BotFather](https://t.me/botfather) on Telegram
   - Use `/newbot` command to create a new bot
   - Copy the API token provided by BotFather
   - Use `/setprivacy` command and select your bot, then choose "Disable" to allow the bot to see all messages in groups

2. **Configure Environment Variables**:
   - Add to your `.env` file:
   ```
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   TELEGRAM_ALLOWED_CHAT_IDS=123456789,987654321
   ```
   - To get your chat ID, send a message to [@userinfobot](https://t.me/userinfobot)

3. **Test the Integration**:
   - Run the test script: `./test/telegram-test.sh "Hello from MAGI!"`
   - You should receive a message on Telegram

### Usage

- Send messages to your bot on Telegram to forward commands to MAGI
- MAGI will send generated responses back to Telegram
- Messages from MAGI's talk functionality are automatically forwarded to Telegram

### Troubleshooting Telegram Integration

If you're having issues with Telegram integration, follow these troubleshooting steps:

1. **Verify your bot token**:
   ```bash
   curl "https://api.telegram.org/bot<YOUR_TOKEN>/getMe"
   ```
   This should return information about your bot if the token is valid.

2. **Check chat permissions**:
   - Make sure you've started a conversation with your bot first
   - You must send a message to the bot before it can message you

3. **Verify your chat ID**:
   - Send a message to [@userinfobot](https://t.me/userinfobot) to get your ID
   - Ensure this ID is in your `TELEGRAM_ALLOWED_CHAT_IDS` env variable

4. **Test sending a message directly**:
   ```bash
   ./test/telegram-test.sh "Hello world"
   ```

5. **For group chats**:
   - Add the bot to the group
   - Make sure the group ID (not your personal ID) is in `TELEGRAM_ALLOWED_CHAT_IDS`
   - Group IDs are usually negative numbers

6. **Check logs for more details**:
   - Run the system with `npm run dev` and look for `[Telegram]` log messages

## Output Management

The MAGI System stores outputs in a Docker volume named `magi_output`. We provide utility scripts to manage this volume:

### Output Management Scripts

- **List Process Output**: View all processes and their sizes
  ```bash
  ./scripts/list-output.sh
  ```

- **Clear Specific Process**: Remove output for a specific process ID
  ```bash
  ./scripts/clear-process-output.sh AI-12345
  ```

- **Clear All Output**: Remove all data from the `magi_output` volume
  ```bash
  ./scripts/clear-output.sh
  ```

## Troubleshooting

- **Docker Connection Issues**: Ensure Docker is running
- **Permission Errors**: May need sudo/admin for Docker operations
- **API Key Problems**: Verify your OpenAI API key is valid
- **Port Conflicts**: If port 3001 is in use, the system will try alternative ports
- **Windows Docker Network Issues**: Use Docker mode with `start-docker-windows.bat`
- **Telegram Connection Issues**: Verify your bot token and allowed chat IDs

## License

See the [LICENSE](LICENSE) file for details.
