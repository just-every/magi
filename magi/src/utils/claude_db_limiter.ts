/**
 * Claude DB concurrency limiter
 *
 * Cross-process concurrency control for Claude Code provider using Postgres.
 * Ensures no more than MAX_SLOTS Claude instances run simultaneously across
 * all Node processes to prevent Anthropic authentication resets.
 */

import { getDB } from './db.js';
import * as process from 'process';
import * as crypto from 'crypto';

// Maximum number of concurrent Claude instances allowed
const MAX_SLOTS = 2;

// Timeout settings
const HEARTBEAT_INTERVAL_MS = 30_000; // Update timestamp every 30 seconds
const SLOT_EXPIRY_SECONDS = 180; // Consider slots older than 3 minutes as stale

/**
 * Ensure the claude_slots table exists
 */
async function ensureTableExists(): Promise<void> {
    const client = await getDB();
    try {
        await client.query(`
      CREATE TABLE IF NOT EXISTS claude_slots (
        slot_id VARCHAR(255) PRIMARY KEY,
        process_id VARCHAR(255) NOT NULL,
        message_id VARCHAR(255) NOT NULL,
        last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    } finally {
        client.release();
    }
}

/**
 * Generate a unique slot ID for this process/request
 */
function generateSlotId(messageId: string): string {
    return `${process.pid}-${messageId}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Clean up stale slots that might have been abandoned by crashed processes
 */
async function cleanupStaleSlots(): Promise<void> {
    const client = await getDB();
    try {
        // Delete any slots that haven't been updated recently
        await client.query(`
      DELETE FROM claude_slots
      WHERE last_heartbeat < NOW() - INTERVAL '${SLOT_EXPIRY_SECONDS} seconds'
    `);
    } finally {
        client.release();
    }
}

/**
 * Information about an acquired Claude slot
 */
export interface ClaudeSlot {
    id: string;
    heartbeatInterval: NodeJS.Timeout | null;
}

/**
 * Try to acquire a Claude slot
 *
 * @param messageId - Unique identifier for the current message/request
 * @returns A ClaudeSlot object that must be released when done
 * @throws Error if no slots are available
 */
export async function acquireSlot(messageId: string): Promise<ClaudeSlot> {
    // First ensure our table exists
    await ensureTableExists();

    // Clean up any stale slots
    await cleanupStaleSlots();

    // Check if we can get a slot
    const client = await getDB();
    try {
        // Start a transaction for atomicity
        await client.query('BEGIN');

        // Count current active slots
        const countResult = await client.query(
            'SELECT COUNT(*) FROM claude_slots'
        );
        const currentCount = parseInt(countResult.rows[0].count);

        if (currentCount >= MAX_SLOTS) {
            await client.query('ROLLBACK');
            throw new Error('Claude concurrency limit reached');
        }

        // If we're under the limit, create a new slot
        const slotId = generateSlotId(messageId);
        await client.query(
            `
      INSERT INTO claude_slots (slot_id, process_id, message_id, last_heartbeat)
      VALUES ($1, $2, $3, NOW())
    `,
            [slotId, process.pid.toString(), messageId]
        );

        // Commit the transaction
        await client.query('COMMIT');

        console.log(
            `[ClaudeDBLimiter] Acquired slot ${slotId} (${currentCount + 1}/${MAX_SLOTS} active)`
        );

        // Set up periodic heartbeat to update the timestamp
        const heartbeatInterval = setInterval(async () => {
            try {
                const heartbeatClient = await getDB();
                try {
                    await heartbeatClient.query(
                        `
            UPDATE claude_slots
            SET last_heartbeat = NOW()
            WHERE slot_id = $1
          `,
                        [slotId]
                    );
                    console.log(
                        `[ClaudeDBLimiter] Heartbeat for slot ${slotId}`
                    );
                } finally {
                    heartbeatClient.release();
                }
            } catch (error) {
                console.error(
                    `[ClaudeDBLimiter] Error updating heartbeat for ${slotId}:`,
                    error
                );
            }
        }, HEARTBEAT_INTERVAL_MS);

        return {
            id: slotId,
            heartbeatInterval,
        };
    } catch (error) {
        // Make sure we rollback if anything fails
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            // We're already in an error handler, just log the rollback error
            console.error('Error during transaction rollback:', rollbackError);
        }
        // Re-throw the same error
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Release a previously acquired Claude slot
 *
 * @param slot - The slot object returned by acquireSlot
 */
export async function releaseSlot(slot: ClaudeSlot): Promise<void> {
    // Stop the heartbeat interval
    if (slot.heartbeatInterval) {
        clearInterval(slot.heartbeatInterval);
    }

    try {
        const client = await getDB();
        try {
            // Delete the slot entry
            await client.query('DELETE FROM claude_slots WHERE slot_id = $1', [
                slot.id,
            ]);
            console.log(`[ClaudeDBLimiter] Released slot ${slot.id}`);
        } finally {
            client.release();
        }
    } catch (error) {
        console.error(
            `[ClaudeDBLimiter] Error releasing slot ${slot.id}:`,
            error
        );
    }
}
