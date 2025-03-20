/**
 * Storage Utility Module
 * 
 * Provides file-based storage functionality for persisting data across restarts.
 */
import fs from 'fs';
import path from 'path';

// Directory to store persistent data
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
 * Saves data to a file in persistent storage
 *
 * @param key - The key to store data under
 * @param value - The string value to store
 */
export function saveData(key: string, value: string): void {
  initStorage();
  const filePath = path.join(STORAGE_DIR, key);
  fs.writeFileSync(filePath, value, 'utf8');
}

/**
 * Loads data from persistent storage
 *
 * @param key - The key of the data to load
 * @returns The stored value, or undefined if not found
 */
export function loadData(key: string): string | undefined {
  initStorage();
  const filePath = path.join(STORAGE_DIR, key);

  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8');
  }

  return undefined;
}

/**
 * Loads all stored files in the storage directory
 * 
 * @returns An object mapping filenames to their contents
 */
export function loadAllData(): Record<string, string> {
  initStorage();
  
  if (!fs.existsSync(STORAGE_DIR)) {
    return {};
  }

  const files = fs.readdirSync(STORAGE_DIR);
  const result: Record<string, string> = {};

  for (const file of files) {
    const filePath = path.join(STORAGE_DIR, file);
    result[file] = fs.readFileSync(filePath, 'utf8');
  }

  return result;
}