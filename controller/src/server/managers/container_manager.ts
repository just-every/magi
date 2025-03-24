/**
 * Container Manager Module
 *
 * Higher-level container management functionality for MAGI System.
 */
import {spawn} from 'child_process';
import path from 'path';
import fs from 'fs';
import {
	validateContainerName,
	execPromise
} from '../utils/docker_commands';

export interface DockerBuildOptions {
	tag?: string;
	noCache?: boolean;
	verbose?: boolean;
}

export interface DockerRunOptions {
	processId: string;
	command: string;
}

/**
 * Build the MAGI System Docker image
 * @param options Build options
 * @returns Promise resolving to true if build was successful, false otherwise
 */
export async function buildDockerImage(options: DockerBuildOptions = {}): Promise<boolean> {
	try {
		const tag = options.tag || 'latest';
		const dockerfilePath = path.resolve(__dirname, '../../../../../magi/docker/Dockerfile');
		const contextPath = path.resolve(__dirname, '../../../../../');

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
		const buildProcess = spawn('docker', buildArgs, {stdio: options.verbose ? 'inherit' : 'pipe'});

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
		const {processId, command} = options;

		// Input validation
		if (!processId || typeof processId !== 'string') {
			throw new Error('Invalid process ID');
		}
		if (!command || typeof command !== 'string') {
			throw new Error('Invalid command');
		}

		const projectRoot = path.resolve(process.cwd(), '..');

		// Generate container name and validate
		const containerName = validateContainerName(`magi-${processId}`);

		// Use base64 encoding to avoid escaping issues entirely
		const base64Command = Buffer.from(command).toString('base64');

		// Get the current server port
		const serverPort = process.env.PORT || '3010';
		console.error('Start docker with CONTROLLER_PORT:', serverPort);

		// Create the docker run command using base64 encoded command
		const dockerRunCommand = `docker run -d --rm --name ${containerName} \
      -e PROCESS_ID=${processId} \
      -e HOST_HOSTNAME=host.docker.internal \
      -e CONTROLLER_PORT=${serverPort} \
      --env-file ${path.resolve(projectRoot, '.env')} \
      -v ${projectRoot}:/magi-system:r \
      -v claude_credentials:/claude_shared:rw \
      -v magi_output:/magi_output:rw \
      --add-host=host.docker.internal:host-gateway \
      magi-system:latest \
      node /magi-system/magi/dist/magi.js --base64 "${base64Command}"`;

		// Execute the command and get the container ID
		const result = await execPromise(dockerRunCommand);
		return result.stdout.trim();
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

		// First check if the container exists and is running
		try {
			const {stdout} = await execPromise(`docker container inspect -f '{{.State.Running}}' ${containerName}`);
			const isRunning = stdout.trim() === 'true';

			if (!isRunning) {
				console.log(`Container ${containerName} is not running, skipping stop command`);
				return true;
			}

		} catch (inspectError) {
			// Container doesn't exist, which is fine during cleanup
			console.log(`Container ${containerName} doesn't exist, skipping stop command`);
			return true;
		}

		// Stop the container using docker stop command with a timeout (default is 10 seconds)
		// Use a shorter timeout of 2 seconds to speed up the shutdown process
		await execPromise(`docker stop --time=2 ${containerName}`);

		return true;
	} catch (error) {
		console.error(`Error stopping container for process ${processId}:`, error);
		// We return true here during cleanup to allow the process to continue
		// This prevents one failed container stop from breaking the entire cleanup process
		return true;
	}
}

/**
 * Send a command to a running MAGI System Docker container
 * Note: This method is kept for backward compatibility
 * The preferred way to communicate with containers is via the CommunicationManager
 *
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

		// Use base64 encoding to avoid escaping issues entirely
		const base64Command = Buffer.from(command).toString('base64');

		// Use "BASE64:" prefix to indicate this is a base64-encoded command
		// Note: This method is legacy and uses FIFO files.
		// New containers should use WebSockets via the CommunicationManager
		await execPromise(
			`docker exec ${containerName} python -c "import os; open('/tmp/command.fifo', 'w').write('BASE64:${base64Command}\\n');"`
		);

		console.log(`Command sent to ${processId} successfully via legacy FIFO method`);
		return true;
	} catch (error) {
		console.error(`Error sending command to container: ${error}`);
		return false;
	}
}

/**
 * Start monitoring logs from a MAGI System Docker container
 * Note: This is a fallback method for containers that do not use WebSockets
 * The preferred way to get logs is via the CommunicationManager
 *
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
			const logData = data.toString();
			callback(logData);

			// Try to parse JSON from logs for backward compatibility
			try {
				// If the log line is valid JSON matching our message format,
				// we can extract structured data from it
				if (logData.trim().startsWith('{') && logData.includes('"type"')) {
					const jsonData = JSON.parse(logData);

					// If this is a valid message with processId, type, and data
					if (jsonData.processId && jsonData.type && jsonData.data) {
						// No need to do anything here - the logs will be processed by the callback
						// This is just to validate that it's a proper message format
					}
				}
			} catch (jsonError) {
				// Not valid JSON or not our format, that's okay
				// This is just plain log data
			}
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
		return () => {
		};
	}
}

/**
 * Get a list of all running MAGI containers
 * @returns Promise resolving to an array of objects containing container info
 */
export async function getRunningMagiContainers(): Promise<{ id: string, containerId: string, command: string }[]> {
	try {
		// Get list of running containers with name starting with 'magi-'
		const {stdout} = await execPromise("docker ps -a --filter 'name=magi-' --filter 'status=running' --format '{{.ID}}|{{.Names}}|{{.Command}}'");

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
	} catch (err) {
		console.error('Error getting running MAGI containers:', err);
		return [];
	}
}

/**
 * Cleanup all MAGI System Docker containers
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function cleanupAllContainers(): Promise<boolean> {
	try {
		// First get all containers with magi- prefix
		try {
			// First attempt to stop all containers with name starting with magi- with a 2 second timeout
			const stopCommand = "docker ps -aq -f 'name=magi-' | xargs -r docker stop --time=2 2>/dev/null || true";
			await execPromise(stopCommand);

			// Then try to forcefully remove any containers with the magi-system image
			const removeCommand = "docker ps -aq -f 'ancestor=magi-system:latest' | xargs -r docker rm -f 2>/dev/null || true";
			await execPromise(removeCommand);

		} catch (commandError) {
			console.error('Error during container cleanup command:', commandError);
			// Continue despite error
		}

		// As a backup approach, get a list of containers and stop them all in parallel
		try {
			const {stdout} = await execPromise("docker ps -a --filter 'name=magi-' --format '{{.Names}}'");

			if (stdout.trim()) {
				const containerNames = stdout.trim().split('\n');
				console.log(`Found ${containerNames.length} MAGI containers to clean up in parallel`);

				// First stop all containers in parallel
				await Promise.all(
					containerNames.map(async (containerName) => {
						try {
							// Only indicate how many containers we're stopping, not each one individually
							// Using a short 2 second timeout to speed up the process
							await execPromise(`docker stop --time=2 ${containerName} 2>/dev/null || true`);
						} catch (containerError) {
							console.error(`Error stopping container ${containerName}:`, containerError);
						}
					})
				);

				// Then remove all containers in parallel
				await Promise.all(
					containerNames.map(async (containerName) => {
						try {
							// Only indicate overall process, not individual containers
							await execPromise(`docker rm -f ${containerName} 2>/dev/null || true`);
						} catch (containerError) {
							console.error(`Error removing container ${containerName}:`, containerError);
						}
					})
				);
			}
		} catch (listError) {
			console.error('Error listing containers for cleanup:', listError);
		}

		return true;
	} catch (error) {
		console.error('Error in cleanupAllContainers:', error);
		// Still return true to allow the shutdown process to continue
		return true;
	}
}
