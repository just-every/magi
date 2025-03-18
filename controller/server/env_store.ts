/**
 * Environment Variable Storage
 *
 * Simple file-based storage for environment variables that need to persist
 * across nodemon restarts. Variables are stored in the .server directory,
 * which is cleared on each npm run dev execution.
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
