/**
 * Helper for thought delay processing
 */
import { dateFormat } from './date_tools.js';
import { ToolFunction } from '../types/shared-types.js';
import { createToolFunction } from './tool_call.js';
// Thought utilities for managing thought delay and related tools

export const validThoughtDelays: string[] = [
    '0',
    '2',
    '4',
    '8',
    '16',
    '32',
    '64',
    '128',
];
export let thoughtDelay: string = '0';
export let delayInterrupted: boolean = false;

export function setDelayInterrupted(interrupted: boolean): void {
    delayInterrupted = interrupted;
}

export function isDelayInterrupted(): boolean {
    return delayInterrupted;
}

export function getThoughtDelay(): string {
    return thoughtDelay;
}
export function getValidThoughtDelays(): string[] {
    return validThoughtDelays;
}

export async function runThoughtDelay(): Promise<void> {
    if (thoughtDelay && parseInt(thoughtDelay)) {
        // Reset the interrupt flag before starting the delay
        setDelayInterrupted(false);

        // Create a delay promise that can be interrupted
        await new Promise<void>(resolve => {
            // Break the delay into smaller chunks and check for interruption
            const chunkSize = 100; // Check every 100ms
            let remaining = parseInt(thoughtDelay) * 1000;

            function waitChunk() {
                if (isDelayInterrupted() || remaining <= 0) {
                    // If interrupted or completed, resolve immediately
                    resolve();
                    return;
                }

                // Wait for the next chunk or the remaining time (whichever is smaller)
                const waitTime = Math.min(chunkSize, remaining);
                remaining -= waitTime;

                setTimeout(() => waitChunk(), waitTime);
            }

            // Start the chunked waiting process
            waitChunk();
        });
    }
}

/**
 * Sets a new thought level and delay for future thoughts
 *
 * @param level The message content to process.
 * @returns A promise that resolves with a success message after the calculated delay.
 */
export function set_thought_delay(delay: string): string {
    if (validThoughtDelays.includes(delay)) {
        thoughtDelay = delay;
        return `Successfully set Thought Delay to '${thoughtDelay} seconds' at ${dateFormat()}`; // Return the success message
    }

    return `Invalid thought delay '${delay} seconds'. Valid delay seconds are: ${validThoughtDelays.join(', ')}`;
}

/**
 * Get all shell tools as an array of tool definitions
 */
export function getThoughtTools(): ToolFunction[] {
    return [
        createToolFunction(
            set_thought_delay,
            'Sets the Thought Delay for your next set of thoughts. Can be changed any time. Extend your Delay to think slower while waiting.',
            {
                delay: {
                    description:
                        'The new Thought Delay. Will set to the number of seconds between your thoughts. New messages and system events will interrupt your thought delay to ensure you can respond to them.',
                    enum: getValidThoughtDelays(),
                },
            }
        ),
    ];
}
