/**
 * Helper for project management
 */
import { ToolFunction, ProjectType } from '../types/shared-types.js';
import { sendStreamEvent } from './communication.js';
import { getDB } from './db.js';
import { createToolFunction } from './tool_call.js';
import {
    PROJECT_TYPES,
    PROJECT_TYPE_DESCRIPTIONS,
} from '../constants/project_types.js';

export function getExternalProjectIds(): string[] {
    // Get the list of projects from the environment variable
    const projects = process.env.PROJECT_REPOSITORIES || '';
    // Split the projects by comma and convert to lowercase
    const projectList = projects
        .split(',')
        .map(project => project.trim().toLowerCase());
    // Filter out empty strings
    return projectList.filter(project => project !== '');
}

export function getProcessProjectIds(): string[] {
    // Get the list of projects from the environment variable
    const projects = process.env.PROCESS_PROJECTS || '';
    // Split the projects by comma and convert to lowercase
    const projectList = projects
        .split(',')
        .map(project => project.trim().toLowerCase());
    // Filter out empty strings
    return projectList.filter(project => project !== '');
}

export function getProcessProjectPorts(): Record<string, string> {
    const ports = process.env.PROJECT_PORTS || '';
    const entries = ports
        .split(',')
        .map(pair => pair.trim())
        .filter(pair => pair);
    const map: Record<string, string> = {};
    for (const entry of entries) {
        const [id, port] = entry.split(':');
        if (id && port) {
            map[id.toLowerCase()] = port;
        }
    }
    return map;
}

export async function getAllProjectIds(): Promise<string[]> {
    // Get all project IDs from the database
    const db = await getDB();
    try {
        const result = await db.query(
            'SELECT project_id FROM projects ORDER BY project_id'
        );
        return result.rows.map(row => row.project_id);
    } catch (error) {
        console.error('Error getting project IDs:', error);
        return [];
    } finally {
        db.release();
    }
}

export async function listActiveProjects(
    only_process: boolean = true
): Promise<string> {
    // Get the list of all projects from the database
    let projectIds = await getAllProjectIds();

    // If only_process is true, filter to only include projects available to this process
    if (only_process) {
        const processProjects = getProcessProjectIds();
        if (processProjects.length > 0) {
            // Filter to only include projects available to this process
            projectIds = projectIds.filter(id =>
                processProjects.includes(id.toLowerCase())
            );
        }
    }

    // Format projects list with descriptions
    let projectsList = '';
    if (projectIds.length === 0) {
        projectsList = '- No projects';
    } else {
        // Get project descriptions
        const db = await getDB();
        try {
            // Get all project details from the database
            const result = await db.query(
                'SELECT project_id, simple_description, is_ready, is_generated FROM projects'
            );

            // Filter to only include projects in our filtered IDs list
            const filteredRows = only_process
                ? result.rows.filter(row => projectIds.includes(row.project_id))
                : result.rows;

            projectsList = filteredRows
                .map(row => {
                    const description =
                        row.simple_description || 'No description';
                    const status = row.is_ready
                        ? ''
                        : row.is_generated
                          ? ' [Creating...]'
                          : ' [Importing external project...]';
                    return `- ${row.project_id}: ${description}${status}`;
                })
                .join('\n');
        } catch (error) {
            console.error('Error getting project descriptions:', error);
            projectsList = '- Error retrieving projects';
        } finally {
            db.release();
        }
    }
    return projectsList;
}

/**
 * Create a new project with its own git repository
 * @param project_id Unique identifier for the project (no spaces, letters, numbers, dashes, underscores only)
 * @param simple_description A short description of the project
 * @param project_type The type of project (web-static, web-app, game-2d, etc.)
 * @returns A string indicating success or failure
 */
export async function create_project(
    project_id: string,
    simple_description: string,
    detailed_description: string,
    project_type: ProjectType
): Promise<string> {
    // Validate project_id format
    const idRegex = /^[a-zA-Z0-9_-]+$/;
    if (!idRegex.test(project_id)) {
        return 'Error: project_id must contain only letters, numbers, dashes and underscores.';
    }

    const db = await getDB();

    try {
        // Check if project already exists
        const existingProject = await db.query(
            'SELECT project_id FROM projects WHERE project_id = $1',
            [project_id]
        );

        if (existingProject.rows.length > 0) {
            return `Error: A project with ID '${project_id}' already exists.`;
        }

        // Insert new project
        await db.query(
            `INSERT INTO projects
            (project_id, project_type, simple_description, detailed_description, is_generated)
            VALUES ($1, $2, $3, $4, $5)`,
            [
                project_id,
                project_type,
                simple_description,
                detailed_description,
                true,
            ]
        );

        sendStreamEvent({
            type: 'project_create',
            project_id: project_id,
        });

        // Return success message
        return `Creating project '${project_id}'...`;
    } catch (error) {
        console.error('Error creating project:', error);
        return `Error creating project: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
        db.release();
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
                project_id:
                    'No spaces - letters, numbers, dashes and underscores only.',
                simple_description:
                    'A sentence describing the project. Used to identify the project in the list.',
                detailed_description:
                    "Up to two paragraphs covering the project's purpose, and key features. Include any relevant details you know that might help the agent understand the project better.",
                project_type: {
                    type: 'string',
                    description: `What type of files will be in the project. Use 'plain' if no other type matches.\n\n${Object.entries(
                        PROJECT_TYPE_DESCRIPTIONS
                    )
                        .map(([type, description]) => `${type}: ${description}`)
                        .join('\n')}`,
                    enum: PROJECT_TYPES,
                },
            }
        ),
    ];
}
