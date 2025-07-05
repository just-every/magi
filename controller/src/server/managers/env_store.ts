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
export async function saveEnvVar(key: string, value: string): Promise<void> {
    await saveData(key, value);
}

/**
 * Loads an environment variable from persistent storage
 *
 * @param key - The environment variable name to load
 * @returns The stored value, or undefined if not found
 */
export async function loadEnvVar(key: string): Promise<string | undefined> {
    return await loadData(key);
}

/**
 * Updates the server version to trigger client reload
 * after a server restart
 */
export async function updateServerVersion(): Promise<void> {
    const newVersion = Date.now().toString();
    await saveEnvVar('SERVER_VERSION', newVersion);
}

/**
 * Gets the current server version
 *
 * @returns Current server version or a new version if not set
 */
export async function getServerVersion(): Promise<string> {
    const version = await loadEnvVar('SERVER_VERSION');
    if (!version) {
        const newVersion = Date.now().toString();
        await saveEnvVar('SERVER_VERSION', newVersion);
        return newVersion;
    }
    return version;
}

/**
 * Loads all stored environment variables into process.env
 */
export async function loadAllEnvVars(): Promise<void> {
    const data = await loadAllData();

    for (const [key, value] of Object.entries(data)) {
        process.env[key] = value;
    }
}
