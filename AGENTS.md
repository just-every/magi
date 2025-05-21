# Project Overview
MAGI System is a modular, autonomous AI orchestration framework. It coordinates specialized agents (Browser, Code, Search, Shell, Reasoning, etc.) through a central Overseer running on Node.js. A React frontend lets users monitor tasks in real-time while Socket.IO keeps the browser, controller, and agents in sync.

## Setup
Run these before you start work
```bash
npm install            # install all dependencies
npm run build:ci       # build in a ci environment to ensure the code compiles
npm run setup          # set up Chrome and volumes
```

## Quality gate
Run these once you finish any task and fix any error that show up. Always fix the underlying error, do not add placeholder, mock code or just suppress errors.
```bash
npm run lint:fix    # fix linting issues
npm run build:ci    # ensure tools are working
```

## Core Modules & Files
- controller/: Gateway between browser UI and Overseer (Node + TypeScript)
  - src/server/server.ts – Express/Socket.IO server entry // Server initialization
  - src/client/ – React UI code with components // User interface
- magi/: Core orchestration logic for agents
  - src/magi.ts – Main bootstrapping entry for the Overseer // Entry point
  - src/magi_agents/ – Specialized agent implementations // Agent definitions
  - src/model_providers/ – LLM providers (Claude, GPT, Gemini, etc.) // Model APIs
- common/: Shared TypeScript utilities and types // Common interfaces
- host/: Browser bridge for Chrome automation via CDP // Chrome control
- db/: PostgreSQL migrations and schema with pgvector support // Database
- templates/: Project templates for various types // Project scaffolding
- docker-compose.yml – Container orchestration // Service definitions

## `project_map.json`
// Quick reference for project structure
High-level machine-readable index of the repository. Use it to quickly locate entry points, key directories, and common commands.

## Build Process
// Container-based architecture
The system relies on Docker for reproducible environments. Use `npm run build` to compile TypeScript and build the images.
- `npm run build:host` – compile host utilities only
- `npm run build:docker` – build controller and magi images

## Common Bash Commands
```bash
# Development
npm install            # install all workspaces
npm run setup          # configure Chrome and shared volumes
npm run dev            # start watchers and Docker services

# Building
npm run build          # compile TypeScript bundles
npm run build:docker   # build controller and magi images
npm run build:host     # compile host utilities

# Browser Control
npm run browser:start  # launch Chrome for browser agent
npm run browser:kill   # kill Chrome instances
npm run browser:status # check Chrome status
npm run browser:toggle # toggle Chrome visibility
npm run browser:clone-profile  # clone Chrome profile
npm run browser:test-connection # test CDP connection

# Testing
npm test               # run unit tests (Vitest)
npm run test:watch     # watch for changes and run tests
npm run test:ui        # run tests with UI
npm run test:e2e       # run E2E tests (Playwright)
npm run test:e2e:ui    # run E2E tests with UI
npm run test:tools     # execute example custom tools
npm run test:js-tools  # execute JavaScript tools

# Database
docker compose up -d db # spin up Postgres & pgvector
```

## Code Style Guidelines
// Follow these conventions
- TypeScript strict mode; run `npm run lint` (ESLint)
- Prettier enforced via pre-commit hooks
- Use path aliases for imports (defined in tsconfig.json)
- Organize imports alphabetically
- Use snake_case for variable names
- Use PascalCase for class names and interfaces
- Use camelCase for function names and properties

## Testing Instructions
// Test first, then code
- Unit tests with Vitest in `test/`
- E2E tests with Playwright in `test/playwright/`
- Example custom tools in `test/tools` (run via `npm run test:tools`)
- Integration tests for individual agents with `test/magi-docker.sh`
- See `docs/TESTING.md` for advanced scenarios

## Repository Etiquette
// Follow these git practices
- Branch names: `feat/<ticket>`, `fix/<issue>`
- Conventional Commits required
- PRs must pass CI and require at least one approving review
- Keep PR descriptions detailed with testing steps

## Developer Environment Setup
// Quick start guide
1. `cp .env.example .env` and fill in API keys
2. `npm install`
3. `npm run setup`    # builds host tools and prepares Chrome
4. `docker compose up -d db`
5. `npm run dev` – open http://localhost:3010

## Project-Specific Warnings
// Important cautions
- Do NOT commit real API keys. `.env` is git-ignored.
- Heavy tasks may consume OpenAI/Anthropic quotas quickly.
- Agent containers require proper configuration in docker-compose.yml.
- Browser automation requires Chrome to be installed.

## Key Utility Functions / APIs
// Most important functions
- `magi/src/utils/runner.ts` – Core agent runner
- `magi/src/utils/history.ts` – Conversation history management
- `magi/src/utils/memory.ts` – Memory persistence
- `magi/src/utils/custom_tool_utils.ts` – Dynamic tool creation
- `magi/src/model_providers/` – LLM API wrappers
- `controller/src/server/docker_interface.ts` – Container management

## Agent Implementation
// Agent architecture
- Overseer: Central coordinator (magi/src/magi_agents/overseer_agent.ts)
- Operator: Task breakdown and assignment (magi/src/magi_agents/operator_agent.ts)
- Browser: Web interaction via CDP (magi/src/magi_agents/common_agents/browser_agent.ts)
- Code: Programming across languages (magi/src/magi_agents/common_agents/code_agent.ts)
- Search: Information retrieval (magi/src/magi_agents/common_agents/search_agent.ts)
- Shell: System command execution (magi/src/magi_agents/common_agents/shell_agent.ts)
- Reasoning: Complex problem solving (magi/src/magi_agents/common_agents/reasoning_agent.ts)

## Special Features
// Advanced capabilities
- MECH (Meta-cognition Ensemble Chain-of-thought Hierarchy) - Intelligent model selection
- Custom Tools - Dynamic tool creation and modification by agents at runtime
- Browser control - CDP-based browser automation
- Multi-provider support - Works with various LLM providers with automatic fallback
- Project Templates - Ready-to-use templates for different project types

## Error Handling
// Handle errors properly
- Wrap async operations in try/catch blocks
- Use proper error types and messages
- Log errors with appropriate context
- Handle graceful degradation for agent failures
- Implement fallback strategies for external services

## Debugging
// Troubleshooting guide
- Check controller logs: `docker logs magi-controller`
- Inspect agent logs: `docker logs <agent-container-id>`
- View browser console for client errors
- Use `console.log` sparingly, prefer structured logging
- For Chrome CDP issues, check `npm run browser:status`