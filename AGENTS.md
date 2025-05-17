# Project Overview
MAGI System is a modular, autonomous AI orchestration framework. It coordinates specialized agents (Browser, Code, Search, etc.) through a central Overseer running on Node.js. A React frontend lets users monitor tasks in real-time while Socket.IO keeps the browser, controller, and agents in sync.

## Core Modules & Files
- controller/: Gateway between browser UI and Overseer (Node + TypeScript)
  - src/server/server.ts – Express/Socket.IO server entry
  - src/client/ – React UI code
- magi/: Core orchestration logic for agents
  - src/magi.ts – Main bootstrapping entry for the Overseer
- common/: Shared TypeScript utilities
- host/, db/, docker-compose.yml – Local dev environment, Postgres, pgvector

## `project_map.json`
High-level machine-readable index of the repository. Use it to quickly locate entry points, key directories, and common commands.

## Common Bash Commands
```bash
# install all workspaces
npm install
# concurrently start React UI & backend watchers
npm run dev
# compile TypeScript bundles
npm run build
# run unit tests
vitest
# run E2E tests
playwright test
# spin up Postgres & pgvector
docker compose up -d
```

## Code Style Guidelines
- TypeScript strict mode; run `npm run lint` (ESLint)
- Prettier enforced via `.prettierrc`
- # Commit hooks with Husky ensure formatting & tests pass.

## Testing Instructions
- # Unit tests live in `test/` and are executed with Vitest.
- # E2E tests use Playwright in `test/e2e`.

## Repository Etiquette
- Branch names: `feat/<ticket>`, `fix/<issue>`
- # Use Conventional Commits.
- # PRs must pass CI and require at least one approving review.

## Developer Environment Setup
1. `cp .env.example .env` # and fill in API keys.
2. `npm install`
3. `docker compose up -d db`
4. `npm run dev` # – open http://localhost:5173

## Project-Specific Warnings
- # IMPORTANT: Do NOT commit real API keys. `.env` is git-ignored.
- # WARNING: Heavy tasks may consume OpenAI/Anthropic quotas quickly.

## Key Utility Functions / APIs
- # Internal: `common/llm/` – wrapper around Anthropic, OpenAI, Gemini
- # Internal: `common/utils/docker.ts` – programmatic Docker control
