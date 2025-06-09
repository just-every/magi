/**
 * Storage Utility Module
 *
 * Provides file-based storage functionality for persisting data across restarts.
 */
import fs from 'fs';
import path from 'path';
import { AppSettings } from '../../types/index';

// Directory to store persistent data
// Use /external/host/magi/.server/ if available, otherwise fallback to local storage
const externalPath = '/external/host/magi/.server/';
const localPath = path.join(process.cwd(), 'dist/.server/magi_storage');

// Check if external path is available
const useExternalPath =
    fs.existsSync('/external/host/magi') ||
    fs.existsSync('/external/host');

// Set the storage directory
const STORAGE_DIR = useExternalPath ? externalPath : localPath;

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
        if (fs.statSync(filePath).isFile()) {
            result[file] = fs.readFileSync(filePath, 'utf8');
        }
    }

    return result;
}

/**
 * Save application settings to storage
 *
 * @param settings - The app settings object
 */
export function saveAppSettings(settings: AppSettings): void {
    saveData('appSettings.json', JSON.stringify(settings, null, 2));
}

/**
 * Load application settings from storage
 *
 * @returns The app settings, or default settings if not found
 */
export function loadAppSettings(): AppSettings {
    const data = loadData('appSettings.json');

    // Default settings
    const defaultSettings: AppSettings = {
        uiMode: 'column',
        isAudioEnabled: true,
        isTelegramEnabled: true,
    };

    if (!data) {
        return defaultSettings;
    }

    try {
        const settings = JSON.parse(data) as AppSettings;

        // Ensure all properties exist with fallbacks to defaults
        return {
            uiMode: settings.uiMode || defaultSettings.uiMode,
            isAudioEnabled:
                typeof settings.isAudioEnabled === 'boolean'
                    ? settings.isAudioEnabled
                    : defaultSettings.isAudioEnabled,
            isTelegramEnabled:
                typeof settings.isTelegramEnabled === 'boolean'
                    ? settings.isTelegramEnabled
                    : defaultSettings.isTelegramEnabled,
        };
    } catch (error) {
        console.error('Error parsing app settings:', error);
        return defaultSettings;
    }
}
