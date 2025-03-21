# MAGI System (TypeScript Implementation)

This is a TypeScript implementation of the MAGI (Mostly Autonomous Generative Intelligence) system. The MAGI system is a sophisticated AI orchestration framework that leverages LLMs (Large Language Models) and specialized agents to solve complex tasks.

## Features

- **Agent-based Architecture**: Supervisor agent orchestrates specialized worker agents
- **Tool Integration**: Rich set of tools for calculations, file operations, and more
- **Web Search Capabilities**: Real-time search via OpenAI's web_search_preview and Brave Search API
- **Streaming Responses**: Real-time streaming of AI responses
- **Multiple Model Providers**: Support for OpenAI, Claude (Anthropic), Gemini (Google), and Grok (X.AI)
- **Memory Management**: Conversation history persistence across sessions

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   cd magi
   npm install
   ```
3. Create a `.env` file with at least one API key:
   ```
   # At least one of these keys is required
   OPENAI_API_KEY=your_openai_key_here
   ANTHROPIC_API_KEY=your_anthropic_key_here
   GOOGLE_API_KEY=your_google_key_here
   XAI_API_KEY=your_xai_key_here
   
   # Optional: For Brave Search API (when not using OpenAI GPT-4o)
   BRAVE_API_KEY=your_brave_search_api_key_here
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

## Supported Models

The system supports a variety of models from different providers:

### OpenAI Models
- `gpt-4o`: Standard model
- `gpt-4o-mini`: Smaller, faster model
- `o3-mini`: Specialized reasoning model
- `computer-use-preview`: Vision-capable model

### Claude Models (Anthropic)
- `claude-3-7-sonnet-latest`: Advanced model
- `claude-3-5-haiku-latest`: Faster model

### Gemini Models (Google)
- `gemini-pro`: Standard model
- `gemini-pro-vision`: Vision-capable model
- `gemini-2.0-pro`: Latest model
- `gemini-2.0-flash`: Faster model

### Grok Models (X.AI)
- `grok-2`: Latest model
- `grok-1.5-vision`: Vision-capable model

## Architecture

The TypeScript implementation consists of:

- `src/magi.ts`: Main entry point and command processor
- `src/agent.ts`: Agent framework and runner implementation
- `src/model_providers/`: Model provider implementations
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

# Perform a web search for current information
node dist/magi.js --agent search --prompt "What are the latest developments in AI research?"

# Use a specific model from Claude
node dist/magi.js --model claude-3-7-sonnet-latest --prompt "Explain quantum computing in simple terms"

# List all available models
node dist/magi.js --list-models
```

## Extending

To add new agent types or tools:

1. Define the tool implementation in `src/utils/`
2. Create a tool definition following the schema format
3. Add the agent implementation in `src/magi_agents/workers/`
4. Register the agent in `src/magi_agents/index.ts`

To add new model providers:

1. Implement the ModelProvider interface in a new file in `src/model_providers/`
2. Register the provider in `src/model_providers/model_provider.ts`

## License

See the LICENSE file for details.