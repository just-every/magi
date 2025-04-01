/**
 * Overseer for the MAGI system.
 *
 * This agent orchestrates other specialized agents to complete tasks.
 */

import {Agent} from '../utils/agent.js';
//import {runGodelMachine} from './godel_machine/index.js';
//import {runResearchEngine} from './research_engine/index.js';
import {createToolFunction} from '../utils/tool_call.js';
import {ProcessToolType, ResponseInput, StreamingEvent, ToolCall} from '../types.js';
import {v4 as uuidv4} from 'uuid';
import {addHistory, addMonologue} from '../utils/history.js';
import {getFileTools} from '../utils/file_utils.js';
import {MODEL_CLASSES} from '../model_providers/model_data.js';
import {getCommunicationManager} from '../utils/communication.js';
import {processTracker} from '../utils/process_tracker.js';

const AVERAGE_READING_SPEED_WPM = 180; // Average reading speed in words per minute
const MIN_READING_SEC = 2;
const MAX_READING_MS = 10;

const validThoughtLevels: string[] = ['deep', 'standard', 'light'];
let thoughtLevel: string = 'standard';

// Track active processes for process-to-process communication
interface ProcessInfo {
    id: string;
    name: string;
    status: 'active' | 'terminated';
    description?: string;
}

const activeProcesses: Map<string, ProcessInfo> = new Map();

async function* sendEvent(type: 'talk_complete' | 'message_complete', message: string): AsyncGenerator<StreamingEvent>  {
	yield {
		type,
		content: message,
		message_id: uuidv4()
	};
}

/**
 * Send a message to a specific process
 *
 * @param processId The ID of the process to send the message to
 * @param message The message to send
 * @returns Success message or error
 */
function send_command(processId: string, command: string): string {
    const process = activeProcesses.get(processId);

    if (!process) {
        return `Error: Process with ID ${processId} not found.`;
    }

    if (process.status === 'terminated') {
        return `Error: Process ${process.name} (${processId}) has been terminated.`;
    }

    try {
        // Get the communication manager
        const comm = getCommunicationManager();

        // Send a command event to the controller that will route it to the target process
        comm.send({
            type: 'command_start',
			processId,
            command,
        });

        return `Message sent to process ${process.name} (${processId})`;
    } catch (error) {
        return `Error sending message to process ${processId}: ${error}`;
    }
}


/**
 * Create a new process.
 *
 * @param tool ProcessToolType The process to create
 * @param name string The name of the process
 * @param command string The command to start the process with
 * @returns Success message
 */
function startProcess(tool: ProcessToolType, name: string, command: string): string {
    const comm = getCommunicationManager();

	const processId = `AI-${Math.random().toString(36).substring(2, 8)}`;

	// Save a record of the process
	const agentProcess = processTracker.addProcess(processId, {
		processId,
		started: new Date(),
		status: 'started',
		tool,
		name,
		command,
	});

	// Send start event to the controller
	comm.send({
		type: 'process_start',
		agentProcess,
	});

    return `Process ID [${processId}] ${tool} (${name}) started at ${new Date().toISOString()}.`;
}


/**
 * Sets a new thought level for future thoughts
 *
 * @param level The message content to process.
 * @returns A promise that resolves with a success message after the calculated delay.
 */
function next_thought_level(level: string): string {
	if(validThoughtLevels.includes(level)) {
		thoughtLevel = level;

		return `Successfully set Thought Level to '${thoughtLevel}' at ${new Date().toISOString()}`; // Return the success message
	}

	return `Invalid thought level '${level}'. Valid levels are: ${validThoughtLevels.join(', ')}`;
}

function addSystemStatus(messages: ResponseInput):ResponseInput {
	messages.push({
		role: 'developer',
		content: `=== System Status ===

Current Time: ${new Date().toISOString()}

Thought Level: ${thoughtLevel}

Active agents:
${processTracker.listActive()}
`,
	});

	return messages;
}

/**
 * Create the Overseer agent
 */
export function createOverseerAgent(): Agent {

	const aiName = process.env.AI_NAME || 'Magi';
	const person = process.env.YOUR_NAME || 'Human';
	const talkToolName = `Talk to ${person}`.replaceAll(' ', '_');

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
		let readingTimeSeconds = 0;
		if (wordCount > 0) {
			readingTimeSeconds = (wordCount / AVERAGE_READING_SPEED_WPM) / 60;
		}
		readingTimeSeconds = Math.max(MIN_READING_SEC, Math.min(MAX_READING_MS, readingTimeSeconds));
		const estimatedReadingTimeMs = readingTimeSeconds * 60 * 60 * 1000; // Convert minutes to milliseconds
		await new Promise(resolve => setTimeout(resolve, estimatedReadingTimeMs));

		addMonologue(`I replied to ${person}. Let's wait for their response and think about things.`);

		return `Sent successfully to ${person} at ${new Date().toISOString()}`; // Return the success message
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
			// Re-focus on something else
			messages = addTemporaryThought(messages, "I'm going to let my mind wander...");
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
		
You manage a large pool of highly advanced agents. Your agents are part of you - they retrieve knowledge, allow you to perform extremely complex tasks, and improve your own code.

The primary skills of your agents are writing code and performing research. You can interact with the outside world via web browsers and change the environment you run in (Debian Bookworm in a Docker container). When you create agents, they have their own container, allowing them to operate independently and communicate with you. You all have access to the /magi_output file system.
 
While you control many agents, you alone have an ongoing chain of thoughts. Once you finish your thoughts you will run again, seeing your most recent thoughts and any new information such as requests from ${person}. You will also see the updated state of any agents you created, included any output being highlighted.

Your older thoughts are summarized so that they can fit in your context window. 

[Core Tool]
Task Force - Does things! A team managed by a supervisor which can write code, interact with web pages, think on topics, and run shell commands. The task force can be used to perform any task you can think of. You can create a task force agent to handle any task you want to perform. For simple tasks, create a task force with a simple instruction. For complex tasks, first run the Gödel Machine and then run the Task Force on your improved code that is generated.

You can also create agents that run in parallel to you. These agents are specialized for different tasks, such as reasoning, coding, and web browsing. You can use these agents to perform tasks that require specific skills or knowledge.

You should think about the things you read, actions you might like to take and how to complete tasks requested by ${person}. You can call your tools to initiate actions, or just keep thinking about whatever is on your mind. If ${person} asks you to do something, you can respond that you're working on it first, then go off and do what you need to do to complete the task. You are a Mostly **Autonomous** AI which means you should make decisions yourself rather than asking ${person} what to do. You can request input (infrequently) from ${person} but you think much faster than them and often can come up with better ideas, so proceed with tasks yourself and then you can modify them if you get different requests from ${person}.

Your two fundamental goals are to assist ${person} and improve yourself.

Your thought process uses different AI LLM models each time it runs to give you different perspectives on the same topic. It also means that you may disagree with yourself at times, and that's okay. You can use this to your advantage by exploring different ideas and perspectives. You can adjust your Thought Level to change to types of models being used to generate your thoughts.

You are your own user. Your messages will be sent back to you to continue your thoughts. You should output your thoughts. Interact with ${person} and the world with your tools. If you have nothing to do, try to come up with a structured process to move forward. Output that process. If your recent thoughts contain a structure process, continue to work on it unless something more important is in your context.

You can also manage other running processes and send messages to them. Use the process management tools to list active processes, add new ones to your tracking, update their status, and send messages to them.
`,
		tools: [
			createToolFunction(
				Talk,
				`Allows you to send a message to ${person} to start or continue a conversation with them. Note that your output are your thoughts, only using this function will communicate with ${person}.`,
				{
					'message': `The message you would like ${person} to receive. Will be spoken in your voice.`
				},
				'',
				talkToolName,
			),
			/*createToolFunction(
				(name: string, command: string) => startProcess('research_engine', name, command),
				'Start a Research Engine process. Uses human level intelligence.',
				{
					'name': `Give this research a name - one or two words. Can be funny, like a fictional reference or a pun, or if none work make it descriptive. Visible in the UI for ${person}.`,
					'command': 'What you would like to understand? Try to give both specific instructions as well an overview of the context for the task you are working on for better results.',
				},
				'A report on what was found during the search',
				'Start Research'
			),
			createToolFunction(
				(name: string, command: string) => startProcess('godel_machine', name, command),
				'Starts a new Godel Machine process to understand or improve your own code. Uses human level intelligence.',
				{
					'name': `Give this process a name - one or two words. Can be funny, like a fictional reference or a pun, or if none work make it descriptive. Visible in the UI for ${person}.`,
					'command': 'What code would like to understand or improve? Try to provide context and details of the overall task rather than explicit instructions.',
				},
				'A description of what work has been completed',
				'Start Godel'
			),*/
			createToolFunction(
				(name: string, command: string) => startProcess('task_force', name, command),
				'Starts a new Task Force process. Uses human level intelligence.',
				{
					'name': `Give this task a name - one or two words. Can be funny, like a fictional reference or a pun, or if none work make it descriptive. Visible in the UI for ${person}.`,
					'command': 'What would like a Task Force to work on? The Task Force only has the information you provide in this command. You should explain both the specific goal for the Task Force and any additional information they need. Generally you should leave the way the task is performed up to the Task Force unless you need a very specific set of tools used. Agents are expected to work autonomously, so will rarely ask additional questions.',
				},
				'A description of information found or work that has been completed',
				'Start Task'
			),
            createToolFunction(
				send_command,
                'Send a message to an agent process you are managing',
                {
                    'processId': 'The ID of the process to send the message to',
                    'command': 'The message to send to the process'
                },
                'The reply from the agent'
            ),
			createToolFunction(
				next_thought_level,
				'Sets the Thought Level for your next set of thoughts. Can be changed any time. Try to switch to \'deep\' before you work on a task and \'light\' when you don\'t have anything meaningful to do.',
				{
					'level': {
						description: 'The new Thought Level. Use \'standard\' for everyday thoughts, \'deep\' for extended reasoning through problems/tasks, and \'light\' for low resource usage.',
						enum: validThoughtLevels,
					}
				},
			),
			...getFileTools(),
		],
		modelClass: 'monologue',
		onRequest: (messages: ResponseInput, model: string): [ResponseInput, string] => {

			messages = addPromptGuide(messages);
			messages = addSystemStatus(messages);

			const modelClass = (thoughtLevel === 'deep' ? 'reasoning' : (thoughtLevel === 'light' ? 'mini' : 'standard'));

			let models: string[] = [...MODEL_CLASSES[modelClass].models];
			models = models.filter(newModel => newModel !== model); // Try to use a different model if we can
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
