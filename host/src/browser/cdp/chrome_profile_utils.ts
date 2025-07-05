/**
 * Chrome profile management utilities.
 * Handles cross-platform detection, cloning, and merging of Chrome profiles.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as os from 'os';

// Default profile names
const DEFAULT_PROFILE_NAME = 'Default';

// Default persistent profile path is in the project directory
const DEFAULT_PERSISTENT_PROFILE_DIR = path.join(process.cwd(), '.chrome');

/**
 * Get the path to Chrome's user data directory based on the operating system
 */
export function getDefaultChromeUserDataDir(): string {
    const platform = process.platform;
    const homeDir = os.homedir();

    switch (platform) {
        case 'win32':
            // Windows: %LOCALAPPDATA%\Google\Chrome\User Data
            return path.join(
                process.env.LOCALAPPDATA ||
                    path.join(homeDir, 'AppData', 'Local'),
                'Google',
                'Chrome',
                'User Data'
            );
        case 'darwin':
            // macOS: ~/Library/Application Support/Google/Chrome
            return path.join(
                homeDir,
                'Library',
                'Application Support',
                'Google',
                'Chrome'
            );
        case 'linux':
            // Linux: ~/.config/google-chrome
            return path.join(homeDir, '.config', 'google-chrome');
        default:
            // Fallback to a temporary directory
            console.warn(
                `Unsupported platform: ${platform}, using temp directory for Chrome profile`
            );
            return path.join(os.tmpdir(), 'magi-chrome-profile');
    }
}

/**
 * Get the path to Chromium/Brave/Edge user data directory
 * This is a best-effort function that tries common paths for alternative browsers
 */
export function getAlternativeBrowserDataDir(): string | null {
    const platform = process.platform;
    const homeDir = os.homedir();

    // Potential browser paths to check
    const possiblePaths: Array<[string, string]> = [];

    if (platform === 'win32') {
        const localAppData =
            process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');
        possiblePaths.push(
            [path.join(localAppData, 'Chromium', 'User Data'), 'Chromium'],
            [path.join(localAppData, 'Microsoft', 'Edge', 'User Data'), 'Edge'],
            [
                path.join(
                    localAppData,
                    'BraveSoftware',
                    'Brave-Browser',
                    'User Data'
                ),
                'Brave',
            ]
        );
    } else if (platform === 'darwin') {
        possiblePaths.push(
            [
                path.join(
                    homeDir,
                    'Library',
                    'Application Support',
                    'Chromium'
                ),
                'Chromium',
            ],
            [
                path.join(
                    homeDir,
                    'Library',
                    'Application Support',
                    'Microsoft Edge'
                ),
                'Edge',
            ],
            [
                path.join(
                    homeDir,
                    'Library',
                    'Application Support',
                    'BraveSoftware',
                    'Brave-Browser'
                ),
                'Brave',
            ]
        );
    } else if (platform === 'linux') {
        possiblePaths.push(
            [path.join(homeDir, '.config', 'chromium'), 'Chromium'],
            [path.join(homeDir, '.config', 'microsoft-edge'), 'Edge'],
            [
                path.join(homeDir, '.config', 'BraveSoftware', 'Brave-Browser'),
                'Brave',
            ]
        );
    }

    for (const [dirPath, browserName] of possiblePaths) {
        if (
            fs.existsSync(dirPath) &&
            fs.existsSync(path.join(dirPath, DEFAULT_PROFILE_NAME))
        ) {
            console.log(`Found ${browserName} profile at ${dirPath}`);
            return dirPath;
        }
    }

    return null;
}

/**
 * Create a temporary directory for Chrome profiles
 */
export function createTempProfileDir(): string {
    const tempDir = path.join(os.tmpdir(), `magi-chrome-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    // Create an empty "First Run" file to prevent welcome dialog
    fs.writeFileSync(path.join(tempDir, 'First Run'), '');

    return tempDir;
}

/**
 * Get or create a persistent chrome profile directory
 * @param userDataDir Custom profile directory to use (default: .chrome in project directory)
 * @returns Path to the persistent profile directory
 */
export function getPersistentProfileDir(
    userDataDir: string = DEFAULT_PERSISTENT_PROFILE_DIR
): string {
    // Create the directory if it doesn't exist
    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
        console.log(
            `Created persistent Chrome profile directory at: ${userDataDir}`
        );
    }

    // Make sure the "First Run" file exists to prevent welcome dialog
    const firstRunFile = path.join(userDataDir, 'First Run');
    if (!fs.existsSync(firstRunFile)) {
        fs.writeFileSync(firstRunFile, '');
    }

    return userDataDir;
}

/**
 * Clone a Chrome profile to a persistent or temporary directory
 * @param sourceProfileDir The source Chrome profile directory (usually "Default")
 * @param targetDir The target directory to clone to
 * @returns The path to the cloned profile directory
 */
export function cloneProfile(
    sourceProfileDir: string,
    targetDir: string
): void {
    console.log(
        `Cloning Chrome profile from ${sourceProfileDir} to ${targetDir}`
    );

    // Create target directory if it doesn't exist
    fs.mkdirSync(targetDir, { recursive: true });

    // Create an empty "First Run" file to prevent welcome dialog
    fs.writeFileSync(path.join(targetDir, 'First Run'), '');

    // Key files to always copy for login state, history, etc.
    const keyFiles = [
        'Cookies',
        'Login Data',
        'Web Data',
        'Bookmarks',
        'Preferences',
        'Extension Cookies',
        'Network',
        'Platform Notifications',
        'Sync Data',
        'Local Storage',
        'IndexedDB',
        'Service Worker',
        'Extension State',
        'Extension Rules',
    ];

    for (const file of keyFiles) {
        const sourcePath = path.join(sourceProfileDir, file);
        const targetPath = path.join(targetDir, file);

        if (fs.existsSync(sourcePath)) {
            try {
                // Copy file (handles both regular files and directories)
                if (fs.statSync(sourcePath).isDirectory()) {
                    fs.mkdirSync(targetPath, { recursive: true });
                    copyDirectory(sourcePath, targetPath);
                } else {
                    fs.copyFileSync(sourcePath, targetPath);
                }
            } catch (err: unknown) {
                const errorMessage =
                    err instanceof Error ? err.message : String(err);
                console.warn(`Failed to copy ${file}: ${errorMessage}`);
                // Continue with other files even if one fails
            }
        }
    }
}

/**
 * Recursively copy a directory
 */
function copyDirectory(source: string, target: string) {
    const files = fs.readdirSync(source);

    for (const file of files) {
        const sourcePath = path.join(source, file);
        const targetPath = path.join(target, file);

        if (fs.statSync(sourcePath).isDirectory()) {
            fs.mkdirSync(targetPath, { recursive: true });
            copyDirectory(sourcePath, targetPath);
        } else {
            try {
                fs.copyFileSync(sourcePath, targetPath);
            } catch (err: unknown) {
                const errorMessage =
                    err instanceof Error ? err.message : String(err);
                console.warn(`Failed to copy ${sourcePath}: ${errorMessage}`);
            }
        }
    }
}

/**
 * Check if Chrome is running to avoid profile corruption
 * @returns true if Chrome is running
 */
export function isChromeRunning(): boolean {
    try {
        const platform = process.platform;
        if (platform === 'win32' && !process.env.WSL_DISTRO_NAME) {
            // Pure Windows (not WSL)
            const result = execSync(
                'tasklist /fi "imagename eq chrome.exe" /fo csv /nh'
            ).toString();
            return result.includes('chrome.exe');
        } else if (platform === 'darwin') {
            const result = execSync('pgrep -x "Google Chrome"').toString();
            return result.trim().length > 0;
        } else if (platform === 'linux' || process.env.WSL_DISTRO_NAME) {
            // Linux or WSL - check for WSL Chrome processes, not Windows Chrome
            try {
                const result = execSync(
                    'pgrep -f "google-chrome" || pgrep -f "chrome" || pgrep -f "chromium"'
                ).toString();
                return result.trim().length > 0;
            } catch {
                // If pgrep fails, try ps as fallback
                try {
                    const result = execSync(
                        'ps aux | grep -E "(google-chrome|chrome|chromium)" | grep -v grep'
                    ).toString();
                    return result.trim().length > 0;
                } catch {
                    return false;
                }
            }
        }
        return false;
    } catch (_error) {
        // If the command fails, assume Chrome is not running
        return false;
    }
}

/**
 * Get the profile directory for use with Chrome CDP
 * Handles detection, cloning, and setup of a Chrome profile
 */
export function setupChromeProfile(): string {
    const userDataDir = getDefaultChromeUserDataDir();
    const profileName = DEFAULT_PROFILE_NAME;

    // Get the persistent profile directory in the project
    const persistentProfileDir = path.join(
        getPersistentProfileDir(),
        DEFAULT_PROFILE_NAME
    );

    // Check if the persistent profile exists
    const persistentProfileExists = fs.existsSync(persistentProfileDir);

    // If the persistent profile doesn't exist, clone from default profile
    if (!persistentProfileExists) {
        const sourceProfilePath = path.join(userDataDir, profileName);
        console.log(
            `Creating initial persistent profile by cloning from ${sourceProfilePath}`
        );
        cloneProfile(sourceProfilePath, persistentProfileDir);
    }

    return path.dirname(persistentProfileDir);
}
