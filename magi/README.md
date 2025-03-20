# MAGI System (TypeScript Implementation)

This is a TypeScript implementation of the MAGI (Mostly Autonomous Generative Intelligence) system. The MAGI system is a sophisticated AI orchestration framework that leverages LLMs (Large Language Models) and specialized agents to solve complex tasks.

## Features

- **Agent-based Architecture**: Supervisor agent orchestrates specialized worker agents
- **Tool Integration**: Rich set of tools for calculations, file operations, and more
- **Streaming Responses**: Real-time streaming of AI responses
- **OpenAI Integration**: Uses OpenAI's latest response API for high-quality completions
- **Memory Management**: Conversation history persistence across sessions

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   cd magi
   npm install
   ```
3. Create a `.env` file with your OpenAI API key:
   ```
   OPENAI_API_KEY=your_api_key_here
   ```
4. Build the TypeScript code:
   ```bash
   npm run build
   ```

## Usage

Run the MAGI system with a prompt:

```bash
node dist/magi.js --prompt "Your prompt here"
```

Or with a base64-encoded prompt:

```bash
node dist/magi.js --base64 "base64EncodedPrompt"
```

### Command Line Options

- `-p, --prompt <string>`: The text prompt to process
- `-b, --base64 <string>`: Base64-encoded prompt text
- `-a, --agent <string>`: Agent type to use (default: supervisor)
- `-m, --model <string>`: Force a specific model
- `-t, --test`: Run in test mode without waiting for additional commands
- `-d, --debug`: Enable debug output
- `--list-models`: List all available models and exit

## Architecture

The TypeScript implementation follows the same architecture as the Python version:

- `src/magi.ts`: Main entry point and command processor
- `src/agent.ts`: Agent framework and runner implementation
- `src/utils/`: Utility modules (tools, file operations, etc.)
- `src/magi_agents/`: Agent implementations
  - `supervisor_agent.ts`: Main orchestration agent
  - `workers/`: Specialized worker agents (reasoning, code, etc.)

## Example

```bash
# Run a simple calculation task
node dist/magi.js --prompt "Calculate the area of a circle with radius 5"

# Run a code generation task with a specific agent
node dist/magi.js --agent code --prompt "Write a TypeScript function to check if a string is a palindrome"

# Use a specific model
node dist/magi.js --model gpt-4o --prompt "Explain quantum computing in simple terms"
```

## Extending

To add new agent types or tools:

1. Define the tool implementation in `src/utils/`
2. Create a tool definition following the schema format
3. Add the agent implementation in `src/magi_agents/workers/`
4. Register the agent in `src/magi_agents/index.ts`

## License

See the LICENSE file for details.
