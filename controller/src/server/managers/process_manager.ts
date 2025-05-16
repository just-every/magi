/**
 * Process Manager Module
 *
 * Manages all MAGI system processes, including creation, monitoring, and termination.
 */
import { ChildProcess } from 'child_process';
import { Server } from 'socket.io';
import {
    ProcessStatus,
    ProcessCreateEvent,
    ProcessLogsEvent,
    ProcessUpdateEvent,
    AgentProcess,
    MagiMessage,
    ProcessToolType,
} from '../../types/index';
import { execPromise } from '../utils/docker_commands';
import { generateProcessColors } from './color_manager';
import { pushBranchAndOpenPR } from '../utils/git_push';
import { PREventsManager } from './pr_events_manager';
import {
    isDockerAvailable,
    checkDockerImageExists,
} from '../utils/docker_commands';
import {
    buildDockerImage,
    runDockerContainer,
    stopDockerContainer,
    monitorContainerLogs,
    getRunningMagiContainers,
} from './container_manager';
import { CommunicationManager } from './communication_manager';

/**
 * Process data interface
 * Contains all data related to a running or completed MAGI process
 */
export interface ProcessData {
    id: string; // Process ID (e.g., AI-xyz123)
    command: string; // Original command that started the process
    status: ProcessStatus; // Current status
    logs: string[]; // Accumulated log entries
    containerId?: string; // Docker container ID when running
    monitorProcess?: ChildProcess; // Process monitoring container logs
    checkInterval?: NodeJS.Timeout; // Interval for checking container status
    colors?: {
        rgb: string; // Primary color (rgb)
        bgColor: string; // Background color (rgba)
        textColor: string; // Text color (rgba)
    };
    agentProcess?: AgentProcess;
}

/**
 * Process collection type
 * Maps process IDs to their corresponding data
 */
interface Processes {
    [key: string]: ProcessData;
}

export class ProcessManager {
    private processes: Processes = {};
    private communicationManager: CommunicationManager;
    private processCompletionHandlers: Map<
        string,
        Array<() => Promise<void> | void>
    > = new Map();
    public io: Server;
    public coreProcessId: string | undefined;
    private prEventsManager: PREventsManager | undefined;

    constructor(io: Server) {
        this.io = io;
    }

    /**
     * Get all active processes
     *
     * @returns Object mapping process IDs to their data
     */
    getAllProcesses(): Processes {
        return this.processes;
    }

    setCommunicationManager(communicationManager: CommunicationManager): void {
        this.communicationManager = communicationManager;
    }

    /**
     * Set the PR events manager
     *
     * @param prEventsManager PR events manager instance
     */
    setPrEventsManager(prEventsManager: PREventsManager): void {
        this.prEventsManager = prEventsManager;
    }

    /**
     * Get a specific process by ID
     *
     * @param processId - The ID of the process to get
     * @returns The process data or undefined if not found
     */
    getProcess(processId: string): ProcessData | undefined {
        return this.processes[processId];
    }

    /**
     * Create a new process
     *
     * @param processId - Unique ID for the process
     * @param command - Command to execute
     * @returns The created process data
     */
    async createAgentProcess(agentProcess: AgentProcess): Promise<ProcessData> {
        return this.createProcess(
            agentProcess.processId,
            agentProcess.command,
            agentProcess
        );
    }

    /**
     * Create a new process
     *
     * @param processId - Unique ID for the process
     * @param command - Command to execute
     * @returns The created process data
     */
    async createProcess(
        processId: string,
        command: string,
        agentProcess?: AgentProcess
    ): Promise<ProcessData> {
        try {
            // Generate colors for the process
            const colors = generateProcessColors();

            if (!this.coreProcessId) {
                this.coreProcessId = processId;
            }

            const status = 'running';
            if (agentProcess) {
                agentProcess.status = status;
                agentProcess.output = 'Container started';
            }

            // Create and initialize process record
            const processData: ProcessData = {
                id: processId,
                command,
                status,
                logs: [],
                colors,
                agentProcess,
            };

            // Store the process
            this.processes[processId] = processData;

            // Notify all clients about the new process
            this.io.emit('process:create', {
                id: processId,
                name:
                    agentProcess?.name ||
                    (this.coreProcessId === processId
                        ? process.env.AI_NAME
                        : processId),
                command,
                status,
                colors,
            } as ProcessCreateEvent);

            // Start Docker container and command execution
            await this.spawnDockerProcess(
                processId,
                command,
                agentProcess?.tool,
                agentProcess
            );

            return processData;
        } catch (error) {
            this.updateProcessWithError(
                processId,
                `Failed to terminate: ${error instanceof Error ? error.message : String(error)}`
            );

            const errorMessage: MagiMessage = {
                processId,
                event: {
                    type: 'process_terminated',
                    error:
                        error instanceof Error ? error.message : String(error),
                },
            };
            await this.communicationManager.processContainerMessage(
                processId,
                errorMessage
            );
        }
    }

    /**
     * Updates a process with an error condition
     *
     * @param processId - The ID of the process to update
     * @param errorMessage - The error message to record
     */
    /**
     * Register a function to be called when a process completes successfully
     * @param processId Process ID to register handler for
     * @param handler Function to call when process completes
     */
    registerProcessCompletionHandler(
        processId: string,
        handler: () => Promise<void> | void
    ): void {
        if (!this.processCompletionHandlers.has(processId)) {
            this.processCompletionHandlers.set(processId, []);
        }

        this.processCompletionHandlers.get(processId).push(handler);
        console.log(`Registered completion handler for process ${processId}`);
    }

    /**
     * Run all registered completion handlers for a process
     * @param processId Process ID that completed
     */
    async runCompletionHandlers(processId: string): Promise<void> {
        const handlers = this.processCompletionHandlers.get(processId);

        if (handlers && handlers.length > 0) {
            console.log(
                `Running ${handlers.length} completion handlers for process ${processId}`
            );

            for (const handler of handlers) {
                try {
                    // Handler may return a Promise or void
                    await handler();
                } catch (error) {
                    console.error(
                        `Error in completion handler for process ${processId}:`,
                        error
                    );
                }
            }

            // Remove all handlers after execution
            this.processCompletionHandlers.delete(processId);
        }
    }

    updateProcessWithError(processId: string, errorMessage: string): void {
        if (!this.processes[processId]) {
            console.error(
                `Cannot update non-existent process ${processId} with error`
            );
            return;
        }

        console.error(`Process ${processId} failed: ${errorMessage}`);

        // Update process status
        this.processes[processId].status = 'failed';

        // Add formatted error to logs
        const errorLog = `[ERROR] ${errorMessage}`;
        this.processes[processId].logs.push(errorLog);

        // Notify clients about status change
        this.io.emit('process:update', {
            id: processId,
            status: 'failed',
        } as ProcessUpdateEvent);

        // Send error message to clients
        this.io.emit('process:logs', {
            id: processId,
            logs: errorLog,
        } as ProcessLogsEvent);
    }

    /**
     * Updates a process with status information
     *
     * @param processId - The ID of the process to update
     * @param message - The message to add to the logs
     */
    updateProcess(processId: string, message: string): void {
        if (!this.processes[processId]) {
            console.warn(`Cannot update non-existent process ${processId}`);
            return;
        }

        // Ignore any JSON messages that come through the old channel
        // These should be using the WebSocket communication now
        if (message.trim().startsWith('{') && message.trim().endsWith('}')) {
            if (message.includes('[JSON_MESSAGE]')) {
                // This is a debug message from the container, not meant for client display
                return;
            }

            // Try to detect if this is a structured message that should be ignored
            try {
                const data = JSON.parse(message);
                if (data.processId && (data.event || data.type)) {
                    // This is a structured message that should be coming through WebSocket
                    // Log it for debugging but don't send to clients as regular log
                    console.log(
                        `Detected structured message in logs for process ${processId} (should be using WebSocket)`
                    );
                    return;
                }
            } catch (e) {
                // Not valid JSON, continue as normal
            }
        }

        // Log message to server console
        console.log(`Process ${processId}: ${message}`);

        // Add to process logs
        this.processes[processId].logs.push(message);

        // Send message to all clients
        this.io.emit('process:logs', {
            id: processId,
            logs: message,
        } as ProcessLogsEvent);
    }

    /**
     * Executes a MAGI command in a Docker container
     *
     * This function handles:
     * 1. Verifying Docker availability
     * 2. Building the Docker image if needed
     * 3. Starting the container with the command
     * 4. Setting up log monitoring
     *
     * @param processId - The unique identifier for this process
     * @param command - The MAGI command to execute
     * @returns Promise that resolves when setup is complete (not when the command finishes)
     */
    async spawnDockerProcess(
        processId: string,
        command: string,
        tool?: ProcessToolType,
        agentProcess?: AgentProcess
    ): Promise<void> {
        try {
            // Step 1: Verify Docker is available on the system
            const dockerAvailable = await isDockerAvailable();
            if (!dockerAvailable) {
                throw new Error(
                    'Docker not available - commands cannot be run without Docker'
                );
            }

            // Step 2: Check for and build the MAGI Docker image if needed
            const imageExists = await checkDockerImageExists();
            if (!imageExists) {
                this.updateProcess(
                    processId,
                    'Docker image not found. Building image...'
                );

                const buildSuccess = await buildDockerImage({ verbose: false });
                if (!buildSuccess) {
                    throw new Error('Docker image build failed');
                }

                this.updateProcess(
                    processId,
                    'Docker image built successfully.'
                );
            }

            // Get project root directory for volume mounting

            // Step 4: Start the Docker container
            const containerId = await runDockerContainer({
                processId,
                command,
                tool,
                coreProcessId: this.coreProcessId,
                projectIds: agentProcess?.projectIds,
            });

            // Handle container start failure
            if (!containerId) {
                throw new Error(
                    `Container for process ${processId} failed to start`
                );
            }

            // Store container ID for future reference
            if (this.processes[processId]) {
                this.processes[processId].containerId = containerId;
            }

            // Step 5: Set up log monitoring
            this.updateProcess(processId, 'Starting secure MAGI container...');

            // Set up the log monitoring and status checking
            this.setupLogMonitoring(processId);
            this.setupContainerStatusChecking(processId);
        } catch (error: unknown) {
            // Handle any unexpected errors during the setup process
            throw new Error(
                `Error spawning Docker process: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Sets up log monitoring for a container
     * Creates and attaches monitoring functions to stream logs from a container
     *
     * @param processId - The process ID to monitor logs for
     */
    setupLogMonitoring(processId: string): void {
        const stopLogging = monitorContainerLogs(processId, logData => {
            if (this.processes[processId]) {
                // Store logs in memory
                this.processes[processId].logs.push(logData);

                // Send logs to all connected clients
                this.io.emit('process:logs', {
                    id: processId,
                    logs: logData,
                } as ProcessLogsEvent);
            }
        });

        // Store the stop function for later cleanup
        if (this.processes[processId]) {
            this.processes[processId].monitorProcess = {
                kill: stopLogging,
            } as unknown as ChildProcess;
        }
    }

    /**
     * Sets up container status checking
     * Periodically checks if a container is still running and updates status accordingly
     *
     * @param processId - The process ID to check status for
     */
    setupContainerStatusChecking(processId: string): void {
        const containerName = `magi-${processId}`;

        // Set up periodic container status checking
        const statusCheckIntervalMs = 5000; // Check every 5 seconds
        const checkInterval = setInterval(async () => {
            try {
                // Query container status using Docker inspect
                const { stdout } = await execPromise(
                    `docker inspect --format={{.State.Status}} ${containerName}`
                );
                const status = stdout.trim();

                // If the container has exited, determine success/failure and clean up
                if (status === 'exited') {
                    console.log(
                        `Container ${containerName} has exited, checking exit code`
                    );

                    // Get the container's exit code
                    const { stdout: exitCodeStdout } = await execPromise(
                        `docker inspect --format={{.State.ExitCode}} ${containerName}`
                    );
                    const exitCode = parseInt(exitCodeStdout.trim(), 10);

                    // Update process status based on exit code
                    if (this.processes[processId]) {
                        // Success (exit code 0) → completed, otherwise → failed
                        const newStatus: ProcessStatus =
                            exitCode === 0 ? 'completed' : 'failed';
                        this.processes[processId].status = newStatus;

                        console.log(
                            `Process ${processId} ${newStatus} with exit code ${exitCode}`
                        );

                        // Notify clients about status change
                        this.io.emit('process:update', {
                            id: processId,
                            status: newStatus,
                        } as ProcessUpdateEvent);

                        // Note: Git changes are now handled via the pull_request_ready event
                    }

                    // Clean up monitoring resources
                    clearInterval(checkInterval);

                    // Kill the monitoring process if it exists
                    if (this.processes[processId]?.monitorProcess) {
                        this.processes[processId].monitorProcess.kill();
                    }
                }
            } catch (_) {
                if (this.processes[processId]) {
                    // Mark as completed if we can't determine actual status
                    this.processes[processId].status = 'completed';

                    // Notify clients
                    this.io.emit('process:update', {
                        id: processId,
                        status: 'completed',
                    } as ProcessUpdateEvent);
                }

                // Clean up monitoring resources
                clearInterval(checkInterval);

                // Kill the monitoring process if it exists
                if (this.processes[processId]?.monitorProcess) {
                    this.processes[processId].monitorProcess.kill();
                }

                // Error usually means container doesn't exist anymore
                throw _;
            }
        }, statusCheckIntervalMs);

        // Store interval reference for cleanup on termination
        if (this.processes[processId]) {
            this.processes[processId].checkInterval = checkInterval;
        }
    }

    /**
     * Stops and removes a Docker container for a specific process
     *
     * This function:
     * 1. Cleans up monitoring resources
     * 2. Stops the Docker container
     * 3. Updates the process status
     * 4. Notifies clients about the termination
     *
     * @param processId - The ID of the process to stop
     * @returns Promise resolving to true if successful, false otherwise
     */
    async stopProcess(processId: string): Promise<boolean> {
        // Validate that the process exists
        if (!this.processes[processId]) {
            console.warn(`Attempted to stop non-existent process ${processId}`);
            return false;
        }

        try {
            console.log(`Stopping container for process ${processId}`);

            // Step 1: Clean up monitoring resources first to prevent streaming errors
            // Kill the log monitoring process if it exists
            if (this.processes[processId].monitorProcess) {
                try {
                    this.processes[processId].monitorProcess.kill();
                } catch (monitorError) {
                    console.log(
                        `Error killing monitor process for ${processId}: ${monitorError}`
                    );
                    // Continue despite error
                }
                this.processes[processId].monitorProcess = undefined;
            }

            // Clear the status check interval if it exists
            if (this.processes[processId].checkInterval) {
                clearInterval(this.processes[processId].checkInterval);
                this.processes[processId].checkInterval = undefined;
            }

            // If there's no container ID, we can skip the actual container stop
            if (!this.processes[processId].containerId) {
                console.warn(
                    `Process ${processId} has no associated container ID, marking as terminated`
                );

                // Update process status
                this.processes[processId].status = 'terminated';

                // Notify clients
                this.io.emit('process:update', {
                    id: processId,
                    status: 'terminated',
                } as ProcessUpdateEvent);

                this.updateProcess(processId, 'Process marked as terminated');
                return true;
            }

            // Step 2: Stop the Docker container
            this.updateProcess(processId, 'Terminating process...');
            const success = await stopDockerContainer(processId);

            // Step 3: Update process status and notify clients
            // Since we modified stopDockerContainer to be more resilient, we generally expect success to be true
            if (success) {
                console.log(
                    `Container for process ${processId} stopped successfully`
                );

                // Update process status
                this.processes[processId].status = 'terminated';

                // Notify all clients about the termination
                this.io.emit('process:update', {
                    id: processId,
                    status: 'terminated',
                } as ProcessUpdateEvent);

                // Add termination message to logs
                this.updateProcess(processId, 'Process terminated by user');
            } else {
                console.error(
                    `Failed to stop container for process ${processId}`
                );
                this.updateProcess(processId, 'Failed to terminate process');
            }

            return success;
        } catch (error: unknown) {
            console.error(
                `Error stopping container for process ${processId}:`,
                error
            );

            try {
                this.updateProcessWithError(
                    processId,
                    `Failed to terminate: ${error instanceof Error ? error.message : String(error)}`
                );
            } catch (loggingError) {
                console.error(
                    `Additional error while logging failure for ${processId}:`,
                    loggingError
                );
            }

            // Since this is used during system shutdown, we want to be maximally resilient
            return true;
        }
    }

    /**
     * Retrieve existing MAGI containers and set them up for monitoring
     */
    async retrieveExistingContainers(): Promise<void> {
        console.log('Retrieving existing MAGI containers...');

        const containers = await getRunningMagiContainers();

        if (containers.length === 0) {
            console.log('No existing MAGI containers found');
            return;
        }

        console.log(`Found ${containers.length} existing MAGI containers`);

        for (const container of containers) {
            const { id, containerId, command } = container;

            // Skip if we're already tracking this process
            if (this.processes[id]) {
                console.log(`Process ${id} already being tracked, skipping`);
                continue;
            }

            console.log(
                `Resuming monitoring of container ${containerId} with ID ${id}`
            );

            // Generate colors for the process
            const colors = generateProcessColors();

            // Set up process tracking
            this.processes[id] = {
                id,
                command,
                status: 'running',
                logs: ['Connecting to secure MAGI container...'],
                containerId,
                colors,
            };

            // Set up log monitoring for the container
            this.setupLogMonitoring(id);

            // Set up container status checking
            this.setupContainerStatusChecking(id);
        }
    }

    /**
     * Clean up all processes during server shutdown
     */
    async cleanup(): Promise<void> {
        console.log('Cleaning up processes...');

        // Step 1: First cleanup any monitoring processes and intervals
        for (const [processId, processData] of Object.entries(this.processes)) {
            // Kill the monitoring process if it exists
            if (processData.monitorProcess) {
                try {
                    processData.monitorProcess.kill();
                    processData.monitorProcess = undefined;
                } catch (error) {
                    console.log(
                        `Error stopping monitoring process for ${processId}: ${error}`
                    );
                }
            }

            // Clear any intervals
            if (processData.checkInterval) {
                clearInterval(processData.checkInterval);
                processData.checkInterval = undefined;
            }
        }

        // Step 2: Get ALL containers with "magi-AI" name prefix, not just the ones we're tracking
        // This ensures we also catch containers that might have been created but not fully tracked
        try {
            const { stdout } = await execPromise(
                "docker ps -a --filter 'name=magi-AI' --format '{{.Names}}'"
            );

            if (stdout.trim()) {
                const containerNames = stdout.trim().split('\n');
                const containerIds = containerNames.map(name =>
                    name.replace('magi-', '')
                );

                console.log(
                    `Found ${containerNames.length} MAGI containers to clean up: ${containerIds.join(', ')}`
                );

                // Stop all containers in parallel
                await Promise.all(
                    containerNames.map(async containerName => {
                        try {
                            console.log(`Stopping container ${containerName}`);
                            await execPromise(
                                `docker stop --time=2 ${containerName}`
                            );
                        } catch (error) {
                            console.error(
                                `Error stopping container ${containerName}:`,
                                error
                            );
                        }
                    })
                );

                // Mark all related processes as terminated
                for (const containerName of containerNames) {
                    const processId = containerName.replace('magi-', '');
                    if (this.processes[processId]) {
                        this.processes[processId].status = 'terminated';

                        // Notify clients about termination
                        this.io.emit('process:update', {
                            id: processId,
                            status: 'terminated',
                        } as ProcessUpdateEvent);

                        // Add termination message to logs
                        this.updateProcess(
                            processId,
                            'Process terminated by system shutdown'
                        );
                    }
                }
            } else {
                console.log('No running MAGI containers found to clean up');
            }
        } catch (error) {
            console.error('Error finding containers to clean up:', error);
        }

        // Step 3: Also run our regular cleanup for tracked processes as a fallback
        const runningProcesses = Object.entries(this.processes)
            .filter(([, data]) => data.status === 'running' && data.containerId)
            .map(([id]) => id);

        if (runningProcesses.length > 0) {
            console.log(
                `Stopping ${runningProcesses.length} tracked processes in parallel: ${runningProcesses.join(', ')}`
            );

            // Stop all tracked containers in parallel
            try {
                await Promise.all(
                    runningProcesses.map(async processId => {
                        try {
                            // For parallel termination, skip the client notifications until after all stop operations
                            await stopDockerContainer(processId);
                            if (this.processes[processId]) {
                                this.processes[processId].status = 'terminated';
                            }
                        } catch (error: unknown) {
                            console.error(
                                `Error stopping container for process ${processId}:`,
                                error
                            );
                        }
                        return processId;
                    })
                );

                // After all containers are stopped, notify clients and update logs
                for (const processId of runningProcesses) {
                    if (
                        this.processes[processId] &&
                        this.processes[processId].status === 'terminated'
                    ) {
                        // Notify clients about termination
                        this.io.emit('process:update', {
                            id: processId,
                            status: 'terminated',
                        } as ProcessUpdateEvent);

                        // Add termination message to logs
                        this.updateProcess(
                            processId,
                            'Process terminated by system shutdown'
                        );
                    }
                }
            } catch (error: unknown) {
                console.error(
                    'Error during parallel process termination:',
                    error
                );
            }
        }

        // Step 4: Final check to make sure ALL containers are really gone
        try {
            const { stdout } = await execPromise(
                "docker ps --filter 'name=magi-AI' -q"
            );
            if (stdout.trim()) {
                console.log(
                    `Found ${stdout.trim().split('\n').length} containers still running, forcing removal...`
                );
                await execPromise(
                    "docker ps --filter 'name=magi-AI' -q | xargs -r docker rm -f"
                );
            } else {
                console.log(
                    'All MAGI containers have been successfully stopped'
                );
            }
        } catch (error) {
            console.error('Error during final container cleanup check:', error);
        }
    }

    /**
     * Remove a process from management
     *
     * @param processId - The ID of the process to remove
     */
    removeProcess(processId: string): void {
        if (this.processes[processId]) {
            delete this.processes[processId];
        }
    }

    /**
     * Clean up terminated processes
     * Useful for removing terminated processes from memory
     */
    cleanupTerminatedProcesses(): void {
        for (const [id, process] of Object.entries(this.processes)) {
            if (process.status === 'terminated') {
                console.log(`Cleaning up terminated process ${id} from memory`);
                delete this.processes[id];
            }
        }
    }

    /**
     * Handle a pull request ready event from a container
     *
     * @param processId - The ID of the MAGI process that generated the changes
     * @param projectId - The ID of the project to push changes for
     * @param branch - The name of the branch to push
     * @param message - The commit message for potential merge
     * @returns Promise resolving to true if successful, false otherwise
     */
    async handlePullRequestReady(
        processId: string,
        projectId: string,
        branch: string,
        message: string
    ): Promise<boolean> {
        console.log(
            `[process-manager] Handling pull request ready for ${projectId} from process ${processId}`
        );

        try {
            const result = await pushBranchAndOpenPR(
                processId,
                projectId,
                branch,
                message,
                this.prEventsManager
            );
            console.log(
                `[process-manager] Pull request ${result ? 'pushed successfully' : 'failed'} for ${projectId}`
            );

            // Log to the process logs
            this.updateProcess(
                processId,
                `[git] Branch ${branch} for project ${projectId} ${result ? 'pushed successfully' : 'failed to push'}`
            );

            return result;
        } catch (error) {
            console.error(
                '[process-manager] Error handling pull request:',
                error
            );

            // Log to the process logs
            this.updateProcessWithError(
                processId,
                `Failed to push git changes: ${error instanceof Error ? error.message : String(error)}`
            );

            return false;
        }
    }
}
