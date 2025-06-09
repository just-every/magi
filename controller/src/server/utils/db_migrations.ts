/**
 * Database Migrations Utility
 *
 * Handles running database migrations at controller startup
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

// Promisify exec for async/await usage
const execAsync = promisify(exec);

// Track if migrations have been run
let migrationsDone = false;

/**
 * Ensure database migrations are up to date
 * Should be called once at controller startup
 */
export async function ensureMigrations(): Promise<void> {
    if (migrationsDone) return;

    console.log('Running database migrations...');
    try {
        // Build the command to run migrations using environment variables
        // Use host.docker.internal to connect from container to host machine
        const dbHost = process.env.DATABASE_HOST || 'host.docker.internal';
        const dbPort = process.env.DATABASE_PORT || '5432';
        const dbUser = process.env.DATABASE_USER || 'postgres';
        const dbPassword = process.env.DATABASE_PASSWORD || 'postgres';
        const dbName = process.env.DATABASE_NAME || 'postgres';

        // Determine the correct db directory path
        // In Docker: /app/db
        // In local dev: relative to the controller directory
        let dbPath = '/app/db';
        if (!fs.existsSync(dbPath)) {
            // Local development - the db directory is at the project root
            // When running from controller directory, we need to go up one level
            const possiblePaths = [
                path.resolve(process.cwd(), '../db'), // When running from controller directory
                path.resolve(process.cwd(), 'db'), // When running from project root
                path.resolve(__dirname, '../../../../../db'), // Fallback based on __dirname
            ];

            for (const possiblePath of possiblePaths) {
                if (fs.existsSync(possiblePath)) {
                    dbPath = possiblePath;
                    break;
                }
            }

            if (!fs.existsSync(dbPath)) {
                throw new Error(
                    `Could not find db directory. Tried: ${possiblePaths.join(', ')}`
                );
            }
        }

        // Use localhost for local development
        const isLocal = !fs.existsSync('/app/db');
        const actualDbHost =
            isLocal && dbHost === 'host.docker.internal' ? 'localhost' : dbHost;

        const connectionString = `postgres://${dbUser}:${dbPassword}@${actualDbHost}:${dbPort}/${dbName}`;
        const command = `cd ${dbPath} && DATABASE_URL="${connectionString}" npx node-pg-migrate up`;

        // Execute the command
        const { stdout, stderr } = await execAsync(command);

        if (stdout) {
            console.log('Migration output:', stdout);
        }

        if (stderr && !stderr.includes('No migrations to run')) {
            console.error('Migration errors:', stderr);
        }

        migrationsDone = true;
        console.log('Migrations completed successfully');
    } catch (err) {
        console.error('Error running migrations:', err);
        // Don't mark as done if failed, so it will try again next time
        throw err;
    }
}
