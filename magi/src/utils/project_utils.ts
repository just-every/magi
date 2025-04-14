/**
 * Helper for project management
 */
import {ToolFunction} from '../types.js';
import {createToolFunction} from './tool_call.js';
import {getCommunicationManager} from './communication.js';


/**
 * Create a new project to work on
 *
 * @param project The name of the project
 * @returns Success message or error
 */
function create_project(project: string): string {
	if (!project) {
		return 'Please provide a project name.';
	}

	if(!/^[a-zA-Z0-9_-]+$/.test(project)) {
		return `Invalid project name '${project}'. Only letters, numbers, dashes and underscores are allowed.`;
	}

	if((process.env.PROJECT_REPOSITORIES || '').toLowerCase().split(',').includes(project.toLowerCase())) {
		return `Project '${project}' already exists.`;
	}

	try {
		// Get the communication manager
		const comm = getCommunicationManager();

		// Send a command event to the controller that will route it to the target process
		comm.send({
			type: 'project_create',
			project,
		});

		return `Creating '${project}'... may take a moment.`;
	} catch (error) {
		return `Error creating a new '${project}'; ${error}`;
	}
}

/**
 * Review the branch created by an agent
 */
function review_branch(project: string, branch: string): string {
	if (!project || !branch) {
		return 'Error: Project name and branch name are required.';
	}

	if(!/^[a-zA-Z0-9_-]+$/.test(project)) {
		return `Invalid project name '${project}'. Only letters, numbers, dashes and underscores are allowed.`;
	}

	// Verify project exists in the list of available projects
	if(!(process.env.PROJECT_REPOSITORIES || '').toLowerCase().split(',').includes(project.toLowerCase())) {
		return `Error: Project '${project}' does not exist. Available projects: ${process.env.PROJECT_REPOSITORIES}`;
	}

	try {
		// Get the communication manager
		const comm = getCommunicationManager();

		// Send a command event to the controller to handle the branch review
		comm.send({
			type: 'branch_review',
			project,
			branch,
		});

		return `Reviewing branch '${branch}' for project '${project}'... You will receive a notification when the review is complete.`;
	} catch (error) {
		return `Error reviewing branch '${branch}' for project '${project}': ${error}`;
	}
}



/**
 * Create a pull request from a branch to another branch
 */
function pull_request(project: string, from_branch: string, to_branch: string): string {
	if (!project || !from_branch || !to_branch) {
		return 'Error: Project name, source branch, and destination branch are required.';
	}

	if(!/^[a-zA-Z0-9_-]+$/.test(project)) {
		return `Invalid project name '${project}'. Only letters, numbers, dashes and underscores are allowed.`;
	}

	// Verify project exists in the list of available projects
	if(!(process.env.PROJECT_REPOSITORIES || '').toLowerCase().split(',').includes(project.toLowerCase())) {
		return `Error: Project '${project}' does not exist. Available projects: ${process.env.PROJECT_REPOSITORIES}`;
	}

	try {
		// Handle special case for "default" branch
		const targetBranch = to_branch === 'default' ? 'main' : to_branch;

		// Get the communication manager
		const comm = getCommunicationManager();

		// Send a command event to the controller to handle the pull request
		comm.send({
			type: 'pull_request',
			project,
			from_branch,
			to_branch: targetBranch,
		});

		return `Creating pull request from '${from_branch}' to '${targetBranch}' for project '${project}'... You will receive a notification when the pull request is created.`;
	} catch (error) {
		return `Error creating pull request from '${from_branch}' to '${to_branch}' for project '${project}': ${error}`;
	}
}


/**
 * Get all project tools as an array of tool definitions
 */
export function getProjectTools(): ToolFunction[] {
	return [
		createToolFunction(
			create_project,
			'Create a new project with a common git repository to work on. You can then give agents access to it.',
			{
				'project': 'The name of the new project. No spaces - letters, numbers, dashes and underscores only.',
			},
			'If the project was created successfully or not'
		),
		createToolFunction(
			review_branch,
			'Review a branch created by an task.',
			{
				'project': 'The name of the new project. No spaces - letters, numbers, dashes and underscores only.',
				'branch': 'The branch review. Use "magi-{taskId}" for an task\'s default branch.',
			},
			'An explanation of if the branch was merged or not and why.'
		),
		createToolFunction(
			pull_request,
			'Creates a pull request to merge a branch into another branch.',
			{
				'project': 'The name of the new project. No spaces - letters, numbers, dashes and underscores only.',
				'from_branch': 'The branch review. Use "magi-{taskId}" for an task\'s default branch.',
				'to_branch': 'The destination branch. Use "default" for main/master if you don\'t know it\'s name.' ,
			},
			'If the request was successfully started or not. You will get a separate message if it is merged or rejected.'
		),
	];
}
