/**
 * Storage Utility Module
 *
 * Provides file-based storage functionality for persisting data across restarts.
 */
import fs from 'fs';
import path from 'path';
import { AppSettings } from '../../types/index';

// Directory to store persistent data
// Use /external/host/magi-system/.server/ if available, otherwise fallback to local storage
const externalPath = '/external/host/magi-system/.server/';
const localPath = path.join(process.cwd(), 'dist/.server/magi_storage');

// Check if external path is available
const useExternalPath =
    fs.existsSync('/external/host/magi-system') ||
    fs.existsSync('/external/host');

// Set the storage directory
const STORAGE_DIR = useExternalPath ? externalPath : localPath;

// Specific directory for project data
const PROJECTS_DIR = path.join(STORAGE_DIR, 'projects');

// Project metadata interface
export interface ProjectMetadata {
    projectName: string;
    description: string; // Short description for UI status
    overview: string; // Comprehensive overview
    history: ProjectHistoryEntry[];
}

// Project history entry interface
export interface ProjectHistoryEntry {
    timestamp: string; // ISO date string
    taskId?: string; // Optional associated task ID
    action: string; // Description of the action
}

/**
 * Initializes the storage directory
 */
export function initStorage(): void {
    if (!fs.existsSync(STORAGE_DIR)) {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }

    // Also initialize the projects directory
    if (!fs.existsSync(PROJECTS_DIR)) {
        fs.mkdirSync(PROJECTS_DIR, { recursive: true });
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
 * Save project metadata to storage
 *
 * @param projectName - The name of the project
 * @param metadata - The project metadata object
 */
export function saveProjectData(
    projectName: string,
    metadata: ProjectMetadata
): void {
    initStorage();

    const filePath = path.join(PROJECTS_DIR, `${projectName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), 'utf8');
}

/**
 * Load project metadata from storage
 *
 * @param projectName - The name of the project
 * @returns The project metadata, or undefined if not found
 */
export function loadProjectData(
    projectName: string
): ProjectMetadata | undefined {
    initStorage();

    const filePath = path.join(PROJECTS_DIR, `${projectName}.json`);

    if (fs.existsSync(filePath)) {
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data) as ProjectMetadata;
        } catch (error) {
            console.error(
                `Error loading project data for ${projectName}:`,
                error
            );
            return undefined;
        }
    }

    return undefined;
}

/**
 * Add a history entry to a project
 *
 * @param projectName - The name of the project
 * @param entry - The history entry to add
 * @returns true if successful, false otherwise
 */
export function addProjectHistory(
    projectName: string,
    entry: ProjectHistoryEntry
): boolean {
    try {
        const metadata = loadProjectData(projectName);

        if (!metadata) {
            // Create a new metadata object if it doesn't exist
            const newMetadata: ProjectMetadata = {
                projectName,
                description: '',
                overview: '',
                history: [entry],
            };
            saveProjectData(projectName, newMetadata);
        } else {
            // Add the entry to the history array
            metadata.history.push(entry);
            saveProjectData(projectName, metadata);
        }

        return true;
    } catch (error) {
        console.error(`Error adding history to project ${projectName}:`, error);
        return false;
    }
}

/**
 * Get all projects metadata
 *
 * @returns Array of project metadata objects
 */
export function getAllProjects(): ProjectMetadata[] {
    initStorage();

    if (!fs.existsSync(PROJECTS_DIR)) {
        return [];
    }

    const files = fs.readdirSync(PROJECTS_DIR);
    const projects: ProjectMetadata[] = [];

    for (const file of files) {
        if (file.endsWith('.json')) {
            const filePath = path.join(PROJECTS_DIR, file);
            try {
                const data = fs.readFileSync(filePath, 'utf8');
                const metadata = JSON.parse(data) as ProjectMetadata;
                projects.push(metadata);
            } catch (error) {
                console.error(
                    `Error parsing project data from ${file}:`,
                    error
                );
            }
        }
    }

    return projects;
}

/**
 * Get the list of all project names with their descriptions
 *
 * @returns Object mapping project names to descriptions
 */
export function getProjectDescriptions(): Record<string, string> {
    const projects = getAllProjects();
    const result: Record<string, string> = {};

    for (const project of projects) {
        result[project.projectName] = project.description;
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
