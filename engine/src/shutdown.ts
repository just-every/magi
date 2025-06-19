/**
 * Shutdown handlers for the MAGI system.
 */

import { logger } from './utils/logger.js';
import { costTracker } from './utils/cost_tracker.js';
import {
    hasCommunicationManager,
    getCommunicationManager,
} from './utils/communication.js';

/**
 * Send cost data to the controller if communication manager is available.
 */
async function sendCostData(): Promise<void> {
    if (hasCommunicationManager()) {
        const comm = getCommunicationManager();
        const costs = costTracker.getCosts();
        comm.send({ type: 'cost_data', data: costs });
    }
}

/**
 * End the process with the given code and message.
 * Sends cost data before exiting.
 */
export async function endProcess(
    code: number = 0,
    message: string = 'Process ended'
): Promise<void> {
    logger.info('Ending process', { code, message });
    await sendCostData();
    process.exit(code);
}

/**
 * Setup shutdown handlers for graceful process termination.
 */
export function setupShutdownHandlers(): void {
    process.on('exit', code =>
        endProcess(code, `Process exited with code ${code}`)
    );
    process.on('SIGINT', () => endProcess(-1, 'Process interrupted by SIGINT'));
    process.on('SIGTERM', () =>
        endProcess(-1, 'Process terminated by SIGTERM')
    );
}
