# Task (MAGI Agents) Development Guide

## Local Development Setup

### Prerequisites
- Node.js 23+
- PostgreSQL database with pgvector extension
- Chrome browser (for browser agent)
- API keys for LLM providers (OpenAI, Anthropic, etc.)

### Initial Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your API keys and configuration
```

3. Ensure database is running:
```bash
# From parent directory
docker compose up -d db
```

### Development Commands

#### For local development with auto-reload:
```bash
npm run dev
```
This uses nodemon to watch for changes and rebuild/restart automatically.

#### For fast development with tsx (no build step):
```bash
npm run dev:fast
```
This uses tsx to run TypeScript directly without compilation.

#### For Docker development (mimics production):
```bash
npm run start:docker
```

#### Build only:
```bash
npm run build
```

#### Run specific agent:
```bash
npm start -- --agent browser "search for TypeScript tutorials"
```

### Testing Tools

#### Test custom tools:
```bash
# After building
node dist/utils/tool_runner.js path/to/tool.js
```

#### Test browser automation:
```bash
npm run browser
```

### Project Structure
- `src/magi.ts` - Main entry point
- `src/magi_agents/` - Agent implementations
- `src/utils/` - Shared utilities
- `src/model_providers/` - LLM provider integrations
- `dist/` - Compiled output (gitignored)

### Common Issues

1. **Missing API keys**: Ensure all required API keys are set in .env

2. **Chrome connection**: Make sure Chrome is running with CDP enabled:
```bash
# From parent directory
npm run browser:start
```

3. **Database pgvector**: The task system requires pgvector extension:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Development Tips
- Use `npm run dev:fast` for rapid iteration (no build step)
- Set `DEBUG=*` environment variable for verbose logging
- Check individual agent files for specific testing commands
- The system supports hot-reloading of custom tools