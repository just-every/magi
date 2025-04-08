import {ProcessToolType, ToolFunction} from '../types.js';
import {runGodelMachine} from '../magi_agents/godel_machine/index.js';
import {runResearchEngine} from '../magi_agents/research_engine/index.js';
import {runTaskForce} from '../magi_agents/task_force/index.js';
import {getCommunicationManager} from './communication.js';
import {processTracker} from './process_tracker.js';
import {dateFormat} from './date_tools.js';
import {createToolFunction} from './tool_call.js';

export async function runProcessTool(
	tool: ProcessToolType,
	command: string,
): Promise<void> {

	switch (tool) {
		case 'research_engine':
			await runResearchEngine(command);
			break;
		case 'godel_machine':
			await runGodelMachine(command);
			break;
		case 'task_force':
			await runTaskForce(command);
			break;
	}
}



/**
 * Send a message to a specific process
 *
 * @param agentId The ID of the process to send the message to
 * @param message The message to send
 * @returns Success message or error
 */
function send_message(agentId: string, command: string): string {
	const process = processTracker.getProcess(agentId);

	if (!process || process.status === 'terminated') {
		return `Error: AgentID ${agentId} has been terminated.`;
	}

	try {
		// Get the communication manager
		const comm = getCommunicationManager();

		// Send a command event to the controller that will route it to the target process
		comm.send({
			type: 'command_start',
			processId: agentId,
			command,
		});

		return `Message sent to AgentID ${agentId} successfully`;
	} catch (error) {
		return `Error sending message to AgentID ${agentId}: ${error}`;
	}
}


/**
 * Get the current status of an agent
 */
function get_agent_status(agentId: string): string {
	return processTracker.getStatus(agentId);
}


/**
 * Create a new process.
 *
 * @param tool ProcessToolType The process to create
 * @param name string The name of the process
 * @param command string The command to start the process with
 * @param project string[] Array of project names to mount (from those available in PROJECT_REPOSITORIES)
 * @returns Success message
 */
function startProcess(tool: ProcessToolType, name: string, command: string, project?: string[]): string {
	const comm = getCommunicationManager();

	const agentId = `AI-${Math.random().toString(36).substring(2, 8)}`;

	// Save a record of the process
	const agentProcess = processTracker.addProcess(agentId, {
		processId: agentId,
		started: new Date(),
		status: 'started',
		tool,
		name,
		command,
		project,
	});

	// Send start event to the controller
	comm.send({
		type: 'process_start',
		agentProcess,
	});

	return `Agent ID [${agentId}] ${tool} (${name}) started at ${dateFormat()}.`;
}

// function startResearchEngine(name: string, command: string, project?: string[]): string {
// 	return startProcess('research_engine', name, command);
// }
// function startGodelMachine(name: string, command: string, project?: string[]): string {
// 	return startProcess('godel_machine', name, command);
// }
function startTaskForce(name: string, command: string, project?: string[]): string {
	return startProcess('task_force', name, command, project);
}


export function listActiveProjects(): string {
	const projects = (process.env.PROJECT_REPOSITORIES || '').split(',');
	if(projects.length === 0) {
		return '- No projects';
	}

	return projects.map(project => `- ${project}`).join('\n');
}

/**
 * Get all project tools as an array of tool definitions
 */
export function getProcessTools(): ToolFunction[] {
	return [
		/*createToolFunction(
				startResearchEngine,
				'Start a Research Engine process. Uses human level intelligence.',
				{
					'name': `Give this research a name - three words or less. Can be funny, like a fictional reference or a pun, or if none work make it descriptive. Visible in the UI for ${person}.`,
					'command': 'What you would like to understand? Try to give both specific instructions as well an overview of the context for the task you are working on for better results.',
				},
				'A report on what was found during the search',
				'Start Research'
			),
			createToolFunction(
				startGodelMachine,
				'Starts a new Godel Machine process to understand or improve your own code. Uses human level intelligence.',
				{
					'name': `Give this process a name - three words or less. Can be funny, like a fictional reference or a pun, or if none work make it descriptive. Visible in the UI for ${person}.`,
					'command': 'What code would like to understand or improve? Try to provide context and details of the overall task rather than explicit instructions.',
				},
				'A description of what work has been completed',
				'Start Godel'
			),*/
		createToolFunction(
			startTaskForce,
			'Starts a new Task Force. Uses human level intelligence.',
			{
				'name': 'Give this task a name - three words or less. Can be funny, like a fictional reference or a pun, or if none work make it descriptive.',
				'command': 'What would like a Task Force to work on? The Task Force only has the information you provide in this command. You should explain both the specific goal for the Task Force and any additional information they need. Generally you should leave the way the task is performed up to the Task Force unless you need a very specific set of tools used. Agents are expected to work autonomously, so will rarely ask additional questions.',
				'project': {
					description: 'An array of projects to mount for the Task Force giving the Task Force access to a copy of files. The Task Force can modify the files and submit them back as a new git branch.'+((process.env.PROJECT_REPOSITORIES || '').split(',').includes('magi-system') ? ' Include "magi-system" to provide access to your code.' : '')+' The Task Force will have access to these files at /magi_output/{agentId}/projects/{project}. Their default branch will be "magi-{agentId}". If you provide only one project, that will be their working directory when they start (otherwise it will be /magi_output/{agentId}/working)',
					type: 'array',
					enum: (process.env.PROJECT_REPOSITORIES || '').split(','),
				},
			},
			'A description of information found or work that has been completed',
			'start task'
		),
		createToolFunction(
			send_message,
			'Send a message to an agent you are managing',
			{
				'agentId': 'The ID of the agent to send the message to',
				'command': 'The message to send to the agent. Send \'stop\' to terminate the agent. Any other message will be processed by the agent as soon as it is able to.',
			},
			'If the message was sent successfully or not'
		),
		createToolFunction(
			get_agent_status,
			'See the full details of an agent you are managing',
			{
				'agentId': 'The ID of the agent to send the message to',
			},
			'A detailed history of all messages and events for the agent.'
		),
	];
}
