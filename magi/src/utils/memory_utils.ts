/**
 * Short and long term memory management for the Magi AI.
 */
import fs from 'fs';
import path from 'path';
import { dateFormat } from './date_tools.js';
import { ToolFunction } from '@magi-system/ensemble';
import { createToolFunction } from './tool_call.js';
// Memory utilities for storing and retrieving memories

// Memory file paths
const MEMORY_DIR = '/magi_output/memory';
const SHORT_TERM_MEMORY_FILE = path.join(MEMORY_DIR, 'short/memories.json');
const LONG_TERM_MEMORY_FILE = path.join(MEMORY_DIR, 'long/memories.json');

// Store for short-term and long-term memories
let shortTermMemories: { id: number; content: string }[] = [];
const MAX_SHORT_TERM_MEMORIES = 10;
let longTermMemories: { id: number; memory: string; timestamp: number }[] = [];
const MAX_MEMORY_LENGTH = 2000;

// Ensure memory directories exist
export function ensureMemoryDirectories(): void {
    try {
        // Create memory directories if they don't exist
        if (!fs.existsSync(MEMORY_DIR)) {
            fs.mkdirSync(MEMORY_DIR, { recursive: true });
        }
        if (!fs.existsSync(path.dirname(SHORT_TERM_MEMORY_FILE))) {
            fs.mkdirSync(path.dirname(SHORT_TERM_MEMORY_FILE), {
                recursive: true,
            });
        }
        if (!fs.existsSync(path.dirname(LONG_TERM_MEMORY_FILE))) {
            fs.mkdirSync(path.dirname(LONG_TERM_MEMORY_FILE), {
                recursive: true,
            });
        }
        loadMemoriesFromFiles();
    } catch (error) {
        console.error(`Error creating memory directories: ${error}`);
    }
}

// Load memories from files
function loadMemoriesFromFiles(term?: string): void {
    try {
        // Load short-term memories
        if (
            (!term || term === 'short') &&
            fs.existsSync(SHORT_TERM_MEMORY_FILE)
        ) {
            const shortData = fs.readFileSync(SHORT_TERM_MEMORY_FILE, 'utf-8');
            shortTermMemories = JSON.parse(shortData) || [];
            console.log(
                `Loaded ${shortTermMemories.length} short-term memories`
            );
        }

        // Load long-term memories
        if (
            (!term || term === 'long') &&
            fs.existsSync(LONG_TERM_MEMORY_FILE)
        ) {
            const longData = fs.readFileSync(LONG_TERM_MEMORY_FILE, 'utf-8');
            longTermMemories = JSON.parse(longData) || [];
            console.log(`Loaded ${longTermMemories.length} long-term memories`);
        }
    } catch (error) {
        console.error(`Error loading memories from files: ${error}`);
    }
}

// Save memories to files
function saveMemoriesToFiles(term: string): void {
    try {
        if (term === 'short') {
            // Save short-term memories
            fs.writeFileSync(
                SHORT_TERM_MEMORY_FILE,
                JSON.stringify(shortTermMemories, null, 2),
                'utf-8'
            );
        } else if (term === 'long') {
            // Save long-term memories
            fs.writeFileSync(
                LONG_TERM_MEMORY_FILE,
                JSON.stringify(longTermMemories, null, 2),
                'utf-8'
            );
        }
    } catch (error) {
        console.error(`Error saving ${term}-term memories to files: ${error}`);
    }
}

/**
 * Add short term or long term memory
 */
function save_memory(term: string, memory: string): string {
    if (!term || !memory) {
        return "Error: Both term type ('short' or 'long') and memory content are required.";
    }

    if (term !== 'short' && term !== 'long') {
        return "Error: Term must be either 'short' or 'long'.";
    }

    try {
        loadMemoriesFromFiles(term);

        // Generate a unique ID for the memory

        let memoryId: number;
        if (term === 'short') {
            // For short-term memory, check length limit
            if (memory.length > MAX_MEMORY_LENGTH) {
                return `Short term memory must be 2000 characters or less. Current length: ${memory.length}`;
            }

            memoryId =
                shortTermMemories.length > 0
                    ? shortTermMemories[shortTermMemories.length - 1].id + 1
                    : 1;
            // Add to short-term memory and trim if necessary
            shortTermMemories.push({
                id: memoryId,
                content: memory,
            });
            if (shortTermMemories.length > MAX_SHORT_TERM_MEMORIES) {
                shortTermMemories.shift(); // Remove oldest memory
            }
        } else {
            memoryId =
                longTermMemories.length > 0
                    ? longTermMemories[longTermMemories.length - 1].id + 1
                    : 1;

            // Add to long-term memory with timestamp
            longTermMemories.push({
                id: memoryId,
                memory,
                timestamp: Date.now(),
            });
        }

        // Save to file system
        saveMemoriesToFiles(term);

        return `Successfully saved to ${term}-term memory with ID [${memoryId}]`;
    } catch (error) {
        return `Error saving ${term}-term memory: ${error}`;
    }
}

/**
 * Search for memories in long-term memory
 */
function find_memory(query: string[]): string {
    if (!query || !Array.isArray(query) || query.length === 0) {
        return 'Error: Please provide at least one query term.';
    }

    try {
        // Ensure we have the latest memories from the file system
        loadMemoriesFromFiles('long');

        // Filter long-term memories that match any of the query terms
        const matchingMemories = longTermMemories.filter(item => {
            return query.some(term =>
                item.memory.toLowerCase().includes(term.toLowerCase())
            );
        });

        if (matchingMemories.length === 0) {
            return `No memories found matching: ${query.join(', ')}`;
        }

        // Format the results
        const results = matchingMemories
            .map(item => {
                const date = dateFormat(item.timestamp);
                return `[${item.id}] [${date}] ${item.memory}`;
            })
            .join('\n\n');

        return `Found ${matchingMemories.length} memories:\n\n${results}`;
    } catch (error) {
        return `Error searching memories: ${error}`;
    }
}

/**
 * Delete a specific memory by its ID
 */
function delete_memory(term: string, memoryId: number): string {
    if (!memoryId) {
        return 'Error: Memory ID is required.';
    }

    if (term !== 'short' && term !== 'long') {
        return "Error: Term must be either 'short' or 'long'.";
    }

    try {
        // Ensure we have the latest memories from the file system
        loadMemoriesFromFiles(term);

        if (term === 'short') {
            const shortTermIndex = shortTermMemories.findIndex(
                item => item.id === memoryId
            );
            if (shortTermIndex !== -1) {
                shortTermMemories.splice(shortTermIndex, 1);
            } else {
                return `Error: No ${term}-term memory found with ID ${memoryId}`;
            }
        } else {
            const longTermIndex = longTermMemories.findIndex(
                item => item.id === memoryId
            );
            if (longTermIndex !== -1) {
                longTermMemories.splice(longTermIndex, 1);
            } else {
                return `Error: No ${term}-term memory found with ID ${memoryId}`;
            }
        }

        saveMemoriesToFiles(term);
        return `Successfully deleted ${term}-term memory with ID ${memoryId}`;
    } catch (error) {
        return `Error deleting memory: ${error}`;
    }
}

export function listShortTermMemories(): string {
    return shortTermMemories.length > 0
        ? shortTermMemories
              .map(memory => `- [${memory.id}] ${memory.content}`)
              .join('\n')
        : '- None';
}

/**
 * Get all shell tools as an array of tool definitions
 */
export function getMemoryTools(): ToolFunction[] {
    return [
        createToolFunction(
            save_memory,
            'Saves information to your short term or long term memory.',
            {
                term_type: {
                    name: 'term', // Map to the actual parameter name in the implementation
                    description:
                        'Short term or long term memory. Short term memory is like your active memory. It will be included with every thought, but only a certain number of memories are stored. Long term memory must be retrieved with find_memory(). For short term, limit to a sentence or two. Each long term memory can be up to 2000 characters.',
                    enum: ['short', 'long'],
                },
                memory_content: {
                    name: 'memory', // Map to the actual parameter name in the implementation
                    description: 'The memory to save.',
                },
            },
            'If the memory was saved correctly and the ID it was given.'
        ),
        createToolFunction(
            find_memory,
            'Find information in your long term memory.',
            {
                query: {
                    name: 'query', // Map to the actual parameter name in the implementation
                    type: 'array',
                    description:
                        'A list of terms to search your long term memory for. The search will return all memories that match any of the terms.',
                },
            },
            'The memories found in the search.'
        ),
        createToolFunction(
            delete_memory,
            'Deletes a specific memory by its ID.',
            {
                key: {
                    name: 'term', // Map to the actual parameter name in the implementation
                    description: 'Term type, either "short" or "long"',
                    enum: ['short', 'long'],
                },
                memoryId: {
                    type: 'number',
                    description: 'The ID of the memory to delete.',
                },
            },
            'A confirmation that the memory was deleted.'
        ),
    ];
}
