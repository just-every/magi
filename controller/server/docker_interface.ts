/**
 * Docker interface module for interacting with MAGI System containers.
 * Provides utilities for building, running, and managing Docker containers.
 */
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import Docker from 'dockerode';

// Initialize Docker client
const docker = new Docker();
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
 * Validate container name to prevent injection attacks
 * @param name The container name to validate
 * @returns The validated name or throws an error
 */
function validateContainerName(name: string): string {
  if (!name || typeof name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid container name: ${name}`);
  }
  return name;
}

/**
 * Check if Docker is available on the system
 * @returns True if Docker is available, false otherwise
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    const info = await docker.info();
    return !!info;
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
    const images = await docker.listImages({
      filters: { reference: [`magi-system:${tag}`] }
    });
    return images.length > 0;
  } catch (error) {
    console.error(`Error checking if Docker image magi-system:${tag} exists:`, error);
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
    const tag = options.tag || 'latest';
    const dockerfilePath = path.resolve(__dirname, '../../../../magi/docker/Dockerfile');
    const contextPath = path.resolve(__dirname, '../../../../');

    // Verify dockerfile exists
    if (!fs.existsSync(dockerfilePath)) {
      throw new Error(`Dockerfile not found at ${dockerfilePath}`);
    }

    // Build arguments
    const buildArgs = ['build', '-t', `magi-system:${tag}`, '-f', dockerfilePath, contextPath];
    if (options.noCache) {
      buildArgs.push('--no-cache');
    }

    // Spawn the process
    console.log(`Building Docker image with command: docker ${buildArgs.join(' ')}`);
    const buildProcess = spawn('docker', buildArgs, { stdio: options.verbose ? 'inherit' : 'pipe' });

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
    return new Promise<boolean>((resolve) => {
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

    // Input validation
    if (!processId || typeof processId !== 'string') {
      throw new Error('Invalid process ID');
    }
    if (!command || typeof command !== 'string') {
      throw new Error('Invalid command');
    }

    // Generate container name and validate
    const containerName = validateContainerName(`magi-${processId}`);

    // Get project root directory and normalize
    const projectRoot = options.projectRoot
        ? path.resolve(options.projectRoot)
        : path.resolve(__dirname, '../../../../');

    // In dist, we need to go up one more level
    const isBuildDir = projectRoot.endsWith('/dist');
    const actualProjectRoot = isBuildDir ? path.resolve(projectRoot, '..') : projectRoot;

    // Verify the magi directory exists
    const magiPath = path.join(actualProjectRoot, 'magi');
    if (!fs.existsSync(magiPath)) {
      throw new Error(`Magi directory not found at ${magiPath}`);
    }

    // Going back to the original approach with improved escaping and validation
    // Escape double quotes in the command
    const escapedCommand = command.replace(/"/g, '\\"');

    // Create the docker run command
    const dockerRunCommand = `docker run -d --rm --name ${containerName} \
      -e PROCESS_ID=${processId} \
      ${openaiApiKey ? `-e OPENAI_API_KEY=${openaiApiKey}` : ''} \
      -v ${magiPath}:/app/magi:rw \
      -v claude_credentials:/claude_shared:rw \
      -v magi_output:/magi_output:rw \
      magi-system:latest \
      python magi/magi.py -p "${escapedCommand}"`;

    // Execute the command and get the container ID
    const result = await execPromise(dockerRunCommand);
    const containerId = result.stdout.trim();

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
    const containerName = validateContainerName(`magi-${processId}`);

    // Stop the container using docker stop command
    await execPromise(`docker stop ${containerName}`);
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
    if (!command || typeof command !== 'string') {
      throw new Error('Invalid command');
    }

    const containerName = validateContainerName(`magi-${processId}`);

    // Escape single quotes in the command
    const escapedCommand = command.replace(/'/g, "'\\''");

    // Execute command in the container
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
  try {
    const containerName = validateContainerName(`magi-${processId}`);

    // Start the log process (using spawn as it's easier to stream logs this way)
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
  } catch (error) {
    console.error(`Error monitoring logs for container ${processId}:`, error);
    // Return empty function in case of error
    return () => {};
  }
}

/**
 * Cleanup all MAGI System Docker containers
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function cleanupAllContainers(): Promise<boolean> {
  try {
    // Use the original command which already works well
    await execPromise("docker ps -aq -f 'name=magi-' | xargs docker stop 2>/dev/null || true");
    await execPromise("docker rm -f $(docker ps -q -f 'ancestor=magi-system:latest') 2>/dev/null || true");

    return true;
  } catch (error) {
    // Ignore errors from this command, as it might fail if no containers exist
    return true;
  }
}

/**
 * Get a list of all running MAGI containers
 * @returns Promise resolving to an array of objects containing container info
 */
export async function getRunningMagiContainers(): Promise<{id: string, containerId: string, command: string}[]> {
  try {
    // Get list of running containers with name starting with 'magi-'
    const { stdout } = await execPromise("docker ps -a --filter 'name=magi-' --filter 'status=running' --format '{{.ID}}|{{.Names}}|{{.Command}}'");
    
    if (!stdout.trim()) {
      return [];
    }
    
    // Parse container info
    return stdout.trim().split('\n').map(line => {
      const [containerId, name, command] = line.split('|');
      
      // Extract process ID from name (remove 'magi-' prefix)
      const id = name.replace('magi-', '');
      
      // Extract original command (it's in the format 'python -m... "command"')
      const originalCommandMatch = command.match(/"(.+)"$/);
      const originalCommand = originalCommandMatch ? originalCommandMatch[1] : '';
      
      return {
        id,
        containerId,
        command: originalCommand
      };
    });
  } catch (error) {
    console.error('Error getting running MAGI containers:', error);
    return [];
  }
}
