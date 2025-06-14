/**
 * Bootstrap utilities for the MAGI System
 */
import { ProcessManager } from '../managers/process_manager';
import {
    ensureProjectStub,
    addProjectHistory,
    getUnreadyProjectIds,
    getProject,
    updateProject,
} from './db_utils';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Ensure external projects from PROJECT_REPOSITORIES environment variable exist in the database
 * This function only ensures projects exist but does not start analysis agents
 *
 * @returns Array of newly created project IDs
 */
async function ensureExternalProjects(): Promise<string[]> {
    console.log('Ensuring external projects exist...');
    const projectRepos = process.env.PROJECT_REPOSITORIES || '';
    const extIds = projectRepos.trim()
        ? projectRepos
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
        : [];

    if (extIds.length === 0) {
        console.log('No external projects found in PROJECT_REPOSITORIES.');
        return [];
    }

    console.log(
        `Found ${extIds.length} external projects in environment: ${extIds.join(', ')}`
    );

    // Validate that each project directory exists
    const missingProjects: string[] = [];
    const basePath = '/external/host'; // This is where parent directory is mounted in container

    for (const projectId of extIds) {
        const projectPath = path.join(basePath, projectId);
        if (!fs.existsSync(projectPath)) {
            missingProjects.push(projectId);
        }
    }

    if (missingProjects.length > 0) {
        const errorMsg =
            'ERROR: The following PROJECT_REPOSITORIES do not exist on the filesystem:\n' +
            missingProjects
                .map(p => `  - ${p} (expected at: ${path.join(basePath, p)})`)
                .join('\n') +
            '\n\nPlease ensure these directories exist in the parent directory of the magi project, or remove them from PROJECT_REPOSITORIES.';

        console.error('\n' + '='.repeat(80));
        console.error(errorMsg);
        console.error('='.repeat(80) + '\n');

        throw new Error(
            `Missing project directories: ${missingProjects.join(', ')}`
        );
    }

    // Track newly created projects
    const newProjectIds: string[] = [];

    for (const projectId of extIds) {
        const isNew = await ensureProjectStub(projectId, false); // is_generated = false

        if (isNew) {
            newProjectIds.push(projectId);
            console.log(`Created new project stub for: ${projectId}`);
        } else {
            console.log(`Project already exists: ${projectId}`);
        }
    }

    return newProjectIds;
}

/**
 * Bootstrap projects - to be called once on first command
 *
 * This function:
 * 1. Ensures projects from PROJECT_REPOSITORIES exist in the database
 * 2. Gets all projects with is_ready = false
 * 3. Starts a single analysis agent for all unready projects
 */
export async function bootstrapProjectsOnce(pm: ProcessManager): Promise<void> {
    console.log('Bootstrapping projects (one-time process)...');

    // Step 1: Ensure external projects from env var exist in the database
    await ensureExternalProjects();

    // Step 2: Get all unready projects
    const unreadyIds = await getUnreadyProjectIds();

    if (unreadyIds.length === 0) {
        console.log('No unready projects found to process.');
        return;
    }

    console.log(
        `Found ${unreadyIds.length} unready projects to process: ${unreadyIds.join(', ')}`
    );

    // Step 3: Start a single analysis agent for all unready projects
    const processId = `AI-${Math.random().toString(36).slice(2, 8)}`;

    // Prepare project paths for command message
    const projectPaths = unreadyIds
        .map(id => `${id} (located at /app/projects/${id})`)
        .join(', ');

    // Register a completion handler to mark all projects as ready when analysis completes
    pm.registerProcessCompletionHandler(processId, async () => {
        for (const projectId of unreadyIds) {
            try {
                const proj = await getProject(projectId);
                if (proj && !proj.is_ready) {
                    proj.is_ready = true;
                    await updateProject(proj);
                    await addProjectHistory(
                        projectId,
                        'Project analysis completed',
                        { processId }
                    );
                    console.log(
                        `[bootstrap] Marked project ${projectId} as ready (analysis by ${processId})`
                    );
                }
            } catch (projErr) {
                console.error(
                    `Error updating readiness for project ${projectId}:`,
                    projErr
                );
            }
        }
    });

    // Start the agent process with all unready project IDs
    await pm.createAgentProcess({
        processId,
        started: new Date(),
        status: 'running',
        tool: 'project_update',
        command: `Please analyze the following ${unreadyIds.length > 1 ? unreadyIds.length + ' ' : ''}project(s): ${projectPaths}\n\nPlease analyze the files and fill in the project details for each.`,
        name: `Analyzing ${unreadyIds.length > 1 ? `${unreadyIds.length} Projects` : unreadyIds[0]}`,
        projectIds: unreadyIds,
    });

    // Add entry to project history for each unready project
    for (const projectId of unreadyIds) {
        await addProjectHistory(projectId, 'Queued for analysis', {
            processId,
        });
    }

    console.log(
        `Started analysis agent ${processId} for ${unreadyIds.length} unready project(s).`
    );
}
