# Project Overview
MAGI System is a modular, autonomous AI orchestration framework. It coordinates specialized agents (Browser, Code, Search, Shell, Reasoning, etc.) through a central Overseer running on Node.js. A React frontend lets users monitor tasks in real-time while Socket.IO keeps the browser, controller, and agents in sync.

## Core Modules & Files
- controller/: Gateway between browser UI and Overseer (Node + TypeScript)
  - src/server/server.ts – Express/Socket.IO server entry
  - src/client/ – React UI code with components for messages, canvas, and columns
- magi/: Core orchestration logic for agents
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
- Branch names: `feat/<ticket>`, `fix/<issue>`
- Conventional Commits required
- PRs must pass CI and require at least one approving review
- Keep PR descriptions detailed with testing steps

## Developer Environment Setup
1. `cp .env.example .env` and fill in API keys
2. `npm install`
3. `npm run setup`    # builds host tools and prepares Chrome
4. `docker compose up -d db`
5. `npm run dev` – open http://localhost:3010

## Project-Specific Warnings
- Do NOT commit real API keys. `.env` is git-ignored.
- Heavy tasks may consume OpenAI/Anthropic quotas quickly.
- Agent containers require proper configuration in docker-compose.yml.
- Browser automation requires Chrome to be installed.

## Key Utility Functions / APIs
- `magi/src/utils/runner.js` – Core agent runner
- `magi/src/utils/history.js` – Conversation history management
- `magi/src/utils/memory.js` – Memory persistence
- `magi/src/utils/custom_tool_utils.js` – Dynamic tool creation
- `magi/src/model_providers/` – LLM API wrappers
- `controller/src/server/docker_interface.ts` – Container management

## Special Features
- MECH (Meta-cognition Ensemble Chain-of-thought Hierarchy) - Intelligent model selection
- Custom Tools - Dynamic tool creation and modification by agents at runtime
- Browser control - CDP-based browser automation
- Multi-provider support - Works with various LLM providers with automatic fallback
- Project Templates - Ready-to-use templates for different project types

## Imports & Layered Memory
@docs/MECH.md
@docs/CUSTOM_TOOLS.md
@docs/TESTING.md
@docs/TODO.md
@POSTGRES.md