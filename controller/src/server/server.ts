/**
 * MAGI System Server - Main Entry Point
 *
 * This is the main server module that:
 * - Provides a web interface via Express
 * - Handles WebSocket communication with the client
 * - Manages Docker containers that run the MAGI Python backend
 * - Streams logs and command results to the client
 * - Provides APIs for various system functions
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
// First try local .env, then fall back to parent directory .env
dotenv.config();
if (!process.env.OPENAI_API_KEY) {
    dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
}

import express from 'express';
import { ServerManager } from './managers/server_manager';
import { initColorManager } from './managers/color_manager';
import { ensureMigrations } from './utils/db_migrations';
import { syncLocalCustomTools } from './utils/custom_tool_sync';
import customToolsRoutes from './routes/custom_tools';
import prEventsRoutes from './routes/pr_events';
import patchesRoutes from './routes/patches';
import voiceRoutes from './routes/voice';
import * as fs from 'fs';

/**
 * Validate that all PROJECT_REPOSITORIES exist on the filesystem
 */
function validateProjectRepositories(): void {
    const projectRepos = process.env.PROJECT_REPOSITORIES || '';
    const projectIds = projectRepos.trim()
        ? projectRepos
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
        : [];

    if (projectIds.length === 0) {
        return; // No projects to validate
    }

    console.log('Validating PROJECT_REPOSITORIES...');

    const missingProjects: string[] = [];
    const basePath = '/external/host'; // This is where parent directory is mounted in container

    for (const projectId of projectIds) {
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

        process.exit(1); // Exit with error code
    }

    console.log(
        `✓ All ${projectIds.length} PROJECT_REPOSITORIES validated successfully`
    );
}

/**
 * Initialize and start the MAGI System server
 */
async function main(): Promise<void> {
    // Add CPU usage debug logging
    setInterval(() => {
        const usage = process.cpuUsage();
        const totalUsage = usage.user + usage.system;
        console.log(
            `[DEBUG] CPU usage - user: ${usage.user}, system: ${usage.system}, total: ${totalUsage}`
        );
    }, 10000);

    // Check OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
        console.warn('\n⚠ OPENAI_API_KEY not set. Voice disabled.\n');
    }

    // Validate PROJECT_REPOSITORIES before starting
    validateProjectRepositories();

    // Run database migrations before starting the server
    await ensureMigrations();

    // Sync local custom tools
    await syncLocalCustomTools();

    // Initialize color manager
    initColorManager();

    // Create the server
    const serverManager = new ServerManager();

    // Add API routes
    const app = serverManager.getExpressApp();
    app.use(express.json()); // For parsing application/json
    app.use('/api/custom-tools', customToolsRoutes);
    app.use('/api/pr-events', prEventsRoutes);
    app.use('/api/patches', patchesRoutes);
    app.use(voiceRoutes);

    // Expose the PR events manager for route handlers to use
    (app as any).prEventsManager = serverManager.getPrEventsManager();

    // Start the server
    await serverManager.start();
}

// Start the application
main().catch(error => {
    console.error('Failed to start MAGI System:', error);
    process.exit(1);
});
