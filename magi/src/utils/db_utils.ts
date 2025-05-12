/**
 * Progress Database Utilities
 *
 * Database utilities for storing and retrieving task-specific memories,
 * timings, and cost information for MECH tasks.
 */

import { getDB } from './db.js';

// Define types for our database records
export interface MechTask {
    id: string;
    created_at: Date;
    finished_at?: Date;
    duration_sec?: number;
    total_cost?: number;
    status?: 'complete' | 'fatal_error';
    model_used?: string;
    initial_prompt: string;
}

export interface MechTaskMemory {
    id?: string;
    task_id: string;
    embedding: number[];
    text: string;
    score?: number;
    metadata?: Record<string, any>;
}

export interface MemoryMatch {
    text: string;
    score: number;
    metadata?: Record<string, any>;
}

export interface CustomTool {
    id?: string;
    name: string;
    description: string;
    parameters_json: string;
    implementation: string;
    embedding?: number[];
    version?: number;
    source_task_id?: string;
    is_latest?: boolean;
    created_at?: Date;
}

/**
 * Record the start of a MECH task run
 * @param data Initial task data including prompt and optional model
 * @returns Task ID as a string
 */
export async function recordTaskStart(data: {
    prompt: string;
    model?: string;
}): Promise<string> {
    const db = await getDB();

    try {
        const result = await db.query(
            `INSERT INTO mech_tasks
             (initial_prompt, model_used)
             VALUES ($1, $2)
             RETURNING id`,
            [data.prompt, data.model || null]
        );

        return result.rows[0].id;
    } finally {
        db.release();
    }
}

/**
 * Record the completion of a MECH task run
 * @param data End-of-task data including status, duration, and cost
 */
export async function recordTaskEnd(data: {
    task_id: string;
    status: 'complete' | 'fatal_error';
    durationSec: number;
    totalCost: number;
}): Promise<void> {
    const db = await getDB();

    try {
        await db.query(
            `UPDATE mech_tasks
             SET status = $1,
                 finished_at = NOW(),
                 duration_sec = $2,
                 total_cost = $3
             WHERE id = $4`,
            [data.status, data.durationSec, data.totalCost, data.task_id]
        );
    } finally {
        db.release();
    }
}

/**
 * Insert multiple memory entries for a completed task
 * @param task_id The UUID of the associated task
 * @param memories Array of memory entries to insert
 */
export async function insertMemories(
    task_id: string,
    memories: {
        text: string;
        embedding: number[];
        score?: number;
        metadata?: Record<string, any>;
    }[]
): Promise<void> {
    if (!memories.length) return;

    const db = await getDB();

    try {
        await db.query('BEGIN');

        // Batch insert multiple memories
        for (const memory of memories) {
            // Format the embedding array for PostgreSQL vector type
            const embeddingStr = toPgVectorLiteral(memory.embedding);

            // Skip records with invalid embeddings to prevent SQL errors
            if (embeddingStr === null) {
                console.warn(
                    `Skipping memory with invalid embedding: "${memory.text.substring(0, 30)}..."`
                );
                continue;
            }

            await db.query(
                `INSERT INTO mech_task_memories
                 (task_id, text, embedding, score, metadata)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    task_id,
                    memory.text,
                    embeddingStr,
                    memory.score || null,
                    memory.metadata ? JSON.stringify(memory.metadata) : null,
                ]
            );
        }

        await db.query('COMMIT');
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('Error inserting task memories:', err);
        throw err;
    } finally {
        db.release();
    }
}

/**
 * Look up relevant memories using vector similarity search
 * @param embedding The query embedding vector
 * @param k Number of results to return (default: 8)
 * @returns Array of matching memories with similarity scores
 */
export async function lookupMemoriesEmbedding(
    embedding: number[],
    k: number = 8
): Promise<MemoryMatch[]> {
    // Format the embedding array for PostgreSQL vector type
    const embeddingStr = toPgVectorLiteral(embedding);

    // If we couldn't create a valid pgvector literal, return empty result
    if (embeddingStr === null) {
        console.warn(
            'Invalid embedding provided to lookupMemoriesEmbedding - returning empty result'
        );
        return [];
    }

    const db = await getDB();

    try {
        const result = await db.query(
            `SELECT text,
                    metadata,
                    1 - (embedding <=> $1) AS similarity_score
             FROM mech_task_memories
             ORDER BY embedding <=> $1
             LIMIT $2`,
            [embeddingStr, k]
        );

        return result.rows.map(row => ({
            text: row.text,
            score: row.similarity_score,
            metadata: row.metadata,
        }));
    } finally {
        db.release();
    }
}

/**
 * Get task metrics by ID
 * @param task_id The UUID of the task to retrieve
 * @returns Task data if found, null otherwise
 */
export async function getTaskById(task_id: string): Promise<MechTask | null> {
    const db = await getDB();

    try {
        const result = await db.query(
            'SELECT * FROM mech_tasks WHERE id = $1',
            [task_id]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return result.rows[0] as MechTask;
    } finally {
        db.release();
    }
}

/**
 * Format a list of memories into a condensed text representation
 * @param memories Array of memory matches
 * @returns Formatted string suitable for injection into prompt context
 */
export function formatMemories(memories: MemoryMatch[]): string {
    if (!memories.length) {
        return '- none';
    }

    let result = '';

    // Format each memory as a separate point
    memories.forEach((memory, index) => {
        result += `[${index + 1}] ${memory.text}\n`;

        // Add metadata if available and meaningful
        if (memory.metadata) {
            const tools = memory.metadata.tools;
            if (tools && Array.isArray(tools) && tools.length > 0) {
                result += `    Tools: ${tools.join(', ')}\n`;
            }

            if (memory.metadata.error) {
                result += `    Error: ${memory.metadata.error}\n`;
            }
        }

        // Add blank line between memories
        if (index < memories.length - 1) {
            result += '\n';
        }
    });

    return result;
}

/**
 * Add a new custom tool to the database
 * @param tool The custom tool data to add
 * @returns The ID of the newly added tool
 */
export async function addCustomTool(tool: CustomTool): Promise<string> {
    const db = await getDB();

    try {
        // If this is an update to an existing tool, mark previous versions as not latest
        if (tool.version && tool.version > 1) {
            await db.query(
                `UPDATE custom_tools
                 SET is_latest = false
                 WHERE name = $1 AND is_latest = true`,
                [tool.name]
            );
        }

        // Format the embedding array for PostgreSQL vector type
        const embeddingStr = tool.embedding
            ? toPgVectorLiteral(tool.embedding)
            : null;

        const result = await db.query(
            `INSERT INTO custom_tools
             (name, description, parameters_json, implementation, embedding,
              version, source_task_id, is_latest)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) -- No need for ::vector cast when using literal format
             RETURNING id`,
            [
                tool.name,
                tool.description,
                tool.parameters_json,
                tool.implementation,
                embeddingStr,
                tool.version || 1,
                tool.source_task_id || null,
                tool.is_latest !== undefined ? tool.is_latest : true,
            ]
        );

        return result.rows[0].id;
    } finally {
        db.release();
    }
}

/**
 * Convert a number array to a PostgreSQL vector literal string
 * Ensures vectors are correctly formatted for pgvector and have exactly 3072 dimensions
 * for our halfvec columns
 *
 * @param vec Array of numbers to convert to pgvector format
 * @returns String in format "[num1,num2,...]" that pgvector can parse, or null if input is invalid
 */
function toPgVectorLiteral(vec: any): string | null {
    // Handle null or undefined
    if (vec == null) {
        console.log('toPgVectorLiteral received null/undefined');
        return null;
    }

    // Make sure we're dealing with a non-empty array
    if (!Array.isArray(vec)) {
        console.error('Expected array for vector, got:', typeof vec, vec);

        // If it's an object with a toString method that looks like a vector, try to use it
        if (typeof vec === 'object' && vec !== null && vec.toString) {
            const str = vec.toString();
            if (str.startsWith('[') && str.endsWith(']')) {
                console.log('Using object toString() as fallback for vector');
                // Just return the brackets and contents - no quotes
                return str.replace(/^'|'$/g, '');
            }
        }

        // Return a default empty vector without quotes
        return '[]';
    }

    try {
        // Ensure the vector has the correct dimensionality for our database schema (3072)
        let normalizedVec = [...vec]; // Clone the array to avoid modifying the original

        if (normalizedVec.length !== 3072) {
            console.warn(
                `Vector has ${normalizedVec.length} dimensions, expected 3072. Adjusting...`
            );

            if (normalizedVec.length < 3072) {
                // Pad with zeros if too short
                normalizedVec = [
                    ...normalizedVec,
                    ...Array(3072 - normalizedVec.length).fill(0),
                ];
            } else if (normalizedVec.length > 3072) {
                // Truncate if too long
                normalizedVec = normalizedVec.slice(0, 3072);
            }
        }

        // DO NOT include single quotes - let the pg driver handle quoting
        // Just return the brackets and contents
        return `[${normalizedVec.join(',')}]`;
    } catch (error) {
        console.error('Error in toPgVectorLiteral:', error, 'vec:', vec);
        // Return default empty vector on error without quotes
        return '[]';
    }
}

export async function searchCustomToolsByEmbedding(
    embedding: number[],
    threshold: number = 0.8,
    limit: number = 5
): Promise<CustomTool[]> {
    // Format the embedding array for PostgreSQL vector type
    const embeddingStr = toPgVectorLiteral(embedding);

    // If we couldn't create a valid pgvector literal, return empty result
    if (embeddingStr === null) {
        console.warn(
            'Invalid embedding provided to searchCustomToolsByEmbedding - returning empty result'
        );
        return [];
    }

    const db = await getDB();

    try {
        const result = await db.query(
            `SELECT id, name, description, parameters_json, implementation,
                    embedding, version, source_task_id, is_latest, created_at,
                    1 - (embedding <=> $1) AS similarity_score
             FROM custom_tools
             WHERE is_latest = true
               AND 1 - (embedding <=> $1) >= $2
             ORDER BY embedding <=> $1
             LIMIT $3`,
            [embeddingStr, threshold, limit]
        );

        return result.rows.map(row => ({
            id: row.id,
            name: row.name,
            description: row.description,
            parameters_json: row.parameters_json,
            implementation: row.implementation,
            embedding: row.embedding,
            version: row.version,
            source_task_id: row.source_task_id,
            is_latest: row.is_latest,
            created_at: row.created_at,
        }));
    } finally {
        db.release();
    }
}

/**
 * Get a custom tool by name (most recent version)
 * @param name The name of the tool to retrieve
 * @returns The custom tool if found, null otherwise
 */
export async function getCustomToolByName(
    name: string
): Promise<CustomTool | null> {
    const db = await getDB();

    try {
        const result = await db.query(
            `SELECT id, name, description, parameters_json, implementation,
                    embedding, version, source_task_id, is_latest, created_at
             FROM custom_tools
             WHERE name = $1 AND is_latest = true`,
            [name]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return result.rows[0] as CustomTool;
    } finally {
        db.release();
    }
}

/**
 * Get all latest custom tools
 * @returns Array of all latest custom tools
 */
export async function getAllCustomTools(): Promise<CustomTool[]> {
    const db = await getDB();

    try {
        const result = await db.query(
            `SELECT id, name, description, parameters_json, implementation,
                    embedding, version, source_task_id, is_latest, created_at
             FROM custom_tools
             WHERE is_latest = true
             ORDER BY name`
        );

        return result.rows as CustomTool[];
    } finally {
        db.release();
    }
}
