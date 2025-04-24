#!/usr/bin/env node
/* eslint-env node */

/**
 * Browser Control Utility
 *
 * A utility script for managing Chrome CDP and browser profiles.
 *
 * Commands:
 *   - start: Launch a Chrome instance with CDP
 *   - kill: Kill any running Chrome instances launched by the CDP system
 *   - toggle: Toggle between CDP and extension backends
 *   - clone-profile: Clone a Chrome profile for use with the system
 *   - merge-profile: Merge changes back to the original profile
 *
 * Usage:
 *   node browser-control.js <command> [options]
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import dotenv from 'dotenv';
import {
    launchChrome,
    shutdownChrome,
    getChromeInfo,
    ChromeLaunchOptions,
} from './cdp/chrome_cdp_launcher.js';

// Helper functions for profile management
async function createProfileCloneScript(
    sourceDir: string,
    targetDir: string
): Promise<string> {
    const isWindows = process.platform === 'win32';
    const scriptExt = isWindows ? '.bat' : '.sh';
    const scriptPath = path.join(
        os.tmpdir(),
        `magi-clone-profile-${Date.now()}${scriptExt}`
    );

    let scriptContent: string;

    if (isWindows) {
        // Windows batch script
        scriptContent = `@echo off
echo Cloning Chrome profile from ${sourceDir} to ${targetDir}...
if not exist "${targetDir}" mkdir "${targetDir}"
xcopy /E /I /H /Y "${sourceDir}\\*" "${targetDir}"
echo Profile cloned successfully!
`;
    } else {
        // Bash script for macOS/Linux
        scriptContent = `#!/bin/bash
echo "Cloning Chrome profile from ${sourceDir} to ${targetDir}..."
mkdir -p "${targetDir}"
cp -R "${sourceDir}/"* "${targetDir}/"
echo "Profile cloned successfully!"
`;
    }

    fs.writeFileSync(scriptPath, scriptContent);

    // Make executable on Unix
    if (!isWindows) {
        fs.chmodSync(scriptPath, '755');
    }

    return scriptPath;
}

async function createProfileMergeScript(
    tempDir: string,
    originalDir: string
): Promise<string> {
    const isWindows = process.platform === 'win32';
    const scriptExt = isWindows ? '.bat' : '.sh';
    const scriptPath = path.join(
        os.tmpdir(),
        `magi-merge-profile-${Date.now()}${scriptExt}`
    );

    // Files that are safe to update in the original profile
    const mergeableFiles = [
        'History',
        'Bookmarks',
        'Favicons',
        'Network/Cookies',
        'Network/TransportSecurity',
        'Platform Notifications',
    ];

    let scriptContent: string;

    if (isWindows) {
        // Windows batch script
        scriptContent = `@echo off
echo Merging Chrome profile changes from ${tempDir} to ${originalDir}...
`;

        for (const file of mergeableFiles) {
            const sourcePath = path.join(tempDir, file).replace(/\//g, '\\');
            const targetPath = path
                .join(originalDir, file)
                .replace(/\//g, '\\');
            const targetDir = path.dirname(targetPath);

            scriptContent += `
if exist "${sourcePath}" (
  if not exist "${targetDir}" mkdir "${targetDir}"
  copy /Y "${sourcePath}" "${targetPath}"
)
`;
        }

        scriptContent += `echo Profile changes merged successfully!
`;
    } else {
        // Bash script for macOS/Linux
        scriptContent = `#!/bin/bash
echo "Merging Chrome profile changes from ${tempDir} to ${originalDir}..."
`;

        for (const file of mergeableFiles) {
            const sourcePath = path.join(tempDir, file);
            const targetPath = path.join(originalDir, file);
            const targetDir = path.dirname(targetPath);

            scriptContent += `
if [ -e "${sourcePath}" ]; then
  mkdir -p "${targetDir}"
  cp -f "${sourcePath}" "${targetPath}"
fi
`;
        }

        scriptContent += `echo "Profile changes merged successfully!"
`;
    }

    fs.writeFileSync(scriptPath, scriptContent);

    // Make executable on Unix
    if (!isWindows) {
        fs.chmodSync(scriptPath, '755');
    }

    return scriptPath;
}

function getDefaultChromeUserDataDir(): string {
    const platform = process.platform;
    const homeDir = os.homedir();

    switch (platform) {
        case 'win32':
            return path.join(
                process.env.LOCALAPPDATA ||
                    path.join(homeDir, 'AppData', 'Local'),
                'Google',
                'Chrome',
                'User Data'
            );
        case 'darwin':
            return path.join(
                homeDir,
                'Library',
                'Application Support',
                'Google',
                'Chrome'
            );
        case 'linux':
            return path.join(homeDir, '.config', 'google-chrome');
        default:
            console.warn(
                `Unsupported platform: ${platform}, using temp directory for Chrome profile`
            );
            return path.join(os.tmpdir(), 'magi-chrome-profile');
    }
}

// Get script directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../../..');

// Load environment variables from .env file
const envPath = resolve(rootDir, '.env');
if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else {
    console.warn('No .env file found, using default settings');
}

// Helper to print usage
function printUsage(): void {
    console.log(`
Browser Control Utility

Commands:
  start [--headless] [--user-data-dir=DIR] [--profile=NAME]
    Launch a Chrome instance with CDP

  kill
    Kill any running Chrome instances launched by the CDP system

  status
    Show status of running Chrome instances launched by CDP

  clone-profile [--source=DIR] [--target=DIR]
    Clone a Chrome profile for use with the system

  merge-profile [--source=DIR] [--target=DIR]
    Merge changes back to the original profile

  help
    Print this help message
  `);
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0]?.toLowerCase();

// Parse named options (e.g., --headless, --user-data-dir=path)
interface Options {
    [key: string]: unknown;
    headless?: boolean;
    port?: number;
    'user-data-dir'?: string;
    profile?: string;
    source?: string;
    target?: string;
    d?: boolean;
}

const options: Options = {};
for (const arg of args.slice(1)) {
    if (arg.startsWith('--')) {
        const [key, value] = arg.substring(2).split('=');
        options[key] = value === undefined ? true : value;
    } else if (arg === '-d') {
        options.d = true;
    }
}

async function main(): Promise<void> {
    try {
        switch (command) {
            case 'start': {
                // Prepare launch options
                const chromeOptions: ChromeLaunchOptions = {
                    headless: !!options.headless,
                };

                if (options['user-data-dir']) {
                    chromeOptions.userDataDir = options[
                        'user-data-dir'
                    ] as string;
                }

                if (options.profile) {
                    chromeOptions.profileName = options.profile as string;
                }

                if (options.port) {
                    chromeOptions.port =
                        typeof options.port === 'number'
                            ? options.port
                            : parseInt(options.port as string, 10);
                }

                // Run in detached mode we do NOT want the launcher to
                chromeOptions.attachExitHandlers = false;

                // Launch Chrome
                console.log('Launching Chrome...');
                const chrome = await launchChrome(chromeOptions);

                console.log(`
Chrome launched successfully:
• Port: ${chrome.chrome.port}
• PID: ${chrome.chrome.pid}
• User Data Dir: ${chrome.userDataDir}
• Endpoint: ${chrome.endpoint}

Chrome will stay running in the background. To kill it, run:
npm run browser:kill`);
                // Write port to .env file for Docker to use
                try {
                    // Read .env file if it exists
                    let envContent = '';
                    const envPath = resolve(rootDir, '.env');
                    if (existsSync(envPath)) {
                        envContent = readFileSync(envPath, 'utf-8');
                    }

                    // Update HOST_CDP_PORT
                    if (envContent.includes('HOST_CDP_PORT=')) {
                        // Replace existing line
                        envContent = envContent.replace(
                            /HOST_CDP_PORT=.*/,
                            `HOST_CDP_PORT=${chrome.chrome.port}`
                        );
                    } else {
                        // Add new line
                        envContent += `\n\n# The port to connect to CDP on Chrome\nHOST_CDP_PORT=${chrome.chrome.port}\n`;
                    }

                    // Write .env file
                    writeFileSync(envPath, envContent);
                } catch (error) {
                    console.error(
                        'Failed to update .env file:',
                        error instanceof Error ? error.message : String(error)
                    );
                }

                return process.exit(0);
            }

            case 'kill': {
                const info = await getChromeInfo();
                if (!info.running) {
                    console.log('No CDP Chrome instance is currently running.');
                    return;
                }

                console.log(`Killing Chrome instance (PID: ${info.pid})...`);
                await shutdownChrome();
                console.log('Chrome has been shut down.');
                return;
            }

            case 'status': {
                const info = await getChromeInfo();
                if (!info.running) {
                    console.log('No CDP Chrome instance is currently running.');
                    return;
                }

                console.log(`
Chrome is currently running:
  • Port: ${info.port}
  • PID: ${info.pid}
  • User Data Dir: ${info.userDataDir}
  • Endpoint: ${info.endpoint}
        `);
                return;
            }

            case 'clone-profile': {
                // Determine source and target paths
                const sourceDir =
                    (options.source as string) || getDefaultChromeUserDataDir();
                const targetDir =
                    (options.target as string) ||
                    resolve(process.cwd(), 'chrome-profile');

                // Create target directory if it doesn't exist
                if (!existsSync(targetDir)) {
                    mkdirSync(targetDir, { recursive: true });
                }

                const profileName = (options.profile as string) || 'Default';
                const sourcePath = resolve(sourceDir, profileName);
                const targetPath = resolve(targetDir, profileName);

                console.log(`Cloning Chrome profile:
  From: ${sourcePath}
  To: ${targetPath}
`);

                // Create a script that can be run manually if needed
                const scriptPath = await createProfileCloneScript(
                    sourcePath,
                    targetPath
                );
                console.log(`Created clone script at: ${scriptPath}`);

                // Execute the script directly
                console.log('Executing profile clone...');
                if (process.platform === 'win32') {
                    execSync(`cmd /c "${scriptPath}"`, { stdio: 'inherit' });
                } else {
                    execSync(`"${scriptPath}"`, { stdio: 'inherit' });
                }

                console.log(`
Profile cloned successfully!

To use this profile, set:
  MAGI_USER_DATA_DIR=${targetDir}
  MAGI_PROFILE_NAME=${profileName}
  MAGI_BROWSER_BACKEND=cdp`);
                return;
            }

            case 'merge-profile': {
                const sourceDir = options.source as string;
                const targetDir = options.target as string;

                if (!sourceDir || !targetDir) {
                    console.error(
                        'Both --source and --target options are required for merge-profile'
                    );
                    return;
                }

                // Create a script that can be run manually if needed
                const scriptPath = await createProfileMergeScript(
                    sourceDir,
                    targetDir
                );
                console.log(`Created merge script at: ${scriptPath}`);

                // Execute the script directly
                console.log('Executing profile merge...');
                if (process.platform === 'win32') {
                    execSync(`cmd /c "${scriptPath}"`, { stdio: 'inherit' });
                } else {
                    execSync(`"${scriptPath}"`, { stdio: 'inherit' });
                }

                console.log('Profile changes merged successfully!');
                return;
            }

            case 'help':
            case undefined:
            default:
                printUsage();
                return;
        }
    } catch (error) {
        console.error(
            'Error:',
            error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
    }
}

main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
