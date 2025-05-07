# Custom Tools

This document explains the Custom Tools feature in the MAGI system, which allows agents to create and modify tools dynamically at runtime.

## Overview

Custom Tools allows agents to:

1. **Create a tool** based on a description (via `CUSTOM_TOOL`)
2. **Modify an existing tool** with specified changes (via `modify_tool`)
3. **Automatically discover relevant tools** based on task context (via embedding similarity)

A key feature of the system is that **tools are agent-specific** - when a tool is created, it's stored in the database but made available only to the agent that created it. This prevents agent overwhelm by keeping tool counts manageable.

## Architecture

The Custom Tools feature is implemented as follows:

1. **Database:** `custom_tools` table in PostgreSQL with vector search capabilities
2. **API:** Functions in `custom_tool_utils.ts` that expose tool management operations
3. **Per-agent cache:** `agentToolCache` that stores tools per agent ID
4. **Integration:** Hooks in `mech_memory_wrapper.ts` to automatically include relevant tools
5. **Implementation:** Uses `CodeAgent` to write the actual tool implementations
6. **Tool limits:** `MAX_AGENT_TOOLS` constant (default: 20) to prevent overwhelming agents

## Database Schema

The `custom_tools` table has the following schema:

```sql
CREATE TABLE custom_tools (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,
  parameters_json TEXT NOT NULL,
  implementation TEXT NOT NULL,
  embedding     vector(1536),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  version       INTEGER DEFAULT 1,
  source_task_id UUID,
  is_latest     BOOLEAN DEFAULT true
);
```

Tools are versioned, with only the latest version of each tool being shown by default.

## Setup Instructions

1. Make sure the PostgreSQL database has the pgvector extension installed:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

   Note: Database migrations are run automatically at controller startup; no manual setup required.
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

2. Make sure agents have unique IDs:
   ```typescript
   // Ensure each agent has a unique agent_id property
   agent.agent_id = 'unique-identifier';
   ```

## API

### Creating a Custom Tool

```typescript
import { CUSTOM_TOOL } from './utils/custom_tool_utils.js';

const result = await CUSTOM_TOOL(
  agent.agent_id, // Pass the agent's ID
  'A tool that translates text from one language to another using the Google Translate API'
);
console.log(result);
```

### Modifying a Custom Tool

```typescript
import { modify_tool } from './utils/custom_tool_utils.js';

const result = await modify_tool(
  agent.agent_id, // Pass the agent's ID
  'translate_text', 
  'Add support for detecting the source language automatically'
);
console.log(result);
```

### Automatic Tool Discovery

The system will automatically include relevant custom tools when:

1. Running an agent via `runMECHWithMemory` (auto-discovery during embedding generation)
2. Manually registering tools with an agent:
   ```typescript
   import { registerRelevantCustomTools } from './utils/index.js';
   
   // After generating an embedding for the current task
   await registerRelevantCustomTools(embedding, {
     agent_id: agent.agent_id,
     tools: agent.tools
   });
   ```

### Getting an Agent's Custom Tools

When initializing an agent, include the agent's ID when getting common tools:

```typescript
import { getCommonTools } from './utils/index.js';

agent.tools = getCommonTools(agent.agent_id);
```

## Testing

You can test the custom tools system using:

```bash
node scripts/test-custom-tools.js
```

This script creates a simple "echo" tool and then modifies it.

## Limitations & Considerations

1. **Per-agent scope**: Tools are specific to the agent that created them or agents that discover them via similarity. This prevents tool count explosion.

2. **Tool limits**: Each agent has a maximum of `MAX_AGENT_TOOLS` custom tools (default: 20) to prevent cognitive overload.

3. **Safety**: The system uses `new Function()` to evaluate the implementation string. This is generally safe within a trusted environment, but consider a sandbox if exposing this to untrusted users.

4. **Persistence**: Tools are stored in the database and survive system restarts, but agent-tool associations are in-memory only.

5. **Tool Quality**: The quality of generated tools depends on the capabilities of the underlying LLM.

6. **Versioning**: Tools are versioned, with a unique version number for each modification.

## Future Improvements

1. Tool categories and tagging
2. Better sandboxing for tool execution
3. Explicit permissions model for who can create/modify tools
4. Versioned tool revisions history and rollback capabilities
5. Tool testing framework
6. Persistent agent-tool associations (currently in-memory only)
7. Tool sharing capabilities between specific agents
