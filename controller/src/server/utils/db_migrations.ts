/**
 * Database Migrations Utility
 *
 * Handles running database migrations at controller startup
 */
import { exec } from 'child_process';
import { promisify } from 'util';

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

        const connectionString = `postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;
        const command = `cd ./db && DATABASE_URL="${connectionString}" npx node-pg-migrate up`;

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
