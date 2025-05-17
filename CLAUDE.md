# Project Overview
MAGI System is a modular, autonomous AI orchestration framework. It coordinates specialized agents (Browser, Code, Search, etc.) through a central Overseer running on Node.js. A React frontend lets users monitor tasks in real-time while Socket.IO keeps the browser, controller, and agents in sync.

## Core Modules & Files
- controller/: Gateway between browser UI and Overseer (Node + TypeScript)
  - src/server/server.ts – Express/Socket.IO server entry
  - src/client/ – React UI code
- magi/: Core orchestration logic for agents
  - src/magi.ts – Main bootstrapping entry for the Overseer
  - src/magi_agents/ – Specialized agent implementations
  - src/model_providers/ – LLM providers (Anthropic, OpenAI, Google)
- common/: Shared TypeScript utilities and types
- host/: Browser bridge for Chrome automation via CDP
- db/: PostgreSQL migrations and schema
- docker-compose.yml – Container orchestration

## `project_map.json`
High-level machine-readable index of the repository. Use it to quickly locate entry points, key directories, and common commands.

## Common Bash Commands
```bash
npm install            # install all workspaces
npm run dev            # concurrently start React UI & backend watchers
npm run build          # compile TypeScript bundles
npm run browser:start  # launch Chrome for browser agent
vitest                 # run unit tests
npm run test:e2e       # run E2E tests
docker compose up -d   # spin up Postgres & pgvector
```

## Code Style Guidelines
- TypeScript strict mode; run `npm run lint` (ESLint)
- Prettier enforced via Husky pre-commit hooks
- Commit hooks ensure formatting & tests pass

## Testing Instructions
- Unit tests with Vitest in `test/`
- E2E tests with Playwright in `test/playwright/`
- Integration tests for individual agents with `test/magi-docker.sh`

## Repository Etiquette
- Branch names: `feat/<ticket>`, `fix/<issue>`
- Conventional Commits required
- PRs must pass CI and require at least one approving review

## Developer Environment Setup
1. `cp .env.example .env` and fill in API keys
2. `npm install`
3. `docker compose up -d db`
4. `npm run dev` – open http://localhost:3010

## Project-Specific Warnings
- Do NOT commit real API keys. `.env` is git-ignored.
- Heavy tasks may consume OpenAI/Anthropic quotas quickly.
- Agent containers require proper configuration in docker-compose.yml.

## Key Utility Functions / APIs
- `magi/src/utils/runner.js` – Core agent runner
- `magi/src/utils/history.js` – Conversation history management
- `magi/src/utils/memory.js` – Memory persistence
- `magi/src/model_providers/` – LLM API wrappers
- `controller/src/server/docker_interface.ts` – Container management

## Special Features
- MECH (Meta-cognition Ensemble Chain-of-thought Hierarchy) - Intelligent model selection
- Custom Tools - Dynamic tool creation by agents at runtime
- Browser control - CDP-based browser automation
- Multi-provider support - Works with various LLM providers with automatic fallback