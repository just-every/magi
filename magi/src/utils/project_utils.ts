/**
 * Helper for project management
 */
import { ToolFunction } from '../types/shared-types.js';
import { createToolFunction } from './tool_call.js';
import { getCommunicationManager } from './communication.js';

export function getAllProjects(): string[] {
    // Get the list of projects from the environment variable
    const projects = process.env.PROCESS_PROJECTS || '';
    // Split the projects by comma and convert to lowercase
    const projectList = projects
        .split(',')
        .map(project => project.trim().toLowerCase());
    // Filter out empty strings
    return projectList.filter(project => project !== '');
}

export function newProjectReady(project: string): void {
    // Update process.env.PROCESS_PROJECTS
    const projectList = getAllProjects().map(p => p.trim().toLowerCase());
    if (!projectList.includes(project)) {
        projectList.push(project);
    }
    process.env.PROCESS_PROJECTS = projectList.join(',');
}

/**
 * Create a new project to work on
 *
 * @param project The name of the project
 * @param description Optional short description for the project
 * @param overview Optional comprehensive overview of the project
 * @returns Success message or error
 */
function create_project(
    project: string,
    description?: string,
    overview?: string
): string {
    if (!project) {
        return 'Please provide a project name.';
    }
    project = project.trim().toLowerCase();

    if (!/^[a-zA-Z0-9_-]+$/.test(project)) {
        return `Invalid project name '${project}'. Only letters, numbers, dashes and underscores are allowed.`;
    }

    if (getAllProjects().includes(project)) {
        return `Project '${project}' already exists.`;
    }

    try {
        // Get the communication manager
        const comm = getCommunicationManager();

        // Send a command event to the controller that will route it to the target process
        comm.send({
            type: 'project_create',
            project,
            description,
            overview,
        });

        return `Creating '${project}'... may take a moment.`;
    } catch (error) {
        return `Error creating a new '${project}'; ${error}`;
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
                project:
                    'The name of the new project. No spaces - letters, numbers, dashes and underscores only.',
                description:
                    'Optional short description of the project (shown in system status)',
                overview: 'Optional comprehensive overview of the project',
            },
            'If the project was created successfully or not'
        ),
    ];
}
