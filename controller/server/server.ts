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
import fs from 'fs';
import dotenv from 'dotenv';
import { promisify } from 'util';
import WebSocket from 'ws';
import { exec } from 'child_process';

// Import Docker interface utilities
import {
  isDockerAvailable,
  checkDockerImageExists,
  buildDockerImage,
  runDockerContainer,
  stopDockerContainer,
  sendCommandToContainer,
  monitorContainerLogs,
  cleanupAllContainers
} from '../../setup/docker_interface';

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

// Set up more reliable file monitoring for live reload
class LiveReloadManager {
  private lastReloadTime = 0;
  private readonly cooldown = 300; // ms
  private readonly watchPaths: string[];
  private watchHandlers: Array<{ close: () => void }> = [];
  private readonly clients: Set<WebSocket>;

  constructor(clients: Set<WebSocket>) {
    this.clients = clients;
    
    // Paths to watch for changes
    this.watchPaths = [
      // Source CSS files in controller
      path.join(__dirname, '../../controller/client/css'),
      // Source HTML files in controller
      path.join(__dirname, '../../controller/client/html'),
      // Compiled CSS files in dist
      path.join(__dirname, '../client/css'),
      // Compiled HTML files in dist
      path.join(__dirname, '../client/html'),
      // Compiled JS files in dist
      path.join(__dirname, '../client/client.js'),
    ];
    
    this.setupWatchers();
    console.log('Live reload watchers configured for CSS, HTML, and JS files');
  }

  private setupWatchers(): void {
    // Clean up any existing watchers
    this.closeWatchers();

    // Set up new watchers
    for (const watchPath of this.watchPaths) {
      try {
        // Check if the path exists before watching
        if (fs.existsSync(watchPath)) {
          const watcher = fs.watch(
            watchPath, 
            { persistent: true, recursive: true },
            this.handleFileChange.bind(this)
          );
          
          this.watchHandlers.push(watcher);
          console.log(`✅ Watching for changes: ${watchPath}`);
        } else {
          console.warn(`⚠️ Watch path does not exist: ${watchPath}`);
        }
      } catch (error) {
        console.error(`❌ Failed to watch path ${watchPath}:`, error);
      }
    }
  }

  private closeWatchers(): void {
    for (const watcher of this.watchHandlers) {
      try {
        watcher.close();
      } catch (error) {
        console.error('Error closing watcher:', error);
      }
    }
    this.watchHandlers = [];
  }

  private handleFileChange(eventType: string, filename: string | null): void {
    if (!filename) return;
    
    const now = Date.now();
    // Debounce rapid changes
    if (now - this.lastReloadTime < this.cooldown) {
      console.log(`🔄 Skipping rapid change: ${filename} (debounced)`);
      return;
    }
    
    this.lastReloadTime = now;
    
    // Determine file type for targeted reloads
    const fileExt = path.extname(filename).toLowerCase();
    const isCSS = fileExt === '.css';
    const isHTML = fileExt === '.html';
    const isJS = fileExt === '.js';
    
    console.log(`📝 File changed: ${filename} (type: ${isCSS ? 'CSS' : isHTML ? 'HTML' : isJS ? 'JS' : 'other'}, event: ${eventType})`);
    
    // Count active clients
    let activeClients = 0;
    
    // Send appropriate reload command to clients
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        // For CSS, we can just reload the stylesheet without page refresh
        // For JS and HTML, we need a full page reload
        const reloadType = isCSS ? 'css-reload' : 'reload';
        client.send(reloadType);
        activeClients++;
        
        console.log(`🚀 Sent ${reloadType} to client`);
      }
    });
    
    console.log(`📊 Notified ${activeClients} clients about changes`);
  }

  public restart(): void {
    this.closeWatchers();
    this.setupWatchers();
    console.log('Live reload watchers restarted');
  }
}

// Initialize the live reload manager
const liveReloadManager = new LiveReloadManager(liveReloadClients);

// Expose manager for restart if needed
(global as any).restartLiveReload = () => liveReloadManager.restart();

// Process management
const processes: Processes = {};

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
    updateProcess(processId, 'Running MAGI in secure container.');
    startLogMonitoring(processId);

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
 * Monitors logs and status for a running Docker container
 *
 * This function:
 * 1. Sets up log streaming from the container to the client
 * 2. Periodically checks container status
 * 3. Updates process status based on container exit code
 * 4. Cleans up resources when the container exits
 *
 * @param processId - The process ID to monitor
 */
function startLogMonitoring(processId: string): void {
  const containerName = `magi-${processId}`;
  console.log(`Starting log monitoring for container ${containerName}`);

  // Start streaming logs from the container
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
        stopLogging();
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
      stopLogging();
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
  // Validate that the process exists and has a container
  if (!processes[processId]) {
    console.warn(`Attempted to stop non-existent process ${processId}`);
    return false;
  }

  if (!processes[processId].containerId) {
    console.warn(`Process ${processId} has no associated container ID`);
    return false;
  }

  try {
    console.log(`Stopping container for process ${processId}`);

    // Step 1: Clean up monitoring resources
    // Kill the log monitoring process if it exists
    if (processes[processId].monitorProcess) {
      processes[processId].monitorProcess.kill();
      processes[processId].monitorProcess = undefined;
    }

    // Clear the status check interval if it exists
    if (processes[processId].checkInterval) {
      clearInterval(processes[processId].checkInterval);
      processes[processId].checkInterval = undefined;
    }

    // Step 2: Stop the Docker container
    updateProcess(processId, 'Terminating process...');
    const success = await stopDockerContainer(processId);

    // Step 3: Update process status and notify clients
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
    updateProcessWithError(processId, `Failed to terminate: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Socket.io connection handling
 * Manages WebSocket communication with clients
 */
io.on('connection', (socket: Socket) => {
  const clientId = socket.id.substring(0, 8);
  console.log(`Client connected: ${clientId}`);

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
      status: process.status
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

    // Notify all clients about the new process
    io.emit('process:create', {
      id: processId,
      command,
      status: 'running'
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

  // Step 1: Stop all running processes that we know about
  const runningProcesses = Object.entries(processes)
    .filter(([, data]) => data.status === 'running' && data.containerId)
    .map(([id]) => id);

  if (runningProcesses.length > 0) {
    console.log(`Stopping ${runningProcesses.length} running processes: ${runningProcesses.join(', ')}`);

    // Stop each container and wait for all to complete
    await Promise.all(
      runningProcesses.map(async (processId) => {
        try {
          await stopContainer(processId);
        } catch (error: unknown) {
          console.error(`Error stopping container for process ${processId}:`, error);
        }
      })
    );
  }

  // Step 2: Clean up any intervals
  for (const [/* processId */, processData] of Object.entries(processes)) {
    if (processData.checkInterval) {
      clearInterval(processData.checkInterval);
    }
  }

  // Step 3: Additional cleanup for any containers that might have been missed
  await cleanupAllContainers();
}

// Register cleanup handlers for various termination signals
process.on('SIGINT', async () => {
  console.log('Received SIGINT signal');
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM signal');
  await cleanup();
  process.exit(0);
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
  // Get default port from environment or use 3001
  const DEFAULT_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  console.log(`Starting MAGI System Server (default port: ${DEFAULT_PORT})`);

  try {
    // Find an available port to use
    const port = await findAvailablePort(DEFAULT_PORT);

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

      // Open browser for user convenience
      openBrowser(url);
    });
  } catch (error: unknown) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
