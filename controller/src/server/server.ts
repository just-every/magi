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
import express from 'express';
import { ServerManager } from './managers/server_manager';
import { initColorManager } from './managers/color_manager';
import { ensureMigrations } from './utils/db_migrations';
import prEventsRoutes from './routes/pr_events';

/**
 * Initialize and start the MAGI System server
 */
async function main(): Promise<void> {
    // Check OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
        console.warn('\n⚠ OPENAI_API_KEY not set. Voice disabled.\n');
    }

    // Run database migrations before starting the server
    await ensureMigrations();

    // Initialize color manager
    initColorManager();

    // Create the server
    const serverManager = new ServerManager();

    // Add API routes
    const app = serverManager.getExpressApp();
    app.use(express.json()); // For parsing application/json
    app.use('/api/pr-events', prEventsRoutes);

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
