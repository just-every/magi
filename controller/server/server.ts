/**
 * MAGI System Server - Main Entry Point
 *
 * This is the main server module that:
 * - Provides a web interface via Express
 * - Handles WebSocket communication with the client
 * - Manages Docker containers that run the MAGI Python backend
 * - Streams logs and command results to the client
 */

// Import dotenv to load environment variables
import 'dotenv/config';

import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import { /* spawn, */ ChildProcess } from 'child_process';
import path from 'path';
import dotenv from 'dotenv';
import { promisify } from 'util';
import WebSocket from 'ws';
import { exec } from 'child_process';
import {
  getServerVersion, 
  loadAllEnvVars, 
  saveEnvVar, 
  updateServerVersion,
  saveUsedColors,
  loadUsedColors
} from './env_store';

// Import Docker interface utilities
import {
  isDockerAvailable,
  checkDockerImageExists,
  buildDockerImage,
  runDockerContainer,
  stopDockerContainer,
  sendCommandToContainer,
  monitorContainerLogs,
  cleanupAllContainers,
  getRunningMagiContainers
} from './docker_interface';

// Load environment variables from .env file
dotenv.config();

/**
 * Define a safe exec promise that doesn't throw on non-zero exit codes
 * This is useful for Docker commands where a non-zero exit code might be expected
 * (like checking if a container exists)
 *
 * @param command - The shell command to execute
 * @returns Object containing stdout and stderr
 */
const execPromiseFallback = async (command: string): Promise<{stdout: string, stderr: string}> => {
  try {
    return await promisify(exec)(command);
  } catch (error: unknown) {
    return {
      stdout: '',
      stderr: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Process status type definition
 * Represents the possible states of a MAGI process
 */
type ProcessStatus = 'running' | 'completed' | 'failed' | 'terminated';

/**
 * Process data interface
 * Contains all data related to a running or completed MAGI process
 */
interface ProcessData {
  id: string;                     // Process ID (e.g., AI-xyz123)
  command: string;                // Original command that started the process
  status: ProcessStatus;          // Current status
  logs: string[];                 // Accumulated log entries
  containerId?: string;           // Docker container ID when running
  monitorProcess?: ChildProcess;  // Process monitoring container logs
  checkInterval?: NodeJS.Timeout; // Interval for checking container status
  colors?: {
    bgColor: string;              // Background color (rgba)
    textColor: string;            // Text color (rgba)
  };
}

/**
 * Process collection type
 * Maps process IDs to their corresponding data
 */
interface Processes {
  [key: string]: ProcessData;
}

/**
 * Socket.io event interfaces
 * These define the structure of events sent between client and server
 */

// Event sent when a new process is created
interface ProcessCreateEvent {
  id: string;           // Process ID
  command: string;      // Command that created the process
  status: string;       // Initial status (usually 'running')
  colors: {
    bgColor: string;     // Background color (rgba)
    textColor: string;   // Text color (rgba)
  };
}

// Event sent when new logs are available for a process
interface ProcessLogsEvent {
  id: string;           // Process ID
  logs: string;         // Log content (may include markdown)
}

// Event sent when a process status changes
interface ProcessUpdateEvent {
  id: string;           // Process ID
  status: string;       // New status
}

// Event for sending a command to a specific process
interface ProcessCommandEvent {
  processId: string;    // Target process ID
  command: string;      // Command to send
}

// Event for server information sent to clients
interface ServerInfoEvent {
  version: string;      // Server version
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Set up WebSocket server for live reload
const wss = new WebSocket.Server({ noServer: true });
const liveReloadClients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  liveReloadClients.add(ws);

  ws.on('close', () => {
    liveReloadClients.delete(ws);
  });
});

// Handle upgrade for the WebSocket connection
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;

  if (pathname === '/livereload') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Serve compiled JavaScript files from dist/src
app.use('/client.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, '../client/client.js'));
});

// Serve static files from the dist folder
app.use(express.static(path.join(__dirname, '../client')));

// Process management
const processes: Processes = {};

/**
 * Store previously used colors to ensure variety
 * Each entry is [r, g, b] values
 * Initialize from stored values if available
 */
const usedColors: Array<[number, number, number]> = loadUsedColors();

/**
 * Generate colors for a process header and text
 * Creates distinct colors with maximum difference from existing ones
 *
 * @returns Object with background and text colors in rgba format
 */
function generateProcessColors(): { bgColor: string, textColor: string } {
  // If we have too many colors stored, we'll start forgetting the oldest ones
  // to avoid over-constraining our color generation
  const maxColorMemory = 10;
  if (usedColors.length > maxColorMemory) {
    usedColors.shift(); // Remove the oldest color
  }

  // Generate a set of candidate colors to choose from
  const candidates: Array<[number, number, number]> = [];
  const numCandidates = 20; // Generate 20 candidates to choose from

  for (let i = 0; i < numCandidates; i++) {
    // Create base colors, avoid too much yellow by keeping red and green from both being too high
    let r = Math.floor(Math.random() * 200) + 55; // 55-255
    let g = Math.floor(Math.random() * 200) + 55; // 55-255
    let b = Math.floor(Math.random() * 200) + 55; // 55-255

    // Ensure one color dominates to make the theme clear
    const dominantIndex = Math.floor(Math.random() * 3);
    if (dominantIndex === 0) {
      r = Math.min(255, r + 50);
      g = Math.max(50, g - 30);
      b = Math.max(50, b - 30);
    } else if (dominantIndex === 1) {
      g = Math.min(255, g + 50);
      r = Math.max(50, r - 30);
      b = Math.max(50, b - 30);
    } else {
      b = Math.min(255, b + 50);
      r = Math.max(50, r - 30);
      g = Math.max(50, g - 30);
    }

    candidates.push([r, g, b]);
  }

  // Calculate the minimum distance between this color and all used colors
  // Higher distance means more distinct color
  function minColorDistance(color: [number, number, number]): number {
    if (usedColors.length === 0) return Infinity;
    
    return Math.min(...usedColors.map(usedColor => {
      // Calculate Euclidean distance in RGB space
      const dr = color[0] - usedColor[0];
      const dg = color[1] - usedColor[1];
      const db = color[2] - usedColor[2];
      return Math.sqrt(dr * dr + dg * dg + db * db);
    }));
  }

  // Choose the candidate with the maximum minimum distance
  let bestCandidate = candidates[0];
  let bestDistance = minColorDistance(bestCandidate);

  for (let i = 1; i < candidates.length; i++) {
    const distance = minColorDistance(candidates[i]);
    if (distance > bestDistance) {
      bestDistance = distance;
      bestCandidate = candidates[i];
    }
  }

  // Add the selected color to our used colors list
  usedColors.push(bestCandidate);

  // Create background with very low alpha
  const [r, g, b] = bestCandidate;
  const bgColor = `rgba(${r}, ${g}, ${b}, 0.08)`;

  // Create darker text version for contrast
  const textColor = `rgba(${Math.floor(r * 0.6)}, ${Math.floor(g * 0.6)}, ${Math.floor(b * 0.6)}, 0.9)`;

  return { bgColor, textColor };
}

/**
 * Retrieve existing MAGI containers and set them up for monitoring
 */
async function retrieveExistingContainers(): Promise<void> {
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
    if (processes[id]) {
      console.log(`Process ${id} already being tracked, skipping`);
      continue;
    }

    console.log(`Resuming monitoring of container ${containerId} with ID ${id}`);

    // Generate colors for the process
    const colors = generateProcessColors();

    // Set up process tracking
    processes[id] = {
      id,
      command,
      status: 'running',
      logs: [`Connecting to secure MAGI container...`],
      containerId,
      colors
    };
    
    // Extract the RGB values to store in usedColors
    const colorMatch = colors.bgColor.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/);
    if (colorMatch && colorMatch.length >= 4) {
      const r = parseInt(colorMatch[1], 10);
      const g = parseInt(colorMatch[2], 10);
      const b = parseInt(colorMatch[3], 10);
      
      // Add to usedColors if valid
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        usedColors.push([r, g, b]);
      }
    }

    // Set up log monitoring for the container
    setupLogMonitoring(id);

    // Set up container status checking
    setupContainerStatusChecking(id);
  }
}

// Docker functions are now imported from the Docker interface module

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
async function spawnDockerProcess(processId: string, command: string): Promise<void> {
  try {
    // Step 1: Verify Docker is available on the system
    const dockerAvailable = await isDockerAvailable();
    if (!dockerAvailable) {
      updateProcessWithError(processId, 'Docker is not available. Cannot run command.');
      console.error('Docker not available - commands cannot be run without Docker');
      return;
    }

    // Step 2: Check for and build the MAGI Docker image if needed
    const imageExists = await checkDockerImageExists();
    if (!imageExists) {
      updateProcess(processId, 'Docker image not found. Building image...');
      console.log('Building Docker image for MAGI system...');

      const buildSuccess = await buildDockerImage({ verbose: false });
      if (!buildSuccess) {
        updateProcessWithError(processId, 'Failed to build Docker image. Cannot run command.');
        console.error('Docker image build failed');
        return;
      }

      updateProcess(processId, 'Docker image built successfully.');
      console.log('Docker image built successfully');
    }

    // Step 3: Prepare environment variables and paths
    // Get API keys from environment
    const openaiApiKey = process.env.OPENAI_API_KEY || '';
    if (!openaiApiKey) {
      console.warn('Warning: OPENAI_API_KEY not set in environment');
    }

    // Get project root directory for volume mounting
    const projectRoot = path.resolve(__dirname, '../../..');

    // Step 4: Start the Docker container
    const containerId = await runDockerContainer({
      processId,
      command,
      openaiApiKey,
      projectRoot
    });

    // Handle container start failure
    if (!containerId) {
      updateProcessWithError(processId, 'Failed to start Docker container.');
      console.error(`Container for process ${processId} failed to start`);
      return;
    }

    // Store container ID for future reference
    if (processes[processId]) {
      processes[processId].containerId = containerId;
    }

    // Step 5: Set up log monitoring
    updateProcess(processId, 'Starting secure MAGI container...');
    // Set up the log monitoring and status checking
    setupLogMonitoring(processId);
    setupContainerStatusChecking(processId);

  } catch (error: unknown) {
    // Handle any unexpected errors during the setup process
    console.error('Error spawning Docker process:', error);
    updateProcessWithError(
      processId,
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
function setupLogMonitoring(processId: string): void {
  const stopLogging = monitorContainerLogs(processId, (logData) => {
    if (processes[processId]) {
      // Store logs in memory
      processes[processId].logs.push(logData);

      // Send logs to all connected clients
      io.emit('process:logs', {
        id: processId,
        logs: logData
      } as ProcessLogsEvent);
    }
  });

  // Store the stop function for later cleanup
  if (processes[processId]) {
    processes[processId].monitorProcess = {
      kill: stopLogging
    } as unknown as ChildProcess;
  }
}

/**
 * Sets up container status checking
 * Periodically checks if a container is still running and updates status accordingly
 *
 * @param processId - The process ID to check status for
 */
function setupContainerStatusChecking(processId: string): void {
  const containerName = `magi-${processId}`;

  // Set up periodic container status checking
  const statusCheckIntervalMs = 5000; // Check every 5 seconds
  const checkInterval = setInterval(async () => {
    try {
      // Query container status using Docker inspect
      const { stdout } = await execPromiseFallback(
        `docker inspect --format={{.State.Status}} ${containerName}`
      );
      const status = stdout.trim();

      // If the container has exited, determine success/failure and clean up
      if (status === 'exited') {
        console.log(`Container ${containerName} has exited, checking exit code`);

        // Get the container's exit code
        const { stdout: exitCodeStdout } = await execPromiseFallback(
          `docker inspect --format={{.State.ExitCode}} ${containerName}`
        );
        const exitCode = parseInt(exitCodeStdout.trim(), 10);

        // Update process status based on exit code
        if (processes[processId]) {
          // Success (exit code 0) → completed, otherwise → failed
          const newStatus: ProcessStatus = exitCode === 0 ? 'completed' : 'failed';
          processes[processId].status = newStatus;

          console.log(`Process ${processId} ${newStatus} with exit code ${exitCode}`);

          // Notify clients about status change
          io.emit('process:update', {
            id: processId,
            status: newStatus
          } as ProcessUpdateEvent);
        }

        // Clean up monitoring resources
        clearInterval(checkInterval);

        // Kill the monitoring process if it exists
        if (processes[processId]?.monitorProcess) {
          processes[processId].monitorProcess.kill();
        }
      }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
      // Error usually means container doesn't exist anymore
      console.log(`Container ${containerName} no longer exists or is not inspectable`);

      if (processes[processId]) {
        // Mark as completed if we can't determine actual status
        processes[processId].status = 'completed';

        // Notify clients
        io.emit('process:update', {
          id: processId,
          status: 'completed'
        } as ProcessUpdateEvent);
      }

      // Clean up monitoring resources
      clearInterval(checkInterval);

      // Kill the monitoring process if it exists
      if (processes[processId]?.monitorProcess) {
        processes[processId].monitorProcess.kill();
      }
    }
  }, statusCheckIntervalMs);

  // Store interval reference for cleanup on termination
  if (processes[processId]) {
    processes[processId].checkInterval = checkInterval;
  }
}

/**
 * Updates a process with an error condition
 *
 * This function:
 * 1. Marks the process as failed
 * 2. Adds the error message to the logs
 * 3. Notifies all clients about the status change and error message
 *
 * @param processId - The ID of the process to update
 * @param errorMessage - The error message to record
 */
function updateProcessWithError(processId: string, errorMessage: string): void {
  if (!processes[processId]) {
    console.error(`Cannot update non-existent process ${processId} with error`);
    return;
  }

  console.error(`Process ${processId} failed: ${errorMessage}`);

  // Update process status
  processes[processId].status = 'failed';

  // Add formatted error to logs
  const errorLog = `[ERROR] ${errorMessage}`;
  processes[processId].logs.push(errorLog);

  // Notify clients about status change
  io.emit('process:update', {
    id: processId,
    status: 'failed'
  } as ProcessUpdateEvent);

  // Send error message to clients
  io.emit('process:logs', {
    id: processId,
    logs: errorLog
  } as ProcessLogsEvent);
}

/**
 * Updates a process with status information
 *
 * This function:
 * 1. Adds the message to the process logs
 * 2. Sends the message to all connected clients
 *
 * @param processId - The ID of the process to update
 * @param message - The message to add to the logs
 */
function updateProcess(processId: string, message: string): void {
  if (!processes[processId]) {
    console.warn(`Cannot update non-existent process ${processId}`);
    return;
  }

  // Log message to server console
  console.log(`Process ${processId}: ${message}`);

  // Add to process logs
  processes[processId].logs.push(message);

  // Send message to all clients
  io.emit('process:logs', {
    id: processId,
    logs: message
  } as ProcessLogsEvent);
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
async function stopContainer(processId: string): Promise<boolean> {
  // Validate that the process exists
  if (!processes[processId]) {
    console.warn(`Attempted to stop non-existent process ${processId}`);
    return false;
  }

  try {
    console.log(`Stopping container for process ${processId}`);

    // Step 1: Clean up monitoring resources first to prevent streaming errors
    // Kill the log monitoring process if it exists
    if (processes[processId].monitorProcess) {
      try {
        processes[processId].monitorProcess.kill();
      } catch (monitorError) {
        console.log(`Error killing monitor process for ${processId}: ${monitorError}`);
        // Continue despite error
      }
      processes[processId].monitorProcess = undefined;
    }

    // Clear the status check interval if it exists
    if (processes[processId].checkInterval) {
      clearInterval(processes[processId].checkInterval);
      processes[processId].checkInterval = undefined;
    }

    // If there's no container ID, we can skip the actual container stop
    if (!processes[processId].containerId) {
      console.warn(`Process ${processId} has no associated container ID, marking as terminated`);

      // Update process status
      processes[processId].status = 'terminated';

      // Notify clients
      io.emit('process:update', {
        id: processId,
        status: 'terminated'
      } as ProcessUpdateEvent);

      updateProcess(processId, 'Process marked as terminated');
      return true;
    }

    // Step 2: Stop the Docker container
    updateProcess(processId, 'Terminating process...');
    const success = await stopDockerContainer(processId);

    // Step 3: Update process status and notify clients
    // Since we modified stopDockerContainer to be more resilient, we generally expect success to be true
    if (success) {
      console.log(`Container for process ${processId} stopped successfully`);

      // Update process status
      processes[processId].status = 'terminated';

      // Notify all clients about the termination
      io.emit('process:update', {
        id: processId,
        status: 'terminated'
      } as ProcessUpdateEvent);

      // Add termination message to logs
      updateProcess(processId, 'Process terminated by user');
    } else {
      console.error(`Failed to stop container for process ${processId}`);
      updateProcess(processId, 'Failed to terminate process');
    }

    return success;
  } catch (error: unknown) {
    console.error(`Error stopping container for process ${processId}:`, error);

    try {
      updateProcessWithError(processId, `Failed to terminate: ${error instanceof Error ? error.message : String(error)}`);
    } catch (loggingError) {
      console.error(`Additional error while logging failure for ${processId}:`, loggingError);
    }

    // Since this is used during system shutdown, we want to be maximally resilient
    return true;
  }
}

/**
 * Socket.io connection handling
 * Manages WebSocket communication with clients
 */
io.on('connection', (socket: Socket) => {
  const clientId = socket.id.substring(0, 8);
  console.log(`Client connected: ${clientId}`);

  socket.emit('server:info', {
    version: getServerVersion()
  } as ServerInfoEvent);

  // Clean up terminated processes that shouldn't be showing
  // This prevents terminated processes from being visible to new clients
  Object.entries(processes).forEach(([id, process]) => {
    if (process.status === 'terminated') {
      console.log(`Cleaning up terminated process ${id} from memory`);
      delete processes[id];
    }
  });

  // Send current processes to the new client (excluding terminated)
  // This allows the client to see all active processes when they connect
  Object.entries(processes).forEach(([id, process]) => {
    console.log(`Sending process ${id} state to new client ${clientId}`);

    // First send the process creation event
    socket.emit('process:create', {
      id,
      command: process.command,
      status: process.status,
      colors: process.colors || generateProcessColors() // Use existing colors or generate new ones
    } as ProcessCreateEvent);

    // Then send all accumulated logs
    if (process.logs.length > 0) {
      socket.emit('process:logs', {
        id,
        logs: process.logs.join('\n')
      } as ProcessLogsEvent);
    }
  });

  /**
   * Handler for new command execution requests
   */
  socket.on('command:run', (command: string) => {
    // Generate a unique process ID
    const processId = `AI-${Math.random().toString(36).substring(2, 8)}`;

    // Create and initialize process record
    processes[processId] = {
      id: processId,
      command,
      status: 'running',
      logs: []
    };

      // Generate colors for the process
    const colors = generateProcessColors();

    // Store colors with the process data
    processes[processId].colors = colors;

    // Notify all clients about the new process
    io.emit('process:create', {
      id: processId,
      command,
      status: 'running',
      colors: colors
    } as ProcessCreateEvent);

    // Start Docker container and command execution
    spawnDockerProcess(processId, command);
  });

  /**
   * Handler for process termination requests
   */
  socket.on('process:terminate', async (processId: string) => {
    console.log(`Client ${clientId} requested termination of process ${processId}`);

    // Verify the process exists
    if (!processes[processId]) {
      console.warn(`Process ${processId} does not exist, can't terminate`);
      socket.emit('process:logs', {
        id: processId,
        logs: `[ERROR] Process does not exist or has already terminated`
      } as ProcessLogsEvent);
      return;
    }

    // Stop the Docker container
    const success = await stopContainer(processId);

    if (!success) {
      console.error(`Failed to terminate process ${processId}`);
      socket.emit('process:logs', {
        id: processId,
        logs: `[ERROR] Failed to terminate process`
      } as ProcessLogsEvent);
    }
  });

  /**
   * Handler for commands sent to a specific process
   * These are follow-up commands to an existing process
   */
  socket.on('process:command', async (data: ProcessCommandEvent) => {
    const { processId, command } = data;
    console.log(`Client ${clientId} sent command to process ${processId}: ${command}`);

    // Verify the process exists and is running
    if (!processes[processId]) {
      console.warn(`Cannot send command: Process ${processId} does not exist`);
      socket.emit('process:logs', {
        id: processId,
        logs: `[ERROR] Process does not exist or has terminated`
      } as ProcessLogsEvent);
      return;
    }

    if (processes[processId].status !== 'running') {
      console.warn(`Cannot send command: Process ${processId} is not running (status: ${processes[processId].status})`);
      socket.emit('process:logs', {
        id: processId,
        logs: `[ERROR] Cannot send command: process is not running (status: ${processes[processId].status})`
      } as ProcessLogsEvent);
      return;
    }

    // Process command in the container
    updateProcess(processId, `> ${command}`);
    const success = await sendCommandToContainer(processId, command);

    if (!success) {
      console.error(`Failed to send command to container for process ${processId}`);
      updateProcess(processId, `[ERROR] Failed to send command: Unable to communicate with container`);
    } else {
      console.log(`Command sent to process ${processId} successfully`);
      // The command response will come through container logs
    }
  });

  /**
   * Handler for client disconnection
   */
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${clientId}`);
    // Note: We don't stop any processes when a client disconnects,
    // as other clients may still be monitoring them
  });
});

/**
 * Server cleanup function
 * Ensures all Docker containers are properly stopped on server shutdown
 */
async function cleanup(): Promise<void> {
  console.log('MAGI System shutting down - cleaning up resources...');

  // Step 1: First cleanup any monitoring processes and intervals
  for (const [processId, processData] of Object.entries(processes)) {
    // Kill the monitoring process if it exists
    if (processData.monitorProcess) {
      try {
        processData.monitorProcess.kill();
        processData.monitorProcess = undefined;
      } catch (error) {
        console.log(`Error stopping monitoring process for ${processId}: ${error}`);
      }
    }

    // Clear any intervals
    if (processData.checkInterval) {
      clearInterval(processData.checkInterval);
      processData.checkInterval = undefined;
    }
  }

  // Step 2: Stop all running processes that we know about
  const runningProcesses = Object.entries(processes)
    .filter(([, data]) => data.status === 'running' && data.containerId)
    .map(([id]) => id);

  if (runningProcesses.length > 0) {
    console.log(`Stopping ${runningProcesses.length} running processes in parallel: ${runningProcesses.join(', ')}`);

    // Stop all containers in parallel
    try {
      await Promise.all(
        runningProcesses.map(async (processId) => {
          try {
            // For parallel termination, skip the client notifications until after all stop operations
            await stopDockerContainer(processId);
            if (processes[processId]) {
              processes[processId].status = 'terminated';
            }
          } catch (error: unknown) {
            console.error(`Error stopping container for process ${processId}:`, error);
            // We continue despite errors for any individual container
          }
          return processId;
        })
      );

      // After all containers are stopped, notify clients and update logs
      for (const processId of runningProcesses) {
        if (processes[processId] && processes[processId].status === 'terminated') {
          // Notify clients about termination
          io.emit('process:update', {
            id: processId,
            status: 'terminated'
          } as ProcessUpdateEvent);

          // Add termination message to logs
          updateProcess(processId, 'Process terminated by system shutdown');
        }
      }
    } catch (error: unknown) {
      console.error("Error during parallel process termination:", error);
    }
  }

  // Step 3: Additional cleanup for any containers that might have been missed
  try {
    await cleanupAllContainers();
  } catch (error: unknown) {
    console.error('Error during final container cleanup:', error);
  }

  // Step 4: Save used colors to persist across restarts
  try {
    saveUsedColors(usedColors);
  } catch (error: unknown) {
    console.error('Error saving used colors:', error);
  }

  console.log('Cleanup completed');
}

// Flag to track if cleanup is already in progress
let cleanupInProgress = false;

// Register cleanup handlers for various termination signals
process.on('SIGINT', async () => {
  // Skip if cleanup is already in progress
  if (cleanupInProgress) {
    console.log('Cleanup already in progress, waiting...');
    return;
  }

  cleanupInProgress = true;
  console.log('Received SIGINT signal');

  // Set a maximum time for cleanup (5 seconds) to prevent hanging
  const MAX_CLEANUP_TIME = 5000; // 5 seconds
  let cleanupTimedOut = false;

  const cleanupTimeout = setTimeout(() => {
    console.log('Cleanup taking too long, forcing exit...');
    cleanupTimedOut = true;
    process.exit(0);
  }, MAX_CLEANUP_TIME);

  try {
    await cleanup();
    // Cleanup completed normally, clear the timeout
    clearTimeout(cleanupTimeout);
  } catch (error) {
    console.error('Error during cleanup:', error);
    // Make sure we still clear the timeout on error
    clearTimeout(cleanupTimeout);
  }

  // If we haven't timed out, exit with a short delay for final messages
  if (!cleanupTimedOut) {
    setTimeout(() => process.exit(0), 100);
  }
});

process.on('SIGTERM', async () => {
  // Skip if cleanup is already in progress
  if (cleanupInProgress) {
    console.log('Cleanup already in progress, waiting...');
    return;
  }

  cleanupInProgress = true;
  console.log('Received SIGTERM signal');

  // Set a maximum time for cleanup (5 seconds) to prevent hanging
  const MAX_CLEANUP_TIME = 5000; // 5 seconds
  let cleanupTimedOut = false;

  const cleanupTimeout = setTimeout(() => {
    console.log('Cleanup taking too long, forcing exit...');
    cleanupTimedOut = true;
    process.exit(0);
  }, MAX_CLEANUP_TIME);

  try {
    await cleanup();
    // Cleanup completed normally, clear the timeout
    clearTimeout(cleanupTimeout);
  } catch (error) {
    console.error('Error during cleanup:', error);
    // Make sure we still clear the timeout on error
    clearTimeout(cleanupTimeout);
  }

  // If we haven't timed out, exit with a short delay for final messages
  if (!cleanupTimedOut) {
    setTimeout(() => process.exit(0), 100);
  }
});

// Setup Express routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/html/index.html'));
});

/**
 * Finds an available port for the server to listen on
 *
 * @param startPort - The port to start checking from
 * @returns Promise resolving to an available port number
 */
async function findAvailablePort(startPort: number): Promise<number> {
  const net = require('net');
  let port = startPort;
  const maxPort = startPort + 100; // Try up to 100 ports
  const maxAttempts = 100; // Safety limit
  let attempts = 0;

  while (port < maxPort && attempts < maxAttempts) {
    attempts++;
    try {
      // Try to bind to the port
      const available = await new Promise<boolean>((resolve) => {
        const server = net.createServer();

        server.once('error', (err: unknown) => {
          server.close();
          if (err && typeof err === 'object' && 'code' in err && err.code === 'EADDRINUSE') {
            console.log(`Port ${port} in use, trying next port`);
            resolve(false);
          } else {
            console.error(`Error checking port ${port}:`, err);
            resolve(false);
          }
        });

        server.once('listening', () => {
          server.close();
          resolve(true);
        });

        server.listen(port);
      });

      if (available && port !== startPort) {
        console.log(`Found available port: ${port}`);
        return port;
      }

      // Try next port
      port++;

    } catch (error: unknown) {
      console.error(`Unexpected error checking port ${port}:`, error);
      port++;
    }
  }

  // Fallback to a random port if no port found in the range
  const randomPort = 8000 + Math.floor(Math.random() * 1000);
  console.log(`Could not find available port in range ${startPort}-${maxPort}, using random port ${randomPort}`);
  return randomPort;
}

/**
 * Opens the user's default browser to a URL
 *
 * @param url - The URL to open in the browser
 */
function openBrowser(url: string): void {
  const platform = process.platform;

  let command: string;
  // Select command based on operating system
  switch (platform) {
    case 'darwin': // macOS
      command = `open ${url}`;
      break;
    case 'win32': // Windows
      command = `start ${url}`;
      break;
    default: // Linux and others
      command = `xdg-open ${url}`;
      break;
  }

  // Execute the command to open the browser
  exec(command, (err: Error | null) => {
    if (err) {
      console.error('Failed to open browser:', err);
      console.log(`Please manually open your browser to: ${url}`);
    }
  });
}

/**
 * Start the server
 */
async function startServer(): Promise<void> {
  // Load stored environment variables
  loadAllEnvVars();
  updateServerVersion();

  // Get port from environment or use 3001
  const isNodemonRestart = process.env.HAS_RESTARTED === "true";
  if (!isNodemonRestart) {
    saveEnvVar('HAS_RESTARTED', "true");
  }
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  // MAGI_NODEMON_RESTART will be set by nodemon when restarting
  console.log(`Starting MAGI System Server (port: ${PORT}, restart: ${isNodemonRestart})`);

  // If this is a restart, retrieve running MAGI containers
  if (isNodemonRestart) {
    try {
      await retrieveExistingContainers();
    } catch (error) {
      console.error('Failed to retrieve existing containers:', error);
    }
  }

  try {
    // Only find an available port on first start, otherwise use the configured port
    const port = isNodemonRestart ? PORT : await findAvailablePort(PORT);
    if (port !== PORT) {
      saveEnvVar('PORT', port.toString());
    }

    // Handle server errors
    server.on('error', (err: unknown) => {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is in use despite port check. Trying a random port...`);
        const randomPort = 8000 + Math.floor(Math.random() * 1000);
        server.listen(randomPort);
      } else {
        console.error('Server error:', err);
        process.exit(1);
      }
    });

    // Start the server
    server.listen(port, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        console.error('Invalid server address');
        return;
      }

      const listeningPort = address.port;
      const url = `http://localhost:${listeningPort}`;

      console.log(`
┌────────────────────────────────────────────────┐
│                                                │
│  MAGI System Server is Running!                │
│                                                │
│  • Local:    ${url.padEnd(33)} │
│                                                │
└────────────────────────────────────────────────┘
      `);

      // Only open browser on first start, not on nodemon restarts
      if (!isNodemonRestart) {
        openBrowser(url);
      }
    });
  } catch (error: unknown) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
