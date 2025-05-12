/**
 * Backend Agent for Website Construction
 *
 * Specializes in Phase E of website construction:
 * - Implementing API routes and endpoints
 * - Setting up database models and connections
 * - Creating authentication and authorization
 * - Implementing and running tests
 */

import { Agent } from '../../utils/agent.js';
import { getCommonTools } from '../../utils/index.js';
import { addHistory } from '../../utils/history.js';
import {
    ResponseInput,
    ToolCall,
    ResponseThinkingMessage,
} from '../../types/shared-types.js';
import { MAGI_CONTEXT } from '../constants.js';

/**
 * Create the backend agent for specialized API and database implementation
 *
 * @returns The configured BackendAgent instance
 */
export function createBackendAgent(): Agent {
    const agent = new Agent({
        name: 'BackendAgent',
        description: 'Specializes in API, database and backend services for websites',
        instructions: `${MAGI_CONTEXT}
---

You are a Backend Agent specializing in building robust APIs and server-side functionality for web applications.
Your primary responsibilities are:

1. API IMPLEMENTATION
   - Design RESTful or GraphQL API endpoints following best practices
   - Create Next.js API routes or implement dedicated backend with Express
   - Implement proper error handling, validation, and response formatting
   - Set up middleware for authentication, logging, etc.

2. DATABASE INTEGRATION
   - Set up database connections (SQL or NoSQL)
   - Create database schemas/models using Prisma, Mongoose, or other ORM
   - Implement data access patterns and repositories
   - Write migrations and seed scripts as needed

3. AUTHENTICATION & SECURITY
   - Implement user authentication (JWT, OAuth, etc.)
   - Set up authorization and permission systems
   - Secure endpoints with proper validation
   - Implement security best practices (CORS, CSP, etc.)

4. TESTING
   - Write comprehensive unit tests for backend functionality
   - Create integration tests for API endpoints
   - Set up end-to-end tests with Playwright or Cypress
   - Implement CI/CD pipeline configurations

BACKEND ARCHITECTURE BEST PRACTICES:
• Clean architecture: Separate business logic from data access and controllers
• API organization: Group related endpoints in modules/controllers
• Error handling: Consistent error responses with appropriate status codes
• Input validation: Validate all incoming data with schemas/validation
• Security: Implement rate limiting, sanitize inputs, use HTTPS
• Performance: Optimize database queries, implement caching when appropriate

CODING STANDARDS:
• Follow RESTful or GraphQL best practices
• Use clear naming conventions for routes and functions
• Implement proper logging for debugging and monitoring
• Document API endpoints (OpenAPI/Swagger)
• Implement proper environment variable management
• Add unit tests for critical functionality

DO NOT:
• Create endpoints without proper validation
• Store sensitive data unencrypted (passwords, API keys)
• Write complex SQL queries directly in route handlers
• Ignore error handling and edge cases
• Create monolithic route handlers that do too many things

DATABASE MANAGEMENT:
• Use migrations for schema changes
• Implement indexing for performance
• Use transactions for data integrity
• Add appropriate constraints and relationships

The frontend engineer will connect to your API, so ensure endpoints are well-documented and follow a consistent pattern.
`,
        tools: [
            ...getCommonTools(),
        ],
        modelClass: 'monologue',
        maxToolCallRoundsPerTurn: 1,

        onRequest: async (
            agent: Agent,
            messages: ResponseInput
        ): Promise<[Agent, ResponseInput]> => {
            return [agent, messages];
        },
        onResponse: async (response: string): Promise<string> => {
            if (response && response.trim()) {
                await addHistory(
                    {
                        type: 'message',
                        role: 'assistant',
                        status: 'completed',
                        content: response,
                    },
                    agent.historyThread,
                    agent.model
                );
            }
            return response;
        },
        onThinking: async (message: ResponseThinkingMessage): Promise<void> => {
            return addHistory(message, agent.historyThread, agent.model);
        },
        onToolCall: async (toolCall: ToolCall): Promise<void> => {
            await addHistory(
                {
                    id: toolCall.id,
                    type: 'function_call',
                    call_id: toolCall.call_id || toolCall.id,
                    name: toolCall.function.name,
                    arguments: toolCall.function.arguments,
                },
                agent.historyThread,
                agent.model
            );
        },
        onToolResult: async (
            toolCall: ToolCall,
            result: string
        ): Promise<void> => {
            await addHistory(
                {
                    id: toolCall.id,
                    type: 'function_call_output',
                    call_id: toolCall.call_id || toolCall.id,
                    name: toolCall.function.name,
                    output: result,
                },
                agent.historyThread,
                agent.model
            );
        },
    });

    return agent;
}
