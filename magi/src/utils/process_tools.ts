import {ProcessToolType, ToolFunction} from '../types.js';
import {runGodelMachine} from '../magi_agents/godel_machine/index.js';
import {runResearchEngine} from '../magi_agents/research_engine/index.js';
import {runTask} from '../magi_agents/task_run/index.js';
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
		case 'run_task':
			await runTask(command);
			break;
	}
}



/**
 * Send a message to a specific process
 *
 * @param taskId The ID of the process to send the message to
 * @param message The message to send
 * @returns Success message or error
 */
function send_message(taskId: string, command: string): string {
	const process = processTracker.getProcess(taskId);

	if (!process || process.status === 'terminated') {
		return `Error: taskId ${taskId} has been terminated.`;
	}

	try {
		// Get the communication manager
		const comm = getCommunicationManager();

		// Send a command event to the controller that will route it to the target process
		comm.send({
			type: 'command_start',
			processId: taskId,
			command,
		});

		return `Message sent to taskId ${taskId} successfully`;
	} catch (error) {
		return `Error sending message to taskId ${taskId}: ${error}`;
	}
}


/**
 * Get the current status of a task
 * 
 * @param taskId The ID of the task to view
 * @param detailed Whether to return the full details (false = summarized view)
 * @returns A detailed or summarized view of the current status of the task
 */
async function get_task_status(taskId: string, detailed: boolean = false): Promise<string> {
	return processTracker.getStatus(taskId, !detailed);
}

/**
 * Check the health of all active tasks
 * Returns information about any tasks that appear to be failing or stuck
 * 
 * @returns Information about potentially failing tasks
 */
async function check_all_task_health(): Promise<string> {
	const failingTaskIds = await processTracker.checkTaskHealth();
	
	if (failingTaskIds.length === 0) {
		return 'All tasks appear to be functioning normally.';
	}
	
	let result = `WARNING: ${failingTaskIds.length} task(s) appear to be failing or stuck:\n\n`;
	
	for (const taskId of failingTaskIds) {
		const process = processTracker.getProcess(taskId);
		if (process) {
			result += `- Task ${taskId}: ${process.name} (Status: ${process.status})\n`;
		}
	}
	
	result += '\nConsider checking these tasks with get_task_status() for more details.';
	return result;
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

	const taskId = `AI-${Math.random().toString(36).substring(2, 8)}`;

	// Save a record of the process
	const agentProcess = processTracker.addProcess(taskId, {
		processId: taskId,
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

	return `taskId ${taskId} ${tool} (${name}) started at ${dateFormat()}.`;
}

// function startResearchEngine(name: string, command: string, project?: string[]): string {
// 	return startProcess('research_engine', name, command);
// }
// function startGodelMachine(name: string, command: string, project?: string[]): string {
// 	return startProcess('godel_machine', name, command);
// }
function start_task(name: string, task: string, context: string, warnings: string, goal: string, project?: string[]): string {
	const command: string[] = [];
	if(task)		command.push(`TASK:\n${task}`);
	if(context)		command.push(`CONTEXT:\n${context}`);
	if(warnings)	command.push(`WARNINGS:\n${warnings}`);
	if(goal)		command.push(`GOAL:\n${goal}`);
	return startProcess('run_task', name, command.join('\n\n'), project);
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
			start_task,
			'Starts a new Task. Uses human level intelligence.',
			{
				'name': 'Give this task a name - four words or less. Can be funny, like a fictional reference or a pun, or if none work make it descriptive.',
				'task': 'What task would like to work on? You should explain both the specific goal for the task and any additional information they need. Generally you should leave the way the task is performed up to the task operator unless you need a very specific set of tools used. Agents are expected to work autonomously, so will rarely ask additional questions.',
				'context': 'If this is a request from someone else, explain the original request here. If this in response to a problem or project you\'re working on, provide some background on the issue/project here. The task agents only have the background information you provide, so please make it comprehensive. A couple of paragraphs is ideal.',
				'warnings': 'Are there any warnings or things to be aware of? This could be a list of things to avoid, or things that are not working as expected. This is optional, but can help the task operator avoid problems.',
				'goal': 'What is the final goal of this task? This is the final output or result you expect from the task. It should be a single sentence or two at most',
				'project': {
					description: 'An array of projects to mount for the task giving the task access to a copy of files. The task can modify the files and submit them back as a new git branch.'+((process.env.PROJECT_REPOSITORIES || '').split(',').includes('magi-system') ? ' Include "magi-system" to provide access to your code.' : '')+' The task will have access to these files at /magi_output/{taskId}/projects/{project}. Their default branch will be "magi-{taskId}". If you provide only one project, that will be their working directory when they start (otherwise it will be /magi_output/{taskId}/working)',
					type: 'array',
					enum: (process.env.PROJECT_REPOSITORIES || '').split(','),
				},
			},
			'A description of information found or work that has been completed',
		),
		createToolFunction(
			send_message,
			'Send a message to an task you are managing',
			{
				'taskId': 'The ID of the task to send the message to',
				'command': 'The message to send to the task. Send \'stop\' to terminate the task. Any other message will be processed by the task as soon as it is able to.',
			},
			'If the message was sent successfully or not'
		),
		createToolFunction(
			get_task_status,
			'See the status of a task you are managing',
			{
				'taskId': 'The ID of the task to view',
				'detailed': 'Set to true for full details including complete history, or false (default) for a summarized view',
			},
			'A view of the current status of the task, summarized by default or detailed if requested.'
		),
		createToolFunction(
			check_all_task_health,
			'Check the health of all active tasks and identify any that appear to be failing or stuck',
			{},
			'Information about any tasks that may be failing, along with recommendations'
		),
	];
}
