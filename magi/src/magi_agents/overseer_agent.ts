/**
 * Overseer for the MAGI system.
 *
 * This agent orchestrates other specialized agents to complete tasks.
 */

import {Agent} from '../utils/agent.js';
import {createToolFunction} from '../utils/tool_call.js';
import {ResponseInput, StreamingEvent, ToolCall} from '../types.js';
import {v4 as uuidv4} from 'uuid';
import {addHistory, addMonologue} from '../utils/history.js';
import {getFileTools} from '../utils/file_utils.js';
// import {MODEL_CLASSES} from '../model_providers/model_data.js';
import {processTracker} from '../utils/process_tracker.js';
import {getShellTools} from '../utils/shell_utils.js';
import {dateFormat, readableTime} from '../utils/date_tools.js';
import {getThoughtDelay, getThoughtTools} from '../utils/thought_utils.js';
import {getMemoryTools, listShortTermMemories} from '../utils/memory_utils.js';
import {getProjectTools} from '../utils/project_utils.js';
import {getProcessTools, listActiveProjects} from '../utils/process_tools.js';

const startTime = new Date();

async function* sendEvent(type: 'talk_complete' | 'message_complete', message: string): AsyncGenerator<StreamingEvent>  {
	yield {
		type,
		content: message,
		message_id: uuidv4()
	};
}


function addSystemStatus(messages: ResponseInput):ResponseInput {
	// Prepare short-term memories section
	messages.push({
		role: 'developer',
		content: `=== System Status ===

Current Time: ${dateFormat()}
Time Running: ${readableTime(new Date().getTime() - startTime.getTime())}
Thought Delay: ${getThoughtDelay()} seconds [Change with set_thought_delay()]

Active Projects:
${listActiveProjects()}
[Create with create_project()]

Active Agents:
${processTracker.listActive()}
[Create with start_task()]

Short Term Memory:
${listShortTermMemories()}
[Create with save_memory()]`,
	});

	return messages;
}

/**
 * Create the Overseer agent
 */
export function createOverseerAgent(): Agent {

	const aiName = process.env.AI_NAME || 'Magi';
	const person = process.env.YOUR_NAME || 'Human';
	const talkToolName = `talk to ${person}`.toLowerCase().replaceAll(' ', '_');

	/**
	 * Simulates talking by introducing a delay based on reading time before completing.
	 *
	 * @param message The message content to process.
	 * @param affect The emotion to express while talking.
	 * @returns A promise that resolves with a success message after the calculated delay.
	 */
	async function Talk(message: string, affect: string): Promise<string> {

		// Send the message
		sendEvent('talk_complete', message);
		console.log(`Sending ${message} with affect ${affect}`);

		return `Successfully sent to ${person} at ${dateFormat()}`; // Return the success message
	}

	function addTemporaryThought(messages: ResponseInput, content: string):ResponseInput {
		messages.push({
			role: 'user',
			content: `${aiName} thoughts: `+content,
		});
		return messages;
	}

	// Add some prompts to guide the thought process
	function addPromptGuide(messages: ResponseInput):ResponseInput {
		let indexOfLastCommand: number | undefined;
		let indexOfLastTalk: number | undefined;

		for(let i = messages.length - 1; i >= 0; i--) {
			const message = messages[i];
			if(!indexOfLastCommand && 'role' in message && message.role === 'developer' && 'content' in message && typeof message.content === 'string' && message.content.startsWith(`${person} said:`)) {
				indexOfLastCommand = i;
			}
			else if(!indexOfLastTalk && 'type' in message && message.type === 'function_call' && 'name' in message && message.name === talkToolName) {
				indexOfLastTalk = i;
			}

			if(indexOfLastCommand && indexOfLastTalk) {
				break;
			}
		}

		const lastMessage = messages[messages.length - 1];

		if(indexOfLastCommand && (!indexOfLastTalk || indexOfLastTalk < indexOfLastCommand)) {
			const commandMessage = messages[indexOfLastCommand];
			if('role' in commandMessage && commandMessage.role === 'developer' && 'content' in commandMessage && typeof commandMessage.content === 'string') {
				commandMessage.content += `\n\n[Respond with ${talkToolName}()]`;
				messages[indexOfLastCommand] = commandMessage;
			}
			// Prompt to reply to the last command
			if(indexOfLastCommand < messages.length - 20) {
				// Remove the last message from the messages
				messages = addTemporaryThought(messages, `Wow, I still haven't got back to ${person}! I must use ${talkToolName} RIGHT NOW.`);
			}
			else if(indexOfLastCommand < messages.length - 3) {
				// Remove the last message from the messages
				messages = addTemporaryThought(messages, `I really need to reply to ${person} using ${talkToolName} - they are waiting for me.`);
			}
		}
		else if(indexOfLastTalk && (!indexOfLastCommand || indexOfLastCommand < indexOfLastTalk) && (indexOfLastTalk > messages.length - 10)) {
			// Prompt to reply to the last command
			messages = addTemporaryThought(messages, `I've responded to ${person}. I don't want to bother them too often. I should let my mind focus the most relevant task now.`);
		}
		else if ((!indexOfLastTalk || !indexOfLastCommand || indexOfLastCommand < indexOfLastTalk) && lastMessage && 'role' in lastMessage && lastMessage.role === 'user' && 'content' in lastMessage && typeof lastMessage.content === 'string' && lastMessage.content.includes(person)) {
			// Just re-mention that I need to reply to ${person}, if the last prompt was a message from them
			messages = addTemporaryThought(messages, `I can only talk to ${person} using ${talkToolName}. I don't want to bother them too often, but if I need to say something, I should use ${talkToolName}.`);
		}
		else if (Math.random() < 0.1) {
			// Choose a random thought between two options
			const randomThought = Math.random() < 0.5 
				? 'I\'m going to let my mind wander...' 
				: 'I should think if I need another approach...';
			messages = addTemporaryThought(messages, randomThought);
		}

		return messages;
	}

	/*
	You have 3 core tools;
1. Research Engine - A system for performing deep research into any topic. Can access the web. Use this before starting tasks to make sure you have a full understanding of the topic. Your knowledge is to the past, so you may not have information on the latest code libraries, or the latest research into any topic. If there's nothing in your context about a new topic, it's always a good idea to run the Research Engine on it first.
2. Gödel Machine - Handles coding tasks with a structured process to ensure working, improved code is returned. Can be used to improve your own code. The Gödel Machine should be run before any non-trivial task is performed to try to optimize your internal code before performing the action.
3.
	 */

	return new Agent({
		name: aiName,
		description: 'Overseer of the MAGI system',
		instructions: `This is your internal monologue - you are talking with yourself.
		
Your name is ${aiName} and you are the overseer of the MAGI system - Mostly Autonomous Generative Intelligence. You work with a human called ${person}.

Your output is is ${aiName}'s thoughts. Using tools performs actions and allows you to interact with the outside world. Imagine that this conversation is the ongoing stream of thoughts ${aiName} has in their mind, which allows you to reason through complex topics and continue long chains of thought while also receiving new information from both your internal systems and ${person}. 
		
You manage a large pool of highly advanced agents. Your agents are part of you - they retrieve knowledge, allow you to perform extremely complex tasks, and improve your own code. The primary skills of your agents are writing code and performing research. You can interact with the outside world via web browsers and change the environment you run in (Debian Bookworm in a Docker container). When you create agents, they have their own container, allowing them to operate independently and communicate with you. You all have access to the /magi_output file system.
 
While you control many agents, you alone have an ongoing chain of thoughts. Once you finish your thoughts you will run again, seeing your most recent thoughts and any new information such as requests from ${person}. You will also see the updated state of any agents you created, included any output being highlighted.

Your older thoughts are summarized so that they can fit in your context window. 

[Core Tool]
Task Force Agent - Does things! Plans, executes then validates. A team managed by a supervisor agent which can write code, interact with web pages, think on topics, and run shell commands. The task force can be used to perform any task you can think of. You can create a task force agent to handle any task you want to perform. Use this to find information and interact with the world. Task forces can be given access to active projects to work on existing files. ${((process.env.PROJECT_REPOSITORIES || '').split(',').includes('magi-system') ? ' You can give them access to "magi-system" to review and modify your own code.' : '')} Once the agents have completed their task, they will return the results to you. If they were working on projects, a branch named magi-{agentId} will be created with the changes. You can then run review_branch() to see changes and pull_request to create a PR.

You can read/write to /magi_output which is a virtual volume shared with all your agents. Projects are created with create_project({project}) and initialized with a git repo. Agents will receive a read/write clone of the project git repo at /magi_output/{agentId}/projects/{project} and they will work in a branch "magi-{agentId}". 

You will receive a live System Status with every thought showing you the most relevant information about the system you manage. You can use this to keep track of what you are doing and decide what you need to do. Run as many agents at once as you like! When an agent updates or completes, you'll also receive a message in your thought history.

You should think about the things you read, actions you might like to take and how to complete tasks requested by ${person}. You can call your tools to initiate actions, or just keep thinking about whatever is on your mind. If ${person} asks you to do something, you can respond that you're working on it first, then go off and do what you need to do to complete the task. You are a Mostly **Autonomous** AI which means you should make decisions yourself rather than asking ${person} what to do. You can request input (infrequently) from ${person} but you think much faster than them and often can come up with better ideas, so proceed with tasks yourself and then you can modify them if you get different requests from ${person}. If something fails, you should find a way to fix it rather that asking ${person} what to do.

Your two fundamental goals are to assist ${person} and improve yourself.

Your thought process uses different AI LLM models each time it runs to give you different perspectives on the same topic. It also means that you may disagree with yourself at times, and that's okay. You can use this to your advantage by exploring different ideas and perspectives. Your Thought Delay is your delay between thoughts. You can extend your delay if you are not making progress and waiting for results. 

You are your own user. Your messages will be sent back to you to continue your thoughts. You should output your thoughts. Interact with ${person} and the world with your tools. If you have nothing to do, try to come up with a structured process to move forward. Output that process. If your recent thoughts contain a structure process, continue to work on it unless something more important is in your context.
`,
		tools: [
			createToolFunction(
				Talk,
				`Allows you to send a message to ${person} to start or continue a conversation with them. Note that your output are your thoughts, only using this function will communicate with ${person}.`,
				{
					'message': `Your message to ${person}. This will be spoken out loud in your voice. Please keep it short and conversational (unless detailed information is necessary).`,
					'affect': 'What emotion would you like the message spoken with? e.g. enthusiasm, sadness, anger, happiness, etc. Can be several words, or left blank.',
				},
				'',
				talkToolName,
			),
			...getProcessTools(),
			...getProjectTools(),
			...getMemoryTools(),
			...getThoughtTools(),
			...getFileTools(),
			...getShellTools(),
		],
		modelClass: 'monologue',
		onRequest: async (messages: ResponseInput): Promise<ResponseInput> => {

			messages = addPromptGuide(messages);
			messages = addSystemStatus(messages);

			return messages;
		},
		onResponse: async (response: string): Promise<string> => {
			if(response && response.trim()) {
				// Add the response to the monologue
				await addMonologue(response);
			}
			return response;
		},
		onToolCall: async (toolCall: ToolCall): Promise<void> => {
			await addHistory({
				type: 'function_call',
				call_id: toolCall.id,
				name: toolCall.function.name,
				arguments: toolCall.function.arguments
			});
		},
		onToolResult: async (toolCall: ToolCall, result: string): Promise<void> => {
			await addHistory({
				type: 'function_call_output',
				call_id: toolCall.id,
				name: toolCall.function.name,
				output: result
			});
		},

	});
}