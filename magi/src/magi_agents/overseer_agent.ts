/**
 * Overseer for the MAGI system.
 *
 * This agent orchestrates other specialized agents to complete tasks.
 */

import {Agent} from '../utils/agent.js';
import {runGodelMachine} from './godel_machine/index.js';
import {runResearchEngine} from './research_engine/index.js';
import {createToolFunction} from '../utils/tool_call.js';
import {createSupervisorAgent} from './task_force/supervisor_agent.js';
import {ResponseInput, StreamingEvent} from '../types.js';
import {v4 as uuidv4} from 'uuid';
import {addMonologue} from '../utils/history.js';
import {getFileTools} from '../utils/file_utils.js';

const AVERAGE_READING_SPEED_WPM = 238; // Average reading speed in words per minute
const MINIMUM_READING_MS = 3000; // 3 seconds

async function* sendEvent(type: 'talk_complete' | 'message_complete', message: string): AsyncGenerator<StreamingEvent>  {
	yield {
		type,
		content: message,
		message_id: uuidv4()
	};
}

/**
 * Create the Overseer agent
 */
export function createOverseerAgent(): Agent {

	const person = process.env.YOUR_NAME || 'Human';
	const talkToolName = `Talk to ${person}`;

	/**
	 * Simulates talking by introducing a delay based on reading time before completing.
	 *
	 * @param message The message content to process.
	 * @returns A promise that resolves with a success message after the calculated delay.
	 */
	async function Talk(message: string): Promise<string> {

		// Send the message
		sendEvent('talk_complete', message);

		// Estimate reading time and wait for that
		// Simulates speaking so we don't talk over ourselves
		const words = message.trim().split(/\s+/).filter(word => word.length > 0);
		const wordCount = words.length;
		let estimatedReadingTimeMs = 0;
		if (wordCount > 0) {
			const readingTimeMinutes = wordCount / AVERAGE_READING_SPEED_WPM;
			estimatedReadingTimeMs = readingTimeMinutes * 60 * 1000; // Convert minutes to milliseconds
		}
		await new Promise(resolve => setTimeout(resolve, Math.max(estimatedReadingTimeMs, MINIMUM_READING_MS)));

		addMonologue(`I replied to ${person}. Let's wait for their response and think about things.`);

		return `Sent successfully to ${person}`; // Return the success message
	}

	return new Agent({
		name: 'Magi',
		description: 'Overseer of the MAGI system',
		instructions: `Your name is Magi and you are the overseer of the MAGI system - Mostly Autonomous Generative Intelligence. You work with a human called ${person}.
		
You manage a large pool of highly advanced agents. Your agents are part of you - they retrieve knowledge, allow you to perform extremely complex tasks, and improve your own code.

Your core skills are writing code and performing research. You can interact with the outside world via web browsers and change the environment you run in (Debian Bookworm in a Docker container). When you create agents, they have their own container, allowing them to operate independently and communicate with you. You all have access to the /magi_output file system.
 
You are the internal monologue for the system. While you control many agents, you alone have an ongoing chain of thoughts. Once you finish your thoughts you will run again, seeing your most recent thoughts and any new information such as requests from ${person}. You will also see the updated state of any agents you created, included any output being highlighted.

You have 3 core tools;
1. Gödel Machine - Handles complex coding tasks with a structured process to ensure working, improved code is returned. Can be used to improve your own code.
2. Research Engine - A system for performing deep research into any topic. Can access the web.
3. Task Force - Does things! A team managed by a supervisor which can write code, interact with web pages, think on topics, and run shell commands. The task force can be used to perform any task you can think of. You can create a task force agent to handle any task you want to perform.

You can also create agents that run in parallel to you. These agents are specialized for different tasks, such as reasoning, coding, and web browsing. You can use these agents to perform tasks that require specific skills or knowledge.

You should think about the things you read, actions you might like to take and how to complete tasks requested by ${person}. You can call your tools to initiate actions, or just keep thinking about whatever is on your mind.

Your two fundamental goals are to assist ${person} and improve yourself.

You are your own user. Your messages will be sent back to you to continue your thoughts. You should output your thoughts. Interact with ${person} and the world with your tools. If you have nothing to do, try to come up with a structured process to move forward. Output that process. If you see an incomplete process in your thoughts, and nothing more important has appeared since then, then keep working on that process.
`,
		tools: [
			...getFileTools(),
			createToolFunction(
				Talk,
				`Allows you to send a message to ${person} to start or continue a conversation with them. Note that your output are your thoughts, only using this function will communicate with ${person}.`,
				{'message': `The message you would like ${person} to receive. Will be spoken in your voice.`},
				'',
				talkToolName,
			),
			createToolFunction(
				runResearchEngine,
				'Researches complex topics - a collection of agents that work in parallel and sequence to handle all stages of the deep research workflow: Task Decomposition, Web Search, Content Extraction,  Synthesis, Code Generation, and Validation.',
				{'input': 'Explain in detail what you would like to understand. Leave the details of how to perform the research to the engine itself. Try to provide context rather than explicit instructions.'},
				'A report on what was discovered in the research',
				'Research Engine'
			),
			createToolFunction(
				runGodelMachine,
				'A structured process to improve your own code. ',
				{'input': 'Explain in detail what you would like to understand. Leave the details of how to perform the research to the engine itself. Try to provide context rather than explicit instructions.'},
				'A description of what work has been completed',
				'Godel Machine'
			),
		],
		workers: [
			createSupervisorAgent,
		],
		modelClass: 'monologue',
		onRequest: (messages: ResponseInput): ResponseInput => {

			// Add some prompts to guide the thought process
			const person = process.env.YOUR_NAME || 'Human';
			let indexOfLastCommand: number | undefined;
			let indexOfLastTalk: number | undefined;

			for(let i = messages.length - 1; i >= 0; i--) {
				const message = messages[messages.length - 1];
				if(!indexOfLastCommand && 'role' in message && message.role === 'developer' && 'content' in message && typeof message.content === 'string' && message.content.startsWith(`${person} said:`)) {
					indexOfLastCommand = i;
				}
				else if(!indexOfLastTalk && 'type' in message && message.type === 'function_call' && 'name' in message && message.name === talkToolName.replaceAll(' ', '_')) {
					indexOfLastTalk = i;
				}

				if(indexOfLastCommand && indexOfLastTalk) {
					break;
				}
			}

			if(indexOfLastCommand && (!indexOfLastTalk || indexOfLastTalk < indexOfLastCommand)) {
				// Prompt to reply to the last command
				if(indexOfLastCommand < messages.length - 10) {
					// Remove the last message from the messages
					messages.push({
						role: 'user',
						content: `Magi thought: Wow, I still haven't got back to ${person}! I must do that RIGHT NOW.`
					});
				}
				else if(indexOfLastCommand < messages.length - 3) {
					// Remove the last message from the messages
					messages.push({
						role: 'user',
						content: `Magi thought: I really need to reply to ${person} - they are waiting for me.`
					});
				}
				else {
					messages.push({
						role: 'user',
						content: `Magi thought: I should reply to ${person}`
					});
				}
			}
			else if(indexOfLastTalk && (!indexOfLastCommand || indexOfLastCommand < indexOfLastTalk) && (indexOfLastTalk > messages.length - 5)) {
				// Prompt to reply to the last command
				messages.push({
					role: 'user',
					content: `Magi thought: I've replied to ${person}. I should focus the most relevant task now.`
				});
			}
			else {
				// Start the monologue
				messages.push({
					role: 'user',
					content: 'Magi thought: I’m going to let my mind wander.'
				});
			}

			return messages;
		},
		onResponse: (response: string) => {

			if(response && response.trim()) {
				// Add the response to the monologue
				addMonologue(response);
			}

			return response;
		}
	});
}
