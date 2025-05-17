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

## Agent Types

### 1. Overseer Agent
- **Location**: `/magi/src/magi_agents/overseer_agent.ts`
- **Purpose**: Central orchestrator that maintains persistent thoughts and delegates to specialized agents
- **Capabilities**:
  - High-level planning and task management
  - Error recovery and adaptation
  - Memory management and context preservation
  - Meta-cognition to improve its own reasoning

### 2. Operator Agent
- **Location**: `/magi/src/magi_agents/operator_agent.ts`
- **Purpose**: Breaks down complex tasks and assigns them to specialized agents
- **Capabilities**:
  - Task decomposition
  - Agent selection
  - Progress tracking
  - Result synthesis

### 3. Code Agent
- **Location**: `/magi/src/magi_agents/common_agents/code_agent.ts`
- **Purpose**: Code generation, analysis, and modification
- **Capabilities**:
  - Write new code in multiple languages
  - Debug and fix issues
  - Refactor existing code
  - Explain code functionality

### 4. Browser Agent
- **Location**: `/magi/src/magi_agents/common_agents/browser_agent.ts`
- **Purpose**: Web interaction and data extraction
- **Capabilities**:
  - Navigate websites
  - Fill forms and click elements
  - Extract page content
  - Take screenshots
  - Execute JavaScript

### 5. Search Agent
- **Location**: `/magi/src/magi_agents/common_agents/search_agent.ts`
- **Purpose**: Information retrieval from the web
- **Capabilities**:
  - Web search with specific queries
  - Result filtering and ranking
  - Information synthesis
  - Source verification

### 6. Shell Agent
- **Location**: `/magi/src/magi_agents/common_agents/shell_agent.ts`
- **Purpose**: Execute system commands
- **Capabilities**:
  - Run shell commands
  - File system operations
  - Process management
  - Environment configuration

### 7. Reasoning Agent
- **Location**: `/magi/src/magi_agents/common_agents/reasoning_agent.ts`
- **Purpose**: Complex problem-solving and analysis
- **Capabilities**:
  - Multi-step reasoning
  - Hypothesis generation and testing
  - Decision making
  - Verification and fact-checking

### 8. Image Agent
- **Location**: `/magi/src/magi_agents/common_agents/image_agent.ts`
- **Purpose**: Image analysis and generation
- **Capabilities**:
  - Image description and analysis
  - Visual information extraction
  - Image generation (via external APIs)
  - Basic image manipulation

### 9. Summary Agent
- **Location**: `/magi/src/magi_agents/common_agents/summary_agent.ts`
- **Purpose**: Content summarization
- **Capabilities**:
  - Text summarization
  - Key point extraction
  - Report generation
  - Content categorization

## Domain-Specific Agents

MAGI also includes specialized agents for specific domains:

### Web Development Agents
- **Frontend Agent**: `/magi/src/magi_agents/web_agents/frontend_agent.ts`
- **Backend Agent**: `/magi/src/magi_agents/web_agents/backend_agent.ts`
- **Design Agent**: `/magi/src/magi_agents/web_agents/design_agent.ts`
- **Test Agent**: `/magi/src/magi_agents/web_agents/test_agent.ts`

## Agent Communication

Agents communicate through a structured protocol:

1. **Command Messages**: Task requests from the Overseer/Operator
2. **Status Updates**: Progress and state information
3. **Results**: Task completion output
4. **Tool Calls**: Invocation of specific capabilities

## Model Providers

Agents can use different language models based on the task:

- **Anthropic Claude**: High reasoning and context
- **OpenAI GPT**: General capabilities and coding
- **Google Gemini**: Additional model with alternate strengths
- **DeepSeek**: Alternative coding-specialized model
- **Fallback Mechanism**: Automatic switching if rate limits are hit

## Tool Integration

Agents can access various tools:

- Web browsing via Chrome DevTools Protocol
- File operations
- Code execution
- API interactions
- Database queries
- Image processing

## Creating New Agents

To create a new agent type:

1. Create a new file in `/magi/src/magi_agents/`
2. Implement the agent class extending the base Agent class
3. Register the agent in `/magi/src/magi_agents/index.ts`
4. Define its tools, system message, and model settings

Example:
```typescript
import { Agent } from '../utils/agent.js';
import { getCommonTools } from '../utils/index.js';

export class MyNewAgent extends Agent {
  constructor() {
    super('my_new_agent');
    this.systemMessage = 'You are a specialized agent that excels at...';
    this.tools = getCommonTools(this.agent_id);
    // Add agent-specific tools here
  }
}
```