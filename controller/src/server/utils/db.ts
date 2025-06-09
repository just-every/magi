/**
 * Database Utilities
 */

import { Pool } from 'pg';
import * as process from 'process';
import * as fs from 'fs';

// Configure database connection
let pool: Pool | null = null;

function getPool(): Pool {
    if (pool) return pool;

    // Detect if we're running locally or in Docker
    const isLocal = !fs.existsSync('/app/db');
    const defaultHost = isLocal ? 'localhost' : 'host.docker.internal';

    // Set up DB connection config based on environment
    const config = {
        host: process.env.DATABASE_HOST || defaultHost,
        user: process.env.DATABASE_USER || 'postgres',
        password: process.env.DATABASE_PASSWORD || 'postgres',
        database: process.env.DATABASE_NAME || 'postgres',
        port: parseInt(process.env.DATABASE_PORT || '5432'),
        // Only use SSL if explicitly configured
        ssl:
            process.env.DATABASE_SSL === 'true'
                ? { rejectUnauthorized: false }
                : undefined,
    };

    pool = new Pool(config);

    // Log connection errors but don't crash the application
    pool.on('error', err => {
        console.error('Unexpected database error:', err);
    });

    return pool;
}

/**
 * Get a database client from the connection pool
 * The caller is responsible for releasing the client when done
 */
export async function getDB() {
    return await getPool().connect();
}

/**
 * Initialize the database connection and verify we can connect
 */
export async function initDatabase(): Promise<boolean> {
    try {
        const client = await getPool().connect();
        try {
            const result = await client.query('SELECT NOW() as now');
            console.log('Database connection verified at:', result.rows[0].now);
            return true;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Database connection error:', err);
        return false;
    }
}
