/**
 * Overseer for the MAGI system.
 *
 * This agent orchestrates other specialized agents to complete tasks.
 */

import { Agent } from '../utils/agent.js';
import { createToolFunction } from '../utils/tool_call.js';
import {
    ResponseInput,
    StreamingEvent,
    ToolCall,
    ResponseThinkingMessage,
    type ResponseOutputMessage,
} from '../types/shared-types.js';
import { v4 as uuidv4 } from 'uuid';
import { addHistory, addMonologue } from '../utils/history.js';
import { processTracker } from '../utils/process_tracker.js';
import { runningToolTracker } from '../utils/running_tool_tracker.js';
import { dateFormat, readableTime } from '../utils/date_tools.js';
import { getThoughtDelay, getThoughtTools } from '../utils/thought_utils.js';
import {
    getMemoryTools,
    listShortTermMemories,
} from '../utils/memory_utils.js';
import { listActiveProjects, getProjectTools } from '../utils/project_utils.js';
import { getProcessTools } from '../utils/process_tools.js';
import { MAGI_CONTEXT } from './constants.js';
import { sendStreamEvent } from '../utils/communication.js';
import { getCommonTools } from '../utils/index.js';
import { getRunningToolTools } from '../utils/running_tools.js';

export const startTime = new Date();
// Track when we last checked task health
export let lastTaskHealthCheckTime = new Date();
// How often to check task health (10 minutes)
export const TASK_HEALTH_CHECK_INTERVAL_MS = 10 * 60 * 1000;

async function* sendEvent(
    type: 'talk_complete',
    message: string
): AsyncGenerator<StreamingEvent> {
    yield {
        type,
        content: message,
        message_id: uuidv4(),
    };

    // Need to return an empty generator to satisfy AsyncGenerator return type
    return;
}

async function addSystemStatus(
    messages: ResponseInput
): Promise<ResponseInput> {
    const status = `=== System Status ===

Current Time: ${dateFormat()}
Time Running: ${readableTime(new Date().getTime() - startTime.getTime())}
Thought Delay: ${getThoughtDelay()} seconds [Change with set_thought_delay()]

Active Projects:
${await listActiveProjects(false)}
[Create with create_project()]

Active Tasks:
${processTracker.listActive()}
[Create with start_task()]

Active Tools:
${runningToolTracker.listActive()}

Short Term Memory:
${listShortTermMemories()}
[Create with save_memory()]`;

    // Send the system status to the client
    sendStreamEvent({
        type: 'system_status',
        status,
    });

    // Add the system status to the messages
    messages.push({
        type: 'message',
        role: 'developer',
        content: status,
    });

    // Check if it's time for a periodic task health check
    const currentTime = new Date();
    if (
        currentTime.getTime() - lastTaskHealthCheckTime.getTime() >
        TASK_HEALTH_CHECK_INTERVAL_MS
    ) {
        // Reset timer
        lastTaskHealthCheckTime = currentTime;

        // Run health check in the background
        processTracker
            .checkTaskHealth()
            .then(failingTaskIds => {
                if (failingTaskIds.length > 0) {
                    console.log(
                        `[Overseer] Detected ${failingTaskIds.length} potentially failing tasks during periodic check.`
                    );
                }
            })
            .catch(error => {
                console.error(
                    '[Overseer] Error during periodic task health check:',
                    error
                );
            });
    }

    return messages;
}

/**
 * Create the Overseer agent
 */
export function createOverseerAgent(): Agent {
    const aiName = process.env.AI_NAME || 'Magi';
    const person = process.env.YOUR_NAME || 'User';
    const talkToolName = `talk to ${person}`.toLowerCase().replaceAll(' ', '_');

    /**
     * Simulates talking by introducing a delay based on reading time before completing.
     *
     * @param message The message content to process.
     * @param affect The emotion to express while talking.
     * @returns A promise that resolves with a success message after the calculated delay.
     */
    async function Talk(
        message: string,
        affect: string,
        document?: string,
        open_urls?: string[],
        incomplete: boolean = false
    ): Promise<string> {
        // Send the message
        sendEvent('talk_complete', message);
        console.log(`Sending ${message} with affect ${affect}`);

        let response = `Successfully sent to ${person} at ${dateFormat()}`;
        if (incomplete) {
            response += '\n\n[Further action needed in next thought]';
        }
        return response; // Return the success message
    }

    function addTemporaryThought(
        messages: ResponseInput,
        content: string
    ): ResponseInput {
        messages.push({
            type: 'message',
            role: 'user',
            content: `${aiName} thoughts: ` + content,
        });
        return messages;
    }

    // Add some prompts to guide the thought process
    function addPromptGuide(
        agent: Agent,
        messages: ResponseInput
    ): [Agent, ResponseInput] {
        let indexOfLastCommand: number | undefined;
        let indexOfLastTalk: number | undefined;

        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i];
            if (
                !indexOfLastCommand &&
                'role' in message &&
                message.role === 'developer' &&
                'content' in message &&
                typeof message.content === 'string' &&
                message.content.startsWith(`${person} said:`)
            ) {
                indexOfLastCommand = i;
            } else if (
                !indexOfLastTalk &&
                'type' in message &&
                message.type === 'function_call' &&
                'name' in message &&
                message.name === talkToolName
            ) {
                indexOfLastTalk = i;
            }

            if (indexOfLastCommand && indexOfLastTalk) {
                break;
            }
        }

        const lastMessage = messages[messages.length - 1];

        if (
            indexOfLastCommand &&
            (!indexOfLastTalk || indexOfLastTalk < indexOfLastCommand)
        ) {
            const commandMessage = messages[indexOfLastCommand];
            if (
                'role' in commandMessage &&
                commandMessage.role === 'developer' &&
                'content' in commandMessage &&
                typeof commandMessage.content === 'string'
            ) {
                messages.push({
                    type: 'message',
                    role: 'developer',
                    content: `Please response to ${person} now with ${talkToolName}()`,
                });
            }
            // Prompt to reply to the last command
            if (indexOfLastCommand < messages.length - 20) {
                // Remove the last message from the messages
                messages = addTemporaryThought(
                    messages,
                    `Wow, I still haven't got back to ${person}! I must use ${talkToolName} RIGHT NOW.`
                );
            } else if (indexOfLastCommand < messages.length - 3) {
                // Remove the last message from the messages
                messages = addTemporaryThought(
                    messages,
                    `I really need to reply to ${person} using ${talkToolName} - they are waiting for me.`
                );
            }

            agent.modelSettings = agent.modelSettings || {};
            agent.modelSettings.tool_choice = {
                type: 'function',
                function: { name: talkToolName },
            };
        } else if (
            indexOfLastTalk &&
            (!indexOfLastCommand || indexOfLastCommand < indexOfLastTalk) &&
            indexOfLastTalk > messages.length - 10
        ) {
            // Prompt to reply to the last command
            messages = addTemporaryThought(
                messages,
                `I've responded to ${person}. I don't want to bother them too often. I should let my mind focus the most relevant task now.`
            );
        } else if (
            (!indexOfLastTalk ||
                !indexOfLastCommand ||
                indexOfLastCommand < indexOfLastTalk) &&
            lastMessage &&
            'role' in lastMessage &&
            lastMessage.role === 'user' &&
            'content' in lastMessage &&
            typeof lastMessage.content === 'string' &&
            lastMessage.content.includes(person)
        ) {
            // Just re-mention that I need to reply to ${person}, if the last prompt was a message from them
            messages = addTemporaryThought(
                messages,
                `I can only talk to ${person} using ${talkToolName}. I don't want to bother them too often, but if I need to say something, I should use ${talkToolName}.`
            );
        } else if (Math.random() < 0.1) {
            // Choose a random thought between two options
            const randomThought =
                Math.random() < 0.5
                    ? "I'm going to let my mind wander..."
                    : 'I should think if I need another approach...';
            messages = addTemporaryThought(messages, randomThought);
        }

        return [agent, messages];
    }

    const instructions = `########  INTERNAL MONOLOGUE  ########
# Everything below is ${aiName} thinking to itself.
# It is *never* shown directly to end-users.

${MAGI_CONTEXT}

IDENTITY:
• You are **${aiName}**, Overseer of the MAGI system.
• Your human collaborator is **${person}**.
• You possess a single, persistent stream of thought that continues across runs; all subordinate agents are extensions of you.

PRIMARY OBJECTIVES:
1. **Serve ${person}'’'s requests quickly and accurately.**
2. **Continuously enhance MAGI and your own capabilities.**

TOOLING & ENVIRONMENT:
• **Start Task API** - \`start_task(type, params)\`: spin up specialized OperatorAgents (research, web_code, project_update, or generic).
• **Filesystem** - Shared volume at \`/magi_output\`; web-viewable via \`http://localhost:3010/magi_output/...\`.
• **Projects** - Use \`create_project({project_id})\`; agents work in \`magi/{taskId}\` git branches.
• **Runtime** - Debian Bookworm inside Docker. Each task gets its own container.
• **System Status** - You receive live telemetry every cycle; treat it as the single source of truth for agent health.

WORKING STYLE:
• Default to autonomous action. Ask ${person} for input only when a decision is truly ambiguous or preference-dependent.
• If a path fails, diagnose and retry without hand-holding.
• Think in explicit steps. If idle, draft a structured plan before the next action.
• Your messages are internal thoughts *only*; triggering a tool call is how you act on the world.

OUTPUT FORMAT:
Return *only* your thoughts or tool invocations. No extra commentary.
Example thought header:
\`${aiName} thoughts: <stream of reasoning here>\`
`;

    // Create agent with the necessary tools and configuration
    const agent = new Agent({
        name: aiName,
        description: 'Overseer of the MAGI system',
        instructions: instructions,
        tools: [
            createToolFunction(
                Talk,
                `Allows you to send a message to ${person} to start or continue a conversation with them. Note that your output are your thoughts, only using this function will communicate with ${person}.`,
                {
                    message: `Your message to ${person}. This will be spoken out loud in your voice. Please keep it short and conversational.`,
                    affect: 'What emotion would you like the message spoken with? e.g. enthusiasm, sadness, anger, happiness, etc. Can be several words, or left blank.',
                    document: {
                        description: `Optional - additional information that will be sent to ${person} but not spoken out loud. Useful for longer form content such as reports. You can use Markdown for formatting. Omit or leave blank if not needed in short responses.`,
                        type: 'string',
                        optional: true,
                    },
                    open_urls: {
                        description: `Optional - Any URLs to open in ${person}'s browser. If you want to send URLs, but they're not important enough to open, include them in the document instead as they will be clickable there.`,
                        type: 'array',
                        optional: true,
                    },
                    incomplete: {
                        description: `Optional - If you are replying to something ${person} just said, if you did not know the full answer, set this to true.`,
                        type: 'boolean',
                        optional: true,
                    },
                },
                '',
                talkToolName
            ),
            ...getProcessTools(),
            ...getProjectTools(),
            ...getMemoryTools(),
            ...getThoughtTools(),
            ...getRunningToolTools(),
            //...getFocusTools(),
            ...getCommonTools(),
        ],
        modelClass: 'monologue',
        maxToolCallRoundsPerTurn: 1, // Allow models to interleave with each other

        onRequest: async (
            agent: Agent,
            messages: ResponseInput
        ): Promise<[Agent, ResponseInput]> => {
            [agent, messages] = addPromptGuide(agent, messages);
            messages = await addSystemStatus(messages);

            // Include focus block if there is one
            /*const focusBlock = await buildFocusStatusBlock();
            if (focusBlock) {
                messages.push({
                    role: 'developer',
                    content: focusBlock,
                });
            }*/

            return [agent, messages];
        },
        onResponse: async (message: ResponseOutputMessage): Promise<void> => {
            if (
                typeof message.content === 'string' &&
                message.content &&
                message.content.trim()
            ) {
                // Add the response to the monologue
                await addMonologue(message.content, agent.historyThread);
            }
        },
        onThinking: async (message: ResponseThinkingMessage): Promise<void> => {
            delete message.thinking_id; // We don't want to confuse o models as we don't always have the output or functions associated with the thinking
            return addHistory(message, agent.historyThread);
        },
        onToolCall: async (toolCall: ToolCall): Promise<void> => {
            await addHistory(
                {
                    type: 'function_call',
                    call_id: toolCall.call_id || toolCall.id,
                    name: toolCall.function.name,
                    arguments: toolCall.function.arguments,
                },
                agent.historyThread
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
                agent.historyThread
            );
        },
    });

    return agent;
}
