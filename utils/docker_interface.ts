/**
 * Docker interface module for interacting with MAGI System containers.
 * Provides utilities for building, running, and managing Docker containers.
 */
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execPromise = promisify(exec);

export interface DockerBuildOptions {
  tag?: string;
  noCache?: boolean;
  verbose?: boolean;
}

export interface DockerRunOptions {
  processId: string;
  command: string;
  openaiApiKey?: string;
  projectRoot?: string;
}

/**
 * Check if Docker is available on the system
 * @returns True if Docker is available, false otherwise
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execPromise('docker --version');
    return true;
  } catch (error) {
    console.error('Docker is not available:', error);
    return false;
  }
}

/**
 * Check if the MAGI System Docker image exists
 * @param tag Optional tag to check (default: latest)
 * @returns True if the image exists, false otherwise
 */
export async function checkDockerImageExists(tag: string = 'latest'): Promise<boolean> {
  try {
    const { stdout, stderr } = await execPromise(`docker image inspect magi-system:${tag}`);
    return true;
  } catch (error) {
    console.error(`Docker image magi-system:${tag} does not exist:`, error);
    return false;
  }
}

/**
 * Build the MAGI System Docker image
 * @param options Build options
 * @returns Promise resolving to true if build was successful, false otherwise
 */
export async function buildDockerImage(options: DockerBuildOptions = {}): Promise<boolean> {
  try {
    const args: string[] = ['build', '-t', 'magi-system:latest', "-f", path.resolve(__dirname, '../magi/docker/Dockerfile'), path.resolve(__dirname, '../')];

    // Spawn the process
    console.log(`Building Docker image with command: docker ${args.join(' ')}`);
    const buildProcess = spawn('docker', args, { stdio: options.verbose ? 'inherit' : 'pipe' });

    // If not verbose, collect and log output
    if (!options.verbose) {
      buildProcess.stdout?.on('data', (data) => {
        console.log(`Docker build output: ${data.toString()}`);
      });

      buildProcess.stderr?.on('data', (data) => {
        console.error(`Docker build error: ${data.toString()}`);
      });
    }

    // Wait for process to complete
    return new Promise((resolve) => {
      buildProcess.on('close', (code) => {
        if (code === 0) {
          console.log('Docker image built successfully');
          resolve(true);
        } else {
          console.error(`Docker build failed with code ${code}`);
          resolve(false);
        }
      });
    });
  } catch (error) {
    console.error('Error building Docker image:', error);
    return false;
  }
}

/**
 * Run a MAGI System Docker container
 * @param options Run options
 * @returns Promise resolving to container ID if successful, empty string if failed
 */
export async function runDockerContainer(options: DockerRunOptions): Promise<string> {
  try {
    const { processId, command, openaiApiKey } = options;
    const containerName = `magi-${processId}`;

    // Get project root directory
    const projectRoot = options.projectRoot || path.resolve(__dirname, '..');

    // Create Docker container
    const result = await execPromise(
      `docker run -d --rm --name ${containerName} -e PROCESS_ID=${processId} -e OPENAI_API_KEY=${openaiApiKey || ''} -v ${projectRoot}/magi:/app/magi:rw -v claude_credentials:/claude_shared:rw -v magi_output:/magi_output:rw magi-system:latest python magi/magi.py -p "${command.replace(/"/g, "\\\"")}"`
    );

    const containerId = result.stdout.trim();
    console.log(`Container started with ID: ${containerId}`);

    return containerId;
  } catch (error) {
    console.error('Error running Docker container:', error);
    return '';
  }
}

/**
 * Stop a MAGI System Docker container
 * @param processId The process ID of the container
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function stopDockerContainer(processId: string): Promise<boolean> {
  try {
    const containerName = `magi-${processId}`;

    // Stop the container
    const result = await execPromise(`docker stop ${containerName}`);
    console.log(`Container ${containerName} stopped`);

    return true;
  } catch (error) {
    console.error(`Error stopping container for process ${processId}:`, error);
    return false;
  }
}

/**
 * Send a command to a running MAGI System Docker container
 * @param processId The process ID of the container
 * @param command The command to send
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function sendCommandToContainer(processId: string, command: string): Promise<boolean> {
  try {
    const containerName = `magi-${processId}`;

    // Escape single quotes in the command
    const escapedCommand = command.replace(/'/g, "'\\''");

    // Send command to the container
    await execPromise(
      `docker exec ${containerName} python -c "import os; open('/tmp/command.fifo', 'w').write('${escapedCommand}\\n');"`
    );

    console.log(`Command sent to ${processId} successfully`);
    return true;
  } catch (error) {
    console.error(`Error sending command to container: ${error}`);
    return false;
  }
}

/**
 * Start monitoring logs from a MAGI System Docker container
 * @param processId The process ID of the container
 * @param callback Function to call with each log chunk
 * @returns Function to stop monitoring
 */
export function monitorContainerLogs(
  processId: string,
  callback: (log: string) => void
): () => void {
  const containerName = `magi-${processId}`;

  // Start the log process
  const logProcess = spawn('docker', ['logs', '-f', containerName]);

  // Handle stdout
  logProcess.stdout.on('data', (data) => {
    callback(data.toString());
  });

  // Handle stderr
  logProcess.stderr.on('data', (data) => {
    callback(`[ERROR] ${data.toString()}`);
  });

  // Return function to stop monitoring
  return () => {
    logProcess.kill();
  };
}

/**
 * Cleanup all MAGI System Docker containers
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function cleanupAllContainers(): Promise<boolean> {
  try {
    // Stop all magi containers
    await execPromise("docker ps -aq -f 'name=magi-' | xargs docker stop 2>/dev/null || true");

    // Additional cleanup for any containers that might have been missed
    await execPromise("docker rm -f $(docker ps -q -f 'ancestor=magi-system:latest') 2>/dev/null || true");

    return true;
  } catch (error) {
    // Ignore errors from this command, as it might fail if no containers exist
    return true;
  }
}
