// Global variable to track system pause state
let isSystemPaused = false;

/**
 * Check if the system is currently paused
 * This is used by model providers to determine whether to wait before making API calls
 */
export function isPaused(): boolean {
    return isSystemPaused;
}

/**
 * Sleep for a specified number of milliseconds
 * Used for pause/resume functionality
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
