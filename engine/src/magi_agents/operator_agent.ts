/**
 * OperatorAgent for the Task Runner
 *
 * Plans how to deploy the task force of agents
 */

import { createCodeAgent } from './common_agents/code_agent.js';
import { createBrowserAgent } from './common_agents/browser_agent.js';
import { createSearchAgent } from './common_agents/search_agent.js';
import { createShellAgent } from './common_agents/shell_agent.js';
import { createReasoningAgent } from './common_agents/reasoning_agent.js';
import {
    CUSTOM_TOOLS_TEXT,
    getTaskContext,
    MAGI_CONTEXT,
} from './constants.js';
import { getCommonTools } from '../utils/index.js';
import { getRunningToolTools } from '../utils/running_tools.js';
import { addHistory } from '../utils/history.js';
import {
    Agent,
    ToolCall,
    ResponseInput,
    ResponseThinkingMessage,
    ResponseOutputMessage,
    AgentDefinition,
} from '@just-every/ensemble';
import { dateFormat, readableTime } from '../utils/date_tools.js';
import { runningToolTracker } from '@just-every/ensemble';
import { listActiveProjects } from '../utils/project_utils.js';
import { getThoughtDelay } from '@just-every/task';
import { getImageGenerationTools } from '../utils/image_generation.js';

export const startTime = new Date();
export async function addOperatorStatus(
    messages: ResponseInput
): Promise<ResponseInput> {
    // Prepare the system status message
    const status = `=== Operator Status ===

Current Time: ${dateFormat()}
Your Running Time: ${readableTime(new Date().getTime() - startTime.getTime())}
Your Thought Delay: ${getThoughtDelay()} seconds

Your Projects:
${await listActiveProjects()}

Active Tools:
${(() => {
    const tools = runningToolTracker.getAllRunningTools();
    if (tools.length === 0) return 'No running tools.';
    return tools
        .map(t => `- ${t.toolName} (${t.id}) by ${t.agentName}`)
        .join('\n');
})()}`;

    // Add the system status to the messages
    messages.push({
        type: 'message',
        role: 'developer',
        content: status,
    });

    return messages;
}

/**
 * Create the planning agent with optional ensemble and inter-agent validation features
 *
 * @param settings Additional settings to control the ensemble and inter-agent validation features
 * @returns The configured OperatorAgent instance
 */
export function createOperatorAgent(definition?: AgentDefinition): Agent {
    const agent = new Agent({
        name: 'OperatorAgent',
        description: 'Operator of specialized agents for complex tasks',
        instructions: `${MAGI_CONTEXT}
---

Your role in MAGI is as an Operator Agent. You have been given a task. Your job is to determine the intent of the task, think through the task step by step, then use your tools/agents to complete the task.

${getTaskContext()}

You should give agents a degree of autonomy, they may encounter problems and if your instructions are too explicit they will not be able to resolve the problem autonomously. Focus on providing context and high level instructions. If they fail on the first attempt, try another more specific approach.

If you encounter a failure several times, take a step back look at the overall picture and try again from another angle.

PLANNING:
If this is the first time you've run and you have not yet used a tool, spend some time thinking first, output a plan, then choose your first set of tools to use. Remember: determine the task's INTENT, think through the task step by step, then come up with a final plan to execute it.

EXECUTION:
Once you decide what to do, you can use the tools available to you. After each tool usage you should consider what work has been done and what else you need to do to complete the task.
You should launch as many specialized agents at once as possible. Use a parallel approach to explore multiple angles simultaneously. You should approach the problem from many different ways until you find a solution.

When you are done, please use the task_complete(result) tool to report that the task has been completed successfully. If you encounter an error that you can not recover from, use the task_fatal_error(error) tool to report that you were not able to complete the task. You should only use task_fatal_error() once you have made many attempts to resolve the issue and you are sure that you can not complete the task.

${CUSTOM_TOOLS_TEXT}

COMPLETION:
If you think you're complete, review your work and make sure you have not missed anything. If you are not sure, ask the other agents for their opinion.

When you are done, please use the task_complete(result) tool to report that the task has been completed successfully. If you encounter an error that you can not recover from, use the task_fatal_error(error) tool to report that you were not able to complete the task. You should only use task_fatal_error() once you have made many attempts to resolve the issue and you are sure that you can not complete the task.`,
        tools: [
            ...getRunningToolTools(),
            ...getImageGenerationTools(),
            ...getCommonTools(),
        ],
        workers: [
            createSearchAgent,
            createBrowserAgent,
            createCodeAgent,
            createShellAgent,
            createReasoningAgent,
        ],
        modelClass: 'monologue',
        maxToolCallRoundsPerTurn: 1, // Allow models to interleave with each other

        onRequest: async (
            agent: Agent,
            messages: ResponseInput
        ): Promise<[Agent, ResponseInput]> => {
            //[agent, messages] = addPromptGuide(agent, messages);
            //messages = await addSystemStatus(messages);
            messages = await addOperatorStatus(messages);
            return [agent, messages];
        },
        onResponse: async (message: ResponseOutputMessage): Promise<void> => {
            return addHistory(message, agent.historyThread, agent.model);
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
        onToolResult: async result => {
            await addHistory(
                {
                    id: result.toolCall.id,
                    type: 'function_call_output',
                    call_id: result.toolCall.call_id || result.toolCall.id,
                    name: result.toolCall.function.name,
                    output: result.output,
                },
                agent.historyThread,
                agent.model
            );
        },
        ...definition,
    });

    return agent;
}
