# Project Overview
MAGI System is a modular, autonomous AI orchestration framework. It coordinates specialized agents (Browser, Code, Search, Shell, Reasoning, etc.) through a central Overseer running on Node.js. A React frontend lets users monitor tasks in real-time while Socket.IO keeps the browser, controller, and agents in sync.

## Core Modules & Files
- controller/: Gateway between browser UI and Overseer (Node + TypeScript)
  - src/server/server.ts – Express/Socket.IO server entry
  - src/client/ – React UI code with components for messages, canvas, and columns
- engine/: Core orchestration logic for agents
  - src/magi.ts – Main bootstrapping entry for the Overseer
  - src/magi_agents/ – Specialized agent implementations (browser, code, search, etc.)
  - src/model_providers/ – LLM providers (Claude, GPT, Gemini, Deepseek, Grok, OpenRouter)
- common/: Shared TypeScript utilities and types
- host/: Browser bridge for Chrome automation via CDP
- db/: PostgreSQL migrations and schema with pgvector support
- templates/: Project templates for various types (web-app, web-static, desktop-app, game-2d, game-3d, mobile-app)
- docker-compose.yml – Container orchestration for magi, controller, and db services

## `project_map.json`
High-level machine-readable index of the repository. Use it to quickly locate entry points, key directories, and common commands. Contains detailed information about agents, model providers, features, and project structure.

## Build Process
The system relies on Docker for reproducible environments. Use `npm run build` to compile TypeScript and build the images.
- `npm run build:host` – compile host utilities only
- `npm run build:docker` – build controller and magi images

## Common Bash Commands
```bash
npm install            # install all workspaces
npm run setup          # configure Chrome and shared volumes
npm run dev            # start watchers and Docker services
npm run build          # compile TypeScript bundles
npm run build:docker   # build controller and magi images
npm run build:host     # compile host utilities
npm run browser:start  # launch Chrome for browser agent
npm run browser:kill   # kill Chrome instances
npm run browser:status # check Chrome status
npm run browser:toggle # toggle Chrome visibility
npm test               # run unit tests (Vitest)
npm run test:e2e       # run E2E tests (Playwright)
npm run test:tools     # execute example custom tools
npm run test:js-tools  # execute JavaScript tools
npm run update:all     # update packages in root, controller, and engine directories
                       # IMPORTANT: Claude should ALWAYS use this command when updating packages
docker compose up -d   # spin up Postgres & pgvector
```

## Code Style Guidelines
- TypeScript strict mode; run `npm run lint` (ESLint)
- Prettier enforced via Husky pre-commit hooks
- Commit hooks ensure formatting & tests pass
- Use absolute imports with path aliases defined in tsconfig.json

## Testing Instructions
- Unit tests with Vitest in `test/`
- E2E tests with Playwright in `test/playwright/`
- Example custom tools in `test/tools` (run via `npm run test:tools`)
- JavaScript tools testing via `npm run test:js-tools`
- Integration tests for individual agents with `test/magi-docker.sh`
- See `docs/TESTING.md` for advanced scenarios

## Repository Etiquette
- Branch names follow pattern: `feat/<ticket>`, `fix/<issue>`
- Conventional Commits required (e.g., "feat: add new agent capability")
- PRs must pass CI and require at least one approving review
- Keep PR descriptions detailed with testing steps
- All packages under `@just-every/` are owned by this project - fix issues rather than work around them

## Developer Environment Setup
1. `cp .env.example .env` and fill in API keys
2. `npm install`
3. `npm run setup`    # builds host tools and prepares Chrome
4. `docker compose up -d db`
5. `npm run dev` – open http://localhost:3010

### Code Provider Setup (Optional)
To use specialized code generation providers, install the corresponding CLI tools:
- **Claude Code**: Install from https://github.com/anthropics/claude-code (requires Claude API key)
- **Codex**: Install OpenAI Codex CLI (requires OpenAI API key)
- **Gemini CLI**: Install from https://github.com/google-gemini/gemini-cli (requires Gemini API key or Google auth)

#### Setup Commands:
```bash
# Agent-assisted setup (automatically detects and opens auth URLs)
npm run setup:agent claude    # Claude with agent assistance
npm run setup:agent gemini    # Gemini with agent assistance

# Individual provider setup
npm run setup:claude    # Claude Code setup (Docker-based)
npm run setup:gemini    # Gemini CLI setup (interactive)

# Test CLI authentication flow (for debugging)
npm run setup:test-cli claude
npm run setup:test-cli gemini
```

#### Manual Setup:
- **Gemini CLI**: 
  1. Create `~/.gemini/settings.json` with `{"authMethod": "api_key", "apiKey": "YOUR_KEY"}`
  2. Or set environment variable: `GEMINI_API_KEY=YOUR_KEY`
  3. Get API key from: https://aistudio.google.com/apikey

- **Claude Code**: Run `claude` and follow the interactive prompts

## Package Management
- **ALWAYS** use `npm run update:all` when updating packages - this ensures all workspaces (root, controller, task) are updated together
- Never use `npm update` alone as it only updates the current directory
- The project has multiple package.json files in different directories that must stay in sync

## Project-Specific Warnings
- Do NOT commit real API keys. `.env` is git-ignored.
- Heavy tasks may consume OpenAI/Anthropic quotas quickly.
- Agent containers require proper configuration in docker-compose.yml.
- Browser automation requires Chrome to be installed.

## Key Utility Functions / APIs
- `engine/src/utils/runner.ts` – Core agent runner
- `engine/src/utils/history.ts` – Conversation history management
- `engine/src/utils/memory.ts` – Memory persistence
- `engine/src/utils/custom_tool_utils.ts` – Dynamic tool creation
- `engine/src/model_providers/` – LLM API wrappers
- `controller/src/server/docker_interface.ts` – Container management

## Agent Implementation
- Overseer: Central coordinator (engine/src/magi_agents/overseer_agent.ts)
- Operator: Task breakdown and assignment (engine/src/magi_agents/operator_agent.ts)
- Browser: Web interaction via CDP (engine/src/magi_agents/common_agents/browser_agent.ts)
- Code: Programming across languages (engine/src/magi_agents/common_agents/code_agent.ts)
- Search: Information retrieval (engine/src/magi_agents/common_agents/search_agent.ts)
- Shell: System command execution (engine/src/magi_agents/common_agents/shell_agent.ts)
- Reasoning: Complex problem solving (engine/src/magi_agents/common_agents/reasoning_agent.ts)

## Special Features
- MECH (Meta-cognition Ensemble Chain-of-thought Hierarchy) - Intelligent model selection
- Custom Tools - Dynamic tool creation and modification by agents at runtime
- Browser control - CDP-based browser automation
- Multi-provider support - Works with various LLM providers with automatic fallback
- Project Templates - Ready-to-use templates for different project types
- Code Providers - Specialized CLI-based code generation tools:
  - **Claude Code** - Anthropic's Claude CLI with concurrency control and fallback to Codex
  - **Codex** - OpenAI's code generation CLI tool
  - **Gemini CLI** - Google's Gemini CLI for code generation

## Architecture Overview
- **Controller Service** - Node.js Express backend + Socket.IO + React frontend
- **Magi Agents** - TypeScript runtime executing chain-of-thought loops in Docker
- **Browser Bridge** - CLI to launch/kill/toggle Chrome via DevTools Protocol
- **Shared Database** - PostgreSQL + pgvector for history, memory, and usage tracking

## Pre-Commit Requirements

**IMPORTANT**: Always run these commands before committing:

```bash
npm test          # Run unit tests
npm run lint      # Check linting
npm run build     # Ensure all packages build
```

Only commit if all commands succeed without errors.

## TypeScript Configuration

- Workspaces with shared tsconfig
- Strict mode enabled in most packages
- Path aliases for clean imports
- ES modules with proper extensions

## Troubleshooting

### Common Issues

- **Docker errors**: Ensure Docker Desktop is running
- **Port conflicts**: Check 3010 (UI) and 5432 (DB) are free
- **Chrome issues**: Run `npm run browser:kill` to cleanup
- **Build failures**: Try `npm run clean` then rebuild

### Debug Mode

Enable verbose logging:
```bash
DEBUG=magi:* npm run dev
```

## Additional Documentation

The following files contain detailed information about specific aspects:

- `docs/MECH.md` - Meta-cognition and model selection system
- `docs/CUSTOM_TOOLS.md` - Dynamic tool creation and management
- `docs/TESTING.md` - Testing framework and strategies
- `docs/TODO.md` - Roadmap and planned features
- `POSTGRES.md` - Database setup and management