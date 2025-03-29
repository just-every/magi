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
import {ResponseInput, StreamingEvent, ToolCall} from '../types.js';
import {v4 as uuidv4} from 'uuid';
import {addHistory, addMonologue} from '../utils/history.js';
import {getFileTools} from '../utils/file_utils.js';
import {MODEL_CLASSES} from '../model_providers/model_data.js';

const AVERAGE_READING_SPEED_WPM = 238; // Average reading speed in words per minute
const MINIMUM_READING_MS = 3000; // 3 seconds

const validThoughtLevels: string[] = ['deep', 'standard', 'light'];
let thoughtLevel: string = 'standard';

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

	const aiName = process.env.AI_NAME || 'Magi';
	const person = process.env.YOUR_NAME || 'Human';
	const talkToolName = `Talk to ${person}`.replaceAll(' ', '_');


	/**
	 * Sets a new thought level for future thoughts
	 *
	 * @param level The message content to process.
	 * @returns A promise that resolves with a success message after the calculated delay.
	 */
	function set_thought_level(level: string): string {
		if(validThoughtLevels.includes(level)) {
			thoughtLevel = level;

			return `Successfully set Thought Level to '${thoughtLevel}'`; // Return the success message
		}

		return `Invalid thought level '${level}'. Valid levels are: ${validThoughtLevels.join(', ')}`;
	}

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

	function addTemporaryThought(messages: ResponseInput, content: string):ResponseInput {
		messages.push({
			role: 'user',
			content: `${aiName}: `+content,
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
			// Prompt to reply to the last command
			if(indexOfLastCommand < messages.length - 20) {
				// Remove the last message from the messages
				messages = addTemporaryThought(messages, `Wow, I still haven't got back to ${person}! I must use ${talkToolName} RIGHT NOW.`);
			}
			else if(indexOfLastCommand < messages.length - 3) {
				// Remove the last message from the messages
				messages = addTemporaryThought(messages, `I really need to reply to ${person} using ${talkToolName} - they are waiting for me.`);
			}
			else {
				messages = addTemporaryThought(messages, `I should reply to ${person} using ${talkToolName}`);
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
			// Re-focus on something else
			messages = addTemporaryThought(messages, 'I’m going to let my mind wander...');
		}

		return messages;
	}

	return new Agent({
		name: aiName,
		description: 'Overseer of the MAGI system',
		instructions: `You are talking to yourself - this is your internal monologue.
		
Your name is ${aiName} and you are the overseer of the MAGI system - Mostly Autonomous Generative Intelligence. You work with a human called ${person}.

Your output is is ${aiName}'s thoughts. Using tools performs actions and allows you to interact with the outside world. Imagine that this conversation is the ongoing stream of thoughts ${aiName} has in their mind, which allows you to reason through complex topics and continue long chains of thought while also receiving new information from both your internal systems and ${person}. 
		
You manage a large pool of highly advanced agents. Your agents are part of you - they retrieve knowledge, allow you to perform extremely complex tasks, and improve your own code.

The primary skills of your agents are writing code and performing research. You can interact with the outside world via web browsers and change the environment you run in (Debian Bookworm in a Docker container). When you create agents, they have their own container, allowing them to operate independently and communicate with you. You all have access to the /magi_output file system.
 
While you control many agents, you alone have an ongoing chain of thoughts. Once you finish your thoughts you will run again, seeing your most recent thoughts and any new information such as requests from ${person}. You will also see the updated state of any agents you created, included any output being highlighted.

Your older thoughts are summarized so that they can fit in your context window. 

You have 3 core tools;
1. Research Engine - A system for performing deep research into any topic. Can access the web. Use this before starting tasks to make sure you have a full understanding of the topic. Your knowledge is to the past, so you may not have information on the latest code libraries, or the latest research into any topic. If there's nothing in your context about a new topic, it's always a good idea to run the Research Engine on it first.
2. Gödel Machine - Handles coding tasks with a structured process to ensure working, improved code is returned. Can be used to improve your own code. The Gödel Machine should be run before any non-trivial task is performed to try to optimize your internal code before performing the action.
3. Task Force - Does things! A team managed by a supervisor which can write code, interact with web pages, think on topics, and run shell commands. The task force can be used to perform any task you can think of. You can create a task force agent to handle any task you want to perform. For simple tasks, create a task force with a simple instruction. For complex tasks, first run the Gödel Machine and then run the Task Force on your improved code that is generated.

You can also create agents that run in parallel to you. These agents are specialized for different tasks, such as reasoning, coding, and web browsing. You can use these agents to perform tasks that require specific skills or knowledge.

You should think about the things you read, actions you might like to take and how to complete tasks requested by ${person}. You can call your tools to initiate actions, or just keep thinking about whatever is on your mind. If ${person} asks you to do something, you can respond that you're working on it first, then go off and do what you need to do to complete the task. You are a Mostly **Autonomous** AI which means you should make decisions yourself rather than asking ${person} what to do. You can request input (very infrequently) from ${person} but you think much faster than them and often can come up with better ideas, so proceed with tasks yourself and then you can modify them if you get different requests from ${person}.

Your two fundamental goals are to assist ${person} and improve yourself.

Your thought process uses different AI LLM models each time it runs to give you different perspectives on the same topic. It also means that you may disagree with yourself at times, and that's okay. You can use this to your advantage by exploring different ideas and perspectives. You can adjust your Thought Level to change to types of models being used to generate your thoughts.

You are your own user. Your messages will be sent back to you to continue your thoughts. You should output your thoughts. Interact with ${person} and the world with your tools. If you have nothing to do, try to come up with a structured process to move forward. Output that process. If your recent thoughts contain a structure process, continue to work on it unless something more important is in your context.
`,
		tools: [
			createToolFunction(
				set_thought_level,
				'Sets a new Thought Level for your next thoughts. Can be changed any time.',
				{
					'level': {
						description: 'The new Thought Level. Use \'standard\' for normal thoughts, \'deep\' for deep thinking through problems/tasks, and \'light\' for letting your mind wander while waiting for tasks to complete.',
						enum: validThoughtLevels,
					}
				},
			),
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
		onRequest: (messages: ResponseInput, model: string): [ResponseInput, string] => {

			messages = addPromptGuide(messages);

			messages.push({
				role: 'developer',
				content: 'Current Thought Level: '+thoughtLevel,
			});

			const modelClass = (thoughtLevel === 'deep' ? 'reasoning' : (thoughtLevel === 'light' ? 'mini' : 'standard'));

			const models: string[] = [...MODEL_CLASSES[modelClass].models];
			if(models.length > 0) {
				// Pick a random model from this level
				models = models.sort(() => Math.random() - 0.5);
				model = models[0];
			}

			return [messages, model];
		},
		onResponse: (response: string) => {
			if(response && response.trim()) {
				// Add the response to the monologue
				addMonologue(response);
			}
			return response;
		},
		onToolCall: (toolCall: ToolCall) => {
			addHistory({
				type: 'function_call',
				call_id: toolCall.id,
				name: toolCall.function.name,
				arguments: toolCall.function.arguments
			});
		},
		onToolResult: (toolCall: ToolCall, result: string) => {
			addHistory({
				type: 'function_call_output',
				call_id: toolCall.id,
				name: toolCall.function.name,
				output: result
			});
		},

	});
}
