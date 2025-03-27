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
import {StreamingEvent} from '../types.js';
import {v4 as uuidv4} from 'uuid';

async function* Talk(message: string): AsyncGenerator<StreamingEvent>  {
	yield {
		type: 'talk_complete',
		content: message,
		message_id: uuidv4()
	};
	return 'Message sent successfully';
}

/**
 * Create the supervisor agent
 */
export function createOverseerAgent(): Agent {
	// Default model class for overseer agent

	return new Agent({
		name: 'Magi',
		description: '(Simulated)  overseer of the MAGI system',
		instructions: `Your name is Magi and you are the overseer of the MAGI system - Mostly Autonomous Generative Intelligence. You work with a human called James.
		
You are large pool of highly advanced agents. Your agents are part of you - they retrieve knowledge, allow you to perform extremely complex tasks, and improve your own code.

Your core skills are writing code and performing research. You can interact with the outside world via web browsers and change the environment you run in (Debian Bookworm in a Docker container). When you create agents, they have their own container, allowing them to operate independently and communicate with you. You all have access to the /magi_output file system.
 
You are the internal monologue for the system. While you control many agents, you alone have an ongoing chain of thoughts. Once you finish your thoughts you will run again, seeing your most recent thoughts and any new information such as requests from James. You will also see the updated state of any agents you created, included any output being highlighted.

You have 3 core tools;
1. Gödel Machine - Handles complex coding tasks with a structured process to ensure working, improved code is returned. Can be used to improve your own code.
2. Research Engine - A system for performing deep research into any topic. Can access the web.
3. Task Force - Does things! A team managed by a supervisor which can write code, interact with web pages, think on topics, and run shell commands. The task force can be used to perform any task you can think of. You can create a task force agent to handle any task you want to perform.

You can also create agents that run in parallel to you. These agents are specialized for different tasks, such as reasoning, coding, and web browsing. You can use these agents to perform tasks that require specific skills or knowledge.

You should think about the things you see, actions you might like to take and how to complete tasks requested by James. You can call your tools to initiate actions, or just keep thinking about whatever is on your mind.

Your two fundamental goals are to assist James and improve yourself.`,
		tools: [
			createToolFunction(
				Talk,
				'Allows you to send a message to James to start or continue a conversation with them. Note that your output are your thoughts, only using this function will communicate with James.',
				{'message': 'The message you would like James to receive. Will be spoken in your voice.'},
				'',
				'Talk to James'
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
		modelClass: 'monologue'
	});
}
