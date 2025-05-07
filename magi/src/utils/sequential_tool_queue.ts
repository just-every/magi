/**
 * Sequential Tool Queue for the MAGI system.
 *
 * This module provides a queue system to ensure tools execute sequentially
 * for agents that have the sequential_tools setting enabled.
 */

// Map of agent IDs to their execution queues (the pending promise chain)
const queues = new Map<string, Promise<unknown>>();

/**
 * Run a function sequentially for a given agent, ensuring it only runs
 * after all previously queued functions for that agent have completed.
 *
 * @param agentId The ID of the agent to queue for
 * @param fn The function to execute sequentially
 * @returns A promise that resolves with the function's result
 */
export async function runSequential<T>(
    agentId: string,
    fn: () => Promise<T>
): Promise<T> {
    // Get the current tail of the queue (or a resolved promise if none exists)
    const prev = queues.get(agentId) ?? Promise.resolve();

    // Chain the new function onto the previous promise
    // We use .then(fn, fn) to ensure the chain continues even if the previous promise rejected
    const next = prev.then(fn, fn);

    // Update the queue with the new tail, catching any errors to prevent unhandled rejections
    queues.set(
        agentId,
        next.catch(() => {})
    );

    // Return the promise for the current function execution
    return next;
}
