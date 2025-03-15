import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

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
} from '../utils/docker_interface';

// Load environment variables from .env file
dotenv.config();

import { promisify } from 'util';
import { exec } from 'child_process';

// Define a safe exec promise that doesn't throw on non-zero exit codes
const execPromiseFallback = async (command: string) => {
  try {
    return await promisify(exec)(command);
  } catch (error: any) {
    return { stdout: '', stderr: error.message || 'Unknown error' };
  }
};

// Define interfaces for type safety
interface ProcessData {
  id: string; // Use string to match the process ID format in ProcessManager
  monitorProcess?: ChildProcess; // Process for monitoring the Docker container
  command: string;
  status: 'running' | 'completed' | 'failed' | 'terminated';
  logs: string[];
  containerId?: string; // Docker container ID
  checkInterval?: NodeJS.Timeout; // Interval for checking container status
}

interface Processes {
  [key: string]: ProcessData;
}

// Process creation event
interface ProcessCreateEvent {
  id: string;
  command: string;
  status: string;
}

// Process logs event
interface ProcessLogsEvent {
  id: string;
  logs: string;
}

// Process update event
interface ProcessUpdateEvent {
  id: string;
  status: string;
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Process management
const processes: Processes = {};

// Docker functions are now imported from the Docker interface module

// Function to execute a command in a Docker container
async function spawnDockerProcess(processId: string, command: string): Promise<void> {
  try {
    // Check if Docker is available
    const dockerAvailable = await isDockerAvailable();
    if (!dockerAvailable) {
      updateProcessWithError(processId, 'Docker is not available. Cannot run command.');
      return;
    }

    // Check if Docker image exists, build if it doesn't
    const imageExists = await checkDockerImageExists();
    if (!imageExists) {
      updateProcess(processId, 'Docker image not found. Building image...');
      const buildSuccess = await buildDockerImage({ verbose: false });
      if (!buildSuccess) {
        updateProcessWithError(processId, 'Failed to build Docker image. Cannot run command.');
        return;
      }
      updateProcess(processId, 'Docker image built successfully.');
    }

    // Get OpenAI API key from .env file if it exists
    const openaiApiKey = process.env.OPENAI_API_KEY || '';
    
    // Get project root directory
    const projectRoot = path.resolve(__dirname, '..');

    // Run Docker container
    const containerId = await runDockerContainer({
      processId,
      command,
      openaiApiKey,
      projectRoot
    });

    if (!containerId) {
      updateProcessWithError(processId, 'Failed to start Docker container.');
      return;
    }

    // Store container ID
    if (processes[processId]) {
      processes[processId].containerId = containerId;
    }

    // Start monitoring container logs
    startLogMonitoring(processId);

  } catch (error) {
    console.error('Error spawning Docker process:', error);
    updateProcessWithError(
      processId,
      `Error spawning Docker process: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Function to monitor container logs
function startLogMonitoring(processId: string): void {
  const containerName = `magi-${processId}`;

  // Start monitoring logs
  const stopLogging = monitorContainerLogs(processId, (logData) => {
    if (processes[processId]) {
      // Store logs
      processes[processId].logs.push(logData);

      // Emit logs to clients
      io.emit('process:logs', {
        id: processId,
        logs: logData
      } as ProcessLogsEvent);
    }
  });

  // Set up a checker for container status
  const checkInterval = setInterval(async () => {
    try {
      // Check container status
      const { stdout } = await execPromiseFallback(`docker inspect --format={{.State.Status}} ${containerName}`);
      const status = stdout.trim();

      if (status === 'exited') {
        // Get exit code
        const { stdout: exitCodeStdout } = await execPromiseFallback(
          `docker inspect --format={{.State.ExitCode}} ${containerName}`
        );
        const exitCode = parseInt(exitCodeStdout.trim(), 10);

        if (processes[processId]) {
          processes[processId].status = exitCode === 0 ? 'completed' : 'failed';
          io.emit('process:update', {
            id: processId,
            status: processes[processId].status
          } as ProcessUpdateEvent);
        }

        // Stop checking and monitoring
        clearInterval(checkInterval);
        stopLogging();
      }
    } catch (error) {
      // Container probably doesn't exist anymore
      if (processes[processId]) {
        processes[processId].status = 'completed';
        io.emit('process:update', {
          id: processId,
          status: 'completed'
        } as ProcessUpdateEvent);
      }

      // Stop checking and monitoring
      clearInterval(checkInterval);
      stopLogging();
    }
  }, 5000); // Check every 5 seconds

  // Store reference to interval for cleanup
  if (processes[processId]) {
    processes[processId].checkInterval = checkInterval;
  }
}

// Helper function to update process with error
function updateProcessWithError(processId: string, errorMessage: string): void {
  if (processes[processId]) {
    processes[processId].status = 'failed';
    processes[processId].logs.push(`[ERROR] ${errorMessage}`);

    io.emit('process:update', {
      id: processId,
      status: 'failed'
    } as ProcessUpdateEvent);

    io.emit('process:logs', {
      id: processId,
      logs: `[ERROR] ${errorMessage}`
    } as ProcessLogsEvent);
  }
}

// Helper function to update process logs
function updateProcess(processId: string, message: string): void {
  if (processes[processId]) {
    processes[processId].logs.push(message);

    io.emit('process:logs', {
      id: processId,
      logs: message
    } as ProcessLogsEvent);
  }
}

// Function to stop and remove a Docker container
async function stopContainer(processId: string): Promise<boolean> {
  if (!processes[processId] || !processes[processId].containerId) {
    return false;
  }

  try {
    // Stop the log monitoring process
    if (processes[processId].monitorProcess) {
      processes[processId].monitorProcess.kill();
    }

    // Stop the status check interval
    if (processes[processId].checkInterval) {
      clearInterval(processes[processId].checkInterval);
    }

    // Stop the container
    const success = await stopDockerContainer(processId);

    if (success) {
      processes[processId].status = 'terminated';
      io.emit('process:update', {
        id: processId,
        status: 'terminated'
      } as ProcessUpdateEvent);
    }

    return success;
  } catch (error) {
    console.error(`Error stopping container for process ${processId}:`, error);
    return false;
  }
}

// Socket connection
io.on('connection', (socket: Socket) => {
  console.log('Client connected');

  // Clean up terminated processes that shouldn't be showing
  Object.entries(processes).forEach(([id, process]) => {
    if (process.status === 'terminated') {
      delete processes[id];
    }
  });
  
  // Send current processes to the new client (excluding terminated)
  Object.entries(processes).forEach(([id, process]) => {
    socket.emit('process:create', {
      id,
      command: process.command,
      status: process.status
    });

    // Send existing logs
    if (process.logs.length > 0) {
      socket.emit('process:logs', {
        id,
        logs: process.logs.join('\n')
      });
    }
  });

  // Handle new command
  socket.on('command:run', (command: string) => {
    console.log(`Executing command: ${command}`);

    // Generate process ID using the format from the Python code
    const processId = `AI-${Math.random().toString(36).substring(2, 10)}`;

    // Create process object
    processes[processId] = {
      id: processId,
      command: command,
      status: 'running',
      logs: []
    };

    // Notify all clients about the new process
    io.emit('process:create', {
      id: processId,
      command: command,
      status: 'running'
    } as ProcessCreateEvent);

    // Spawn the Docker process
    spawnDockerProcess(processId, command);
  });

  // Handle process termination request
  socket.on('process:terminate', (processId: string) => {
    stopContainer(processId);
  });
  
  // Handle commands sent to a specific process
  socket.on('process:command', async (data: { processId: string, command: string }) => {
    const { processId, command } = data;
    
    // Check if the process exists and is still running
    if (processes[processId] && processes[processId].status === 'running') {
      // Log that we received a process-specific command
      console.log(`Sending command to process ${processId}: ${command}`);
      
      // Send command to the container
      const success = await sendCommandToContainer(processId, command);
      
      if (!success) {
        console.error(`Error sending command to container for process ${processId}`);
        updateProcess(processId, `[ERROR] Failed to send command: Unable to communicate with container`);
      } else {
        // Command was sent successfully (actual response will come through logs)
        console.log(`Command sent to ${processId} successfully`);
      }
    } else {
      // Process doesn't exist or is not running
      console.log(`Cannot send command to process ${processId}: not running`);
      socket.emit('process:logs', {
        id: processId,
        logs: `[ERROR] Cannot send command: process is not running or has terminated`
      } as ProcessLogsEvent);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Cleanup on server exit
async function cleanup() {
  console.log('Cleaning up Docker containers...');

  // Stop all running containers
  for (const [processId, processData] of Object.entries(processes)) {
    if (processData.status === 'running' && processData.containerId) {
      await stopContainer(processId);
    }
    
    // Clear any intervals
    if (processData.checkInterval) {
      clearInterval(processData.checkInterval);
    }
  }

  // Additional cleanup for any containers that might have been missed
  await cleanupAllContainers();
}

process.on('SIGINT', async () => {
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await cleanup();
  process.exit(0);
});

// Home route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// Function to find an available port
async function findAvailablePort(startPort: number): Promise<number> {
  const net = require('net');
  let port = startPort;
  const maxPort = startPort + 100; // Try up to 100 ports to find an available one

  while (port < maxPort) {
    try {
      // Try to create a server on the port
      const server = net.createServer();
      const available = await new Promise<boolean>((resolve) => {
        server.once('error', (err: any) => {
          server.close();
          if (err.code === 'EADDRINUSE') {
            // Port is in use, try the next one
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
      
      if (available) {
        // If we get here, the port is available
        return port;
      }
      
      // Try the next port
      port++;
    } catch (error) {
      console.error(`Unexpected error checking port ${port}:`, error);
      port++;
    }
  }
  
  // If we can't find an available port, return a random port between 8000-9000
  // This is a fallback and we hope it will work
  return 8000 + Math.floor(Math.random() * 1000);
}

// Function to open the browser
function openBrowser(url: string): void {
  const { exec } = require('child_process');
  const platform = process.platform;
  
  let command;
  
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
  
  exec(command, (err: Error) => {
    if (err) {
      console.error('Failed to open browser:', err);
    }
  });
}

// Start server
const DEFAULT_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Find an available port and start the server
findAvailablePort(DEFAULT_PORT).then(PORT => {
  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is still in use. Trying a different port...`);
      // Try a random port as a fallback
      const randomPort = 8000 + Math.floor(Math.random() * 1000);
      console.log(`Attempting to use random port ${randomPort}`);
      server.listen(randomPort);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });
  
  server.listen(PORT, () => {
    const listeningPort = (server.address() as any).port;
    console.log(`MAGI system server running on port ${listeningPort}`);
    console.log(`Open your browser at: http://localhost:${listeningPort}`);
    
    // Open the browser automatically
    const url = `http://localhost:${listeningPort}`;
    openBrowser(url);
  });
});
