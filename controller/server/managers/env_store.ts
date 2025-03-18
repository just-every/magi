/**
 * Environment Variable Storage Manager
 *
 * Manages environment variables that need to persist across server restarts.
 */
import { saveData, loadData, loadAllData } from '../utils/storage';

/**
 * Saves an environment variable to persistent storage
 *
 * @param key - The environment variable name
 * @param value - The value to store
 */
export function saveEnvVar(key: string, value: string): void {
  saveData(key, value);
}

/**
 * Loads an environment variable from persistent storage
 *
 * @param key - The environment variable name to load
 * @returns The stored value, or undefined if not found
 */
export function loadEnvVar(key: string): string | undefined {
  return loadData(key);
}

/**
 * Updates the server version to trigger client reload
 * after a server restart
 */
export function updateServerVersion(): void {
  const newVersion = Date.now().toString();
  saveEnvVar('SERVER_VERSION', newVersion);
}

/**
 * Gets the current server version
 * 
 * @returns Current server version or a new version if not set
 */
export function getServerVersion(): string {
  const version = loadEnvVar('SERVER_VERSION');
  if (!version) {
    const newVersion = Date.now().toString();
    saveEnvVar('SERVER_VERSION', newVersion);
    return newVersion;
  }
  return version;
}

/**
 * Loads all stored environment variables into process.env
 */
export function loadAllEnvVars(): void {
  const data = loadAllData();
  
  for (const [key, value] of Object.entries(data)) {
    process.env[key] = value;
  }
}