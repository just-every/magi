/**
 * Memory management for the MAGI system.
 *
 * This module provides functions to store and retrieve conversation history
 * across sessions.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// Directory to store memory files
const MEMORY_DIR = path.join(os.homedir(), '.magi', 'memory');

// Maximum number of history items to keep
const MAX_HISTORY_ITEMS = 10;

// Memory structure
interface Memory {
    inputs: string[];
    outputs: string[];
    lastAccessed: number;
}

// Global memory cache
let memoryCache: Memory = {
    inputs: [],
    outputs: [],
    lastAccessed: Date.now(),
};

/**
 * Ensure the memory directory exists
 */
function ensureMemoryDir(): void {
    if (!fs.existsSync(MEMORY_DIR)) {
        fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }
}

/**
 * Get the path to the memory file
 */
function getMemoryFilePath(): string {
    ensureMemoryDir();
    return path.join(MEMORY_DIR, 'memory.json');
}

/**
 * Load conversation memory from disk
 */
export function loadMemory(): Memory {
    try {
        const memoryPath = getMemoryFilePath();

        if (fs.existsSync(memoryPath)) {
            const data = fs.readFileSync(memoryPath, 'utf-8');
            memoryCache = JSON.parse(data);
            console.log(
                `Loaded memory with ${memoryCache.inputs.length} inputs and ${memoryCache.outputs.length} outputs`
            );
        } else {
            console.log('No existing memory found, starting fresh');
            memoryCache = { inputs: [], outputs: [], lastAccessed: Date.now() };
            saveMemory();
        }
    } catch (error) {
        console.error(`Error loading memory: ${error}`);
        memoryCache = { inputs: [], outputs: [], lastAccessed: Date.now() };
    }

    return memoryCache;
}

/**
 * Save conversation memory to disk
 */
export function saveMemory(): void {
    try {
        ensureMemoryDir();
        const memoryPath = getMemoryFilePath();

        // Update last accessed time
        memoryCache.lastAccessed = Date.now();

        // Write to disk
        fs.writeFileSync(
            memoryPath,
            JSON.stringify(memoryCache, null, 2),
            'utf-8'
        );

        console.log('Memory saved successfully');
    } catch (error) {
        console.error(`Error saving memory: ${error}`);
    }
}

/**
 * Add user input to memory
 */
export function addInput(input: string): void {
    memoryCache.inputs.push(input);

    // Trim to maximum size
    if (memoryCache.inputs.length > MAX_HISTORY_ITEMS) {
        memoryCache.inputs = memoryCache.inputs.slice(-MAX_HISTORY_ITEMS);
    }

    // Save updates
    saveMemory();
}

/**
 * Add agent output to memory
 */
export function addOutput(output: string): void {
    memoryCache.outputs.push(output);

    // Trim to maximum size
    if (memoryCache.outputs.length > MAX_HISTORY_ITEMS) {
        memoryCache.outputs = memoryCache.outputs.slice(-MAX_HISTORY_ITEMS);
    }

    // Save updates
    saveMemory();
}

/**
 * Get complete conversation history
 */
export function getConversationHistory(): Array<{
    role: string;
    content: string;
}> {
    const history: Array<{ role: string; content: string }> = [];

    // Interleave inputs and outputs
    const maxItems = Math.max(
        memoryCache.inputs.length,
        memoryCache.outputs.length
    );

    for (let i = 0; i < maxItems; i++) {
        // Add user input if available
        if (i < memoryCache.inputs.length) {
            history.push({
                role: 'user',
                content: memoryCache.inputs[i],
            });
        }

        // Add system output if available
        if (i < memoryCache.outputs.length) {
            history.push({
                role: 'assistant',
                content: memoryCache.outputs[i],
            });
        }
    }

    return history;
}

/**
 * Clear all memory
 */
export function clearMemory(): void {
    memoryCache = { inputs: [], outputs: [], lastAccessed: Date.now() };
    saveMemory();
    console.log('Memory cleared successfully');
}
