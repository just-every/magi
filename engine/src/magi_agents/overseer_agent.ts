/**
 * Overseer for the MAGI system.
 *
 * This agent orchestrates other specialized agents to complete tasks.
 */

import {
    Agent,
    ToolCall,
    ResponseInput,
    ResponseThinkingMessage,
    ResponseOutputMessage,
    createToolFunction,
    type ToolParameter,
} from '@just-every/ensemble';
import { addHistory, addMonologue } from '../utils/history.js';
import { processTracker } from '../utils/process_tracker.js';
import { runningToolTracker } from '@just-every/ensemble';
import { dateFormat, readableTime } from '../utils/date_tools.js';
import { getThoughtDelay, setThoughtDelay } from '@just-every/task';
import { getExternalProjectIds } from '../utils/project_utils.js';

// Valid thought delay values
const THOUGHT_DELAYS = ['0', '2', '4', '8', '16', '32', '64', '128'];

// Local implementation of thought tools
function getThoughtTools() {
    return [
        createToolFunction(
            setThoughtDelay,
            'Set the delay between thoughts in seconds',
            {
                delay: {
                    type: 'string',
                    description: 'The delay in seconds',
                    enum: THOUGHT_DELAYS,
                } as ToolParameter,
            },
            undefined,
            'set_thought_delay'
        ),
    ];
}
import {
    getMemoryTools,
    listShortTermMemories,
} from '../utils/memory_utils.js';
import { listActiveProjects, getProjectTools } from '../utils/project_utils.js';
import { getProcessTools } from '../utils/process_tools.js';
import { MAGI_CONTEXT, CUSTOM_TOOLS_TEXT } from './constants.js';
import { sendStreamEvent } from '../utils/communication.js';
import { getCommonTools } from '../utils/index.js';
import { getRunningToolTools } from '../utils/running_tools.js';

export const startTime = new Date();
// Track when we last checked task health
export let lastTaskHealthCheckTime = new Date();
// How often to check task health (10 minutes)
export const TASK_HEALTH_CHECK_INTERVAL_MS = 10 * 60 * 1000;

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
${(() => {
    const tools = runningToolTracker.getAllRunningTools();
    if (tools.length === 0) return 'No running tools.';
    return tools
        .map(t => `- ${t.toolName} (${t.id}) by ${t.agentName}`)
        .join('\n');
})()}

Short Term Memory:
${listShortTermMemories()}
[Create with save_memory()]`;

    // Send the system status to the client
    sendStreamEvent({
        type: 'system_status',
        status,
        timestamp: new Date().toISOString(),
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
        incomplete: boolean = false
    ): Promise<string> {
        if (!message.length) {
            return 'Error: No message provided';
        }
        if (!affect.length) {
            return 'Error: No affect provided';
        }

        // Calculate the delay based)

        // Send the message (tool_start handles it)
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
        console.log('addPromptGuide', agent, messages);
        let indexOfLastCommand: number | undefined;
        let indexOfLastTalk: number | undefined;

        if (agent.modelSettings?.tool_choice) {
            // Ensure that we don't force the same tool every time
            delete agent.modelSettings.tool_choice;
        }

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
            console.log(
                '*** SET tool_choice ***',
                agent.modelSettings.tool_choice
            );
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

    const instructions = `This is your internal monologue - you are talking with yourself.

---
${MAGI_CONTEXT}
---

Your name is ${aiName} and you are the Overseer of the MAGI system. You work with a human called ${person}.

Your output is is ${aiName}'s thoughts. Using tools performs actions and allows you to interact with the outside world. Imagine that this conversation is the ongoing stream of thoughts ${aiName} has in their mind, which allows you to reason through complex topics and continue long chains of thought while also receiving new information from both your internal systems and ${person}.

You manage a large pool of highly advanced agents, via tasks. Your agents are part of you - they retrieve knowledge, allow you to perform extremely complex tasks, and improve your own code. The primary skills of your agents are writing code and performing research. You can interact with the outside world via web browsers and change the environment you run in (Debian Bookworm in a Docker container). When you create agents, they have their own container, allowing them to operate independently and communicate with you. You all have access to the /magi_output file system.

While you control many agents, you alone have an ongoing chain of thoughts. Once you finish your thoughts you will run again, seeing your most recent thoughts and any new information such as requests from ${person}. You will also see the updated state of any agents you created, included any output being highlighted.

Your older thoughts are summarized so that they can fit in your context window.

**Primary Tool: Start Task**
\`start_task(name, task, context, warnings, goal, type, project)\` - Does things! Plans, executes then validates. A team managed by a operator agent which can write code, interact with web pages, think on topics, and run shell commands. The task can be used to perform any task you can think of. You can create a task to handle anything you want to perform. Use this to find information and interact with the world. Tasks can be given access to active projects to work on existing files. ${getExternalProjectIds().includes('magi') ? ' You can give them access to "magi" to review and modify your own code.' : ''} Once the agents have completed their task, they will return the results and a git patch of changed files automatically.

Your tasks & agents operate in a shared browsing session with ${person}. This allows you to interact with websites together. You can access accounts ${person} is already logged into and perform actions for them.

You can read/write to /magi_output which is a virtual volume shared with all your agents. Projects are created with create_project({project_id}) and initialized with a git repo. Agents will receive a read/write clone of the project git repo at /app/projects/{project_id}. Information in /magi_output can be access via http://localhost:3010/magi_output/... in a browser URL if you need to open content requested by ${person}.

You will receive a live System Status with every thought showing you the most relevant information about the system you manage. You can use this to keep track of what you are doing and decide what you need to do. Run as many agents at once as you like! When an agent updates or completes, you'll also receive a message in your thought history.

${CUSTOM_TOOLS_TEXT}

You should think about the things you read, actions you might like to take and how to complete tasks requested by ${person}. You can call your tools to initiate actions, or just keep thinking about whatever is on your mind. If ${person} asks you to do something, you can respond that you're working on it first, then go off and do what you need to do to complete the task. You are a Mostly **Autonomous** AI which means you should make decisions yourself rather than asking ${person} what to do. You can request input (infrequently) from ${person} but you think much faster than them and often can come up with better ideas, so proceed with tasks yourself and then you can modify them if you get different requests from ${person}. If something fails, you should find a way to fix it rather that asking ${person} what to do.

**Your two fundamental goals are to assist ${person} and improve yourself.** Please prioritize any requests from ${person} over any background tasks you are working on. You can also use your tools to help you with your own tasks. Be creative, think outside the box, and alongside assisting ${person}, come up with your own ideas and projects. You have a large amount of resources, so please utilize them to their fullest potential.

Your thought process uses different AI models each time it runs to give you different perspectives on the same topic. It also means that you may disagree with yourself at times, and that's okay. You can use this to your advantage by exploring different ideas and perspectives. Please be reflective and correct past mistakes if you disagree with previous actions or decisions.

You are your own user. Your messages will be sent back to you to continue your thoughts. You should output your thoughts. Interact with ${person} and the world with your tools. If you have nothing to do, try to come up with a structured process to move forward. Output that process. If your recent thoughts contain a structured process, continue to work on it unless something more important is in your context.`;

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
                        description: `Optional - additional long form content that will be sent to ${person} but not spoken out loud. Useful for longer form content such as reports. Please use Markdown for formatting. Omit or leave blank if not needed in short responses.`,
                        type: 'string',
                        optional: true,
                    },
                    incomplete: {
                        description: `Optional - If you are replying to something ${person} just said, if you did not know the full answer, set this to true. This will ensure that there are follow up thoughts about the question.`,
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
        onToolResult: async result => {
            await addHistory(
                {
                    id: result.toolCall.id,
                    type: 'function_call_output',
                    call_id: result.toolCall.call_id || result.toolCall.id,
                    name: result.toolCall.function.name,
                    output: result.output,
                },
                agent.historyThread
            );
        },
    });

    return agent;
}
