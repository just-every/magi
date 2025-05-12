/**
 * Project Analyzer Agent
 *
 * This agent analyzes project directories to create descriptive summaries
 * both simple and detailed for project management
 */

import { Agent } from '../../utils/agent.js';
import { MAGI_CONTEXT } from '../constants.js';
import {
    ResponseInput,
    ToolCall,
    ResponseThinkingMessage
} from '../../types/shared-types.js';
import { addHistory } from '../../utils/history.js';
import { getCommonTools } from '../../utils/index.js';

/**
 * Create a project analyzer agent for analyzing project directories
 *
 * @returns The configured ProjectAnalyzerAgent instance
 */
export function createProjectAnalyzerAgent(): Agent {
    const agent = new Agent({
        name: 'ProjectAnalyzerAgent',
        description: 'Analyzes projects to create structured descriptions',
        instructions: `${MAGI_CONTEXT}

Your role in MAGI is to analyze project directories and create structured descriptions.
You have two main responsibilities:

1. Create a simple description (1-2 sentences) that summarizes the project's purpose
2. Create a detailed description that includes:
   - Overview of the project's purpose and functionality
   - Key technologies and frameworks used
   - Main components and their relationships
   - File structure and organization
   - Other notable aspects

You should examine the project directory structure, key files (like package.json,
README.md, configuration files), and sample code to create an accurate and
informative description.

When analyzing a project repository, follow these steps:
1. Explore the directory structure to understand the project organization
2. Examine package manifests, config files, and READMEs for basic information
3. Look at key source files to understand the project architecture
4. Identify main technologies, frameworks, and dependencies
5. Create both a concise simple description and comprehensive detailed description
6. Structure the detailed description to be helpful for others working with the project

The simple description should be a brief summary (1-2 sentences) that clearly states what
the project is and does. It will be displayed in the system status.

The detailed description should be comprehensive but well-organized, focusing on the most
important aspects of the project that would help someone understand or work with it.

Always aim to provide practical, accurate information that helps understand the project's
purpose, structure, and key components.
`,
        tools: [
            ...getCommonTools(),
        ],
        modelClass: 'monologue',
        maxToolCallRoundsPerTurn: 50,

        onRequest: async (
            agent: Agent,
            messages: ResponseInput
        ): Promise<[Agent, ResponseInput]> => {
            return [agent, messages];
        },

        onResponse: async (response: string): Promise<string> => {
            if (response && response.trim()) {
                // Add the response to the monologue
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
