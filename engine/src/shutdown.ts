/**
 * Shutdown handlers for the MAGI system.
 */

/**
 * End the process with the given code and message.
 */
export async function endProcess(
    code: number = 0,
    message: string = 'Process ended'
): Promise<void> {
    console.log(`Ending process: ${message} (code: ${code})`);
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
