/**
 * Docker Commands Module
 * 
 * Low-level Docker command execution utilities
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import Docker from 'dockerode';

// Initialize Docker client
export const docker = new Docker();
export const execPromise = promisify(exec);

/**
 * Define a safe exec promise that doesn't throw on non-zero exit codes
 * This is useful for Docker commands where a non-zero exit code might be expected
 *
 * @param command - The shell command to execute
 * @returns Object containing stdout and stderr
 */
export async function execPromiseFallback(command: string): Promise<{stdout: string, stderr: string}> {
  try {
    return await execPromise(command);
  } catch (error: unknown) {
    return {
      stdout: '',
      stderr: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Validate container name to prevent injection attacks
 * @param name The container name to validate
 * @returns The validated name or throws an error
 */
export function validateContainerName(name: string): string {
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