/**
 * Environment Variable Storage
 *
 * Simple file-based storage for environment variables that need to persist
 * across nodemon restarts. Variables are stored in the .server directory,
 * which is cleared on each npm run dev execution.
 * 
 * Also provides functionality for storing and retrieving used process colors.
 */

import fs from 'fs';
import path from 'path';

// Directory to store environment variables
const STORAGE_DIR = path.join(process.cwd(), 'dist/.server');

/**
 * Initializes the storage directory
 */
export function initStorage(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

/**
 * Saves an environment variable to persistent storage
 *
 * @param key - The environment variable name
 * @param value - The value to store
 */
export function saveEnvVar(key: string, value: string): void {
  initStorage();
  const filePath = path.join(STORAGE_DIR, key);
  fs.writeFileSync(filePath, value, 'utf8');
}

/**
 * Loads an environment variable from persistent storage
 *
 * @param key - The environment variable name to load
 * @returns The stored value, or undefined if not found
 */
export function loadEnvVar(key: string): string | undefined {
  initStorage();
  const filePath = path.join(STORAGE_DIR, key);

  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8');
  }

  return undefined;
}

/**
 * Updates the server version to trigger client reload
 * after a server restart
 */
export function updateServerVersion(): void {
  const newVersion = Date.now().toString();
  saveEnvVar('SERVER_VERSION', newVersion);
  return;
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
  initStorage();

  if (!fs.existsSync(STORAGE_DIR)) {
    return;
  }

  const files = fs.readdirSync(STORAGE_DIR);

  for (const file of files) {
    const filePath = path.join(STORAGE_DIR, file);
    const value = fs.readFileSync(filePath, 'utf8');
    process.env[file] = value;
  }
}

/**
 * Save the used process colors to persistent storage
 * 
 * @param colors - Array of [r,g,b] color values
 */
export function saveUsedColors(colors: Array<[number, number, number]>): void {
  saveEnvVar('USED_COLORS', JSON.stringify(colors));
}

/**
 * Load previously used process colors from storage
 * 
 * @returns Array of [r,g,b] color values, or empty array if none found
 */
export function loadUsedColors(): Array<[number, number, number]> {
  const colorsJson = loadEnvVar('USED_COLORS');
  if (!colorsJson) {
    return [];
  }
  
  try {
    return JSON.parse(colorsJson) as Array<[number, number, number]>;
  } catch (error) {
    console.error('Error parsing stored colors:', error);
    return [];
  }
}
