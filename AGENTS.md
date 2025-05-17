# MAGI Agent System

MAGI is an ensemble autonomous AI system that orchestrates specialized agents to solve complex tasks with minimal human intervention. The system maintains a persistent chain of thought with a central AI persona (Overseer) for orchestration and task management.

## System Architecture

```
User Interface (Browser) <-> Controller Service <-> Overseer <-> Specialized Agents
```

### Key Components

- **User Interface**: React-based web app for task submission and monitoring
- **Controller Service**: Manages Docker containers and communication
- **Overseer Agent**: Central system coordinator with persistent reasoning
- **Operator Agent**: Task breakdown and agent delegation
- **Specialized Agents**: Domain-specific task executors


## Agents Overview
- **Overseer** – orchestrates reasoning and delegates tasks
- **Operator** – decomposes goals and coordinates specialized agents
- **Common agents** live under `magi/src/magi_agents/common_agents/` (Code, Browser, Search, Shell, etc.)
- Domain-specific agents are in `magi/src/magi_agents/web_agents/`

Each agent extends the base `Agent` class and registers its own tools.

## Building & Running
1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and provide API keys.
3. Run `npm run setup` to build utilities and configure Chrome.
4. Start the development stack with `npm run dev` – this builds Docker images, launches Postgres with `docker compose`, and serves the web UI on port 3010.

Key build scripts (`package.json`):
- `npm run build` – compile TypeScript and Docker images
- `npm run build:host` – build host utilities
- `npm run build:docker` – build controller and magi images

## Key Files
- `controller/src/server/server.ts` – Express + Socket.IO server
- `controller/src/client/` – React UI
- `magi/src/magi.ts` – Overseer bootstrap
- `magi/src/model_providers/` – LLM API wrappers
- `host/src/browser/browser-control.ts` – Chrome automation
- `docker-compose.yml` – service definitions

See `project_map.json` for more paths and commands.

## Testing
Run unit and integration tests:
```bash
npm test
```
End-to-end tests with Playwright:
```bash
npm run test:e2e
```
Custom tool examples live in `test/tools`. Additional notes are in `docs/TESTING.md`.

Linting is enforced via `npm run lint` and formatting via `npm run format`.

## Creating New Agents
Agents are registered in `magi/src/magi_agents/index.ts`. Create a file under `magi/src/magi_agents/` and extend the base class:
```typescript
import { Agent } from '../utils/agent.js';
import { getCommonTools } from '../utils/index.js';

export class MyNewAgent extends Agent {
  constructor() {
    super('my_new_agent');
    this.systemMessage = 'You are a specialized agent that excels at...';
    this.tools = getCommonTools(this.agent_id);
  }
}
```
