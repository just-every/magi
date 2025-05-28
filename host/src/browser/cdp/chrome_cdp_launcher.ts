/**
 * Chrome CDP launcher module for MAGI system.
 *
 * Manages the lifecycle of a headless Chrome instance with CDP (Chrome DevTools Protocol)
 * for direct browser control without requiring an extension.
 */

import * as chromeLauncher from 'chrome-launcher';
import CDP from 'chrome-remote-interface';
import type { Client as CDPClient } from 'chrome-remote-interface';
import * as fs from 'fs';
import {
    setupChromeProfile,
    getDefaultChromeUserDataDir,
} from './chrome_profile_utils.js';

// Global instance tracking
interface ChromeInstance {
    chrome: chromeLauncher.LaunchedChrome;
    endpoint: string;
    userDataDir?: string;
    shutdownCallbacks: Array<() => Promise<void> | void>;
    cdpClients: Set<CDPClient>;
}

let globalChromeInstance: ChromeInstance | null = null;

/**
 * Configuration options for Chrome launcher
 */
export interface ChromeLaunchOptions {
    userDataDir?: string; // Chrome user data directory path
    profileName?: string; // Profile name within user data dir
    headless?: boolean; // Run in headless mode
    mergeOnExit?: boolean; // Merge profile changes back on exit
    port?: number; // Port for CDP
    chromeFlags?: string[]; // Additional Chrome flags
    attachExitHandlers?: boolean; // Register SIGINT/SIGTERM/exit handlers (default: true)
}

/**
 * Check if Chrome is already running on the specified port
 */
async function checkExistingChromeInstance(port: number): Promise<boolean> {
    if (port <= 0) return false;

    try {
        // Check if the port is open
        const { execSync } = await import('child_process');
        try {
            execSync(`nc -z localhost ${port}`);
        } catch (e) {
            console.log(`Port ${port} is not open, no Chrome instance found`);
            return false;
        }

        // Try to connect via CDP to verify it's Chrome
        try {
            const tempClient = await CDP({ port });
            if (tempClient) {
                await tempClient.close();
                return true;
            }
        } catch (e) {
            console.log(
                `Failed to connect to Chrome on port ${port}: ${e instanceof Error ? e.message : String(e)}`
            );
            return false;
        }
    } catch (e) {
        console.log(
            `Error checking existing Chrome: ${e instanceof Error ? e.message : String(e)}`
        );
        return false;
    }

    return false;
}

/**
 * Set up a connection to an existing Chrome instance
 */
async function connectToExistingChrome(
    port: number,
    userDataDir?: string
): Promise<ChromeInstance | null> {
    try {
        // Get process ID using lsof (works on macOS and Linux)
        let pid: number | undefined;
        try {
            const { execSync } = await import('child_process');
            const output = execSync(`lsof -i:${port} -t`).toString().trim();
            pid = parseInt(output, 10);
            console.log(`Found Chrome process with PID: ${pid}`);
        } catch (e) {
            console.log(`Could not determine PID of Chrome on port ${port}`);
        }

        // Create a minimal LaunchedChrome object
        const chrome: chromeLauncher.LaunchedChrome = {
            port,
            pid: pid || 0, // Ensure pid is a number (not undefined)
            process: null!, // We don't have the actual process object
            kill: async () => {
                if (pid) {
                    try {
                        const { execSync } = await import('child_process');
                        console.log(
                            `Killing Chrome process ${pid} with SIGTERM`
                        );
                        execSync(`kill -TERM ${pid}`);

                        // Wait a bit and check if process is still running
                        await new Promise(resolve => setTimeout(resolve, 1000));

                        try {
                            // Check if process is still running
                            execSync(`ps -p ${pid} > /dev/null 2>&1`);

                            // If we get here, process is still running, try SIGKILL
                            console.log(
                                `Chrome process ${pid} still running, using SIGKILL`
                            );
                            execSync(`kill -KILL ${pid}`);
                        } catch (e) {
                            // Process not found, which means it's already terminated
                            console.log(
                                `Chrome process ${pid} successfully terminated`
                            );
                        }

                        return true;
                    } catch (e) {
                        console.error(
                            `Failed to kill Chrome process: ${e instanceof Error ? e.message : String(e)}`
                        );
                        return false;
                    }
                }
                return false;
            },
        };

        // Create and return our instance object
        const instance: ChromeInstance = {
            chrome,
            endpoint: `http://localhost:${port}`,
            userDataDir,
            shutdownCallbacks: [],
            cdpClients: new Set(),
        };

        console.log(`Connected to existing Chrome on port ${port}`);
        return instance;
    } catch (e) {
        console.error(
            `Failed to connect to existing Chrome: ${e instanceof Error ? e.message : String(e)}`
        );
        return null;
    }
}

/**
 * Launch a Chrome instance for use with CDP
 */
export async function launchChrome(
    options: ChromeLaunchOptions = {}
): Promise<ChromeInstance> {
    if (globalChromeInstance) {
        console.log('Chrome already running, reusing existing instance');
        return globalChromeInstance;
    }

    // Extract options with defaults
    const {
        headless = process.env.MAGI_CHROME_HEADLESS !== 'false',
        port = parseInt(process.env.HOST_CDP_PORT || '0', 10),
        chromeFlags = [],
        attachExitHandlers = true,
    } = options;

    // Try to connect to an existing Chrome instance if a port is specified
    if (port > 0) {
        const isRunning = await checkExistingChromeInstance(port);
        if (isRunning) {
            console.log(
                `Found existing Chrome instance on port ${port}, connecting instead of launching`
            );
            const existingInstance = await connectToExistingChrome(
                port,
                options.userDataDir
            );
            if (existingInstance) {
                // Store the instance
                globalChromeInstance = existingInstance;

                // Register graceful shutdown handler
                if (attachExitHandlers) {
                    process.on('SIGINT', () =>
                        shutdownChrome(existingInstance)
                    );
                    process.on('SIGTERM', () =>
                        shutdownChrome(existingInstance)
                    );
                    process.on('exit', () => shutdownChrome(existingInstance));
                }

                return existingInstance;
            }
            console.log(
                'Could not connect to existing Chrome, launching a new instance'
            );
        }
    }

    // Note: We already extracted options at the top of the function, no need to do it again

    // Set up Chrome profile
    const chromeProfileDir = setupChromeProfile();

    console.log(`Launching Chrome with profile at ${chromeProfileDir}`);

    // Default flags for Chrome
    const defaultFlags = [
        // Remote debugging port is now handled by chrome-launcher
        //'--disable-extensions',
        '--disable-component-extensions-with-background-pages',
        '--disable-background-networking',
        '--silent-debugger-extension-api',
        '--remote-allow-origins=*',
        '--no-first-run', // Suppress first-run dialog
        '--no-default-browser-check',
        '--disable-background-timer-throttling', // Disable background timer throttling
        '--disable-features=ChromeWhatsNewUI,TriggerFirstRunUI',
    ];

    if (headless) {
        // Try with older headless mode - the "new" one can be problematic with CDP
        defaultFlags.push('--headless');
    }

    // Combine default flags with user-provided flags
    const allFlags = [...defaultFlags, ...chromeFlags];

    // We no longer need to manipulate debugging port flags
    // chrome-launcher will handle this based on the port option

    let instance: ChromeInstance;

    try {
        // Debug output for launch parameters
        console.log('Chrome launch configuration:');
        console.log(`  - User Data Dir: ${chromeProfileDir}`);
        console.log(`  - Port: ${port > 0 ? port : 'auto-select'}`);
        console.log(`  - Flags: ${allFlags.join(' ')}`);

        // The chrome-launcher library will handle any port conflicts
        console.log('Ensuring Chrome can start on a clean port...');

        // Launch Chrome with explicit port option if provided
        console.log('Launching Chrome process...');

        // Let's try using child_process directly to check if Chrome is installed
        try {
            const { execSync } = await import('child_process');
            
            // In WSL, prefer WSL Chrome over Windows Chrome
            let chromeCommand = '';
            try {
                // First try google-chrome (most common in WSL/Linux)
                execSync('which google-chrome', { stdio: 'pipe' });
                chromeCommand = 'google-chrome --version';
            } catch {
                try {
                    // Try chrome
                    execSync('which chrome', { stdio: 'pipe' });
                    chromeCommand = 'chrome --version';
                } catch {
                    try {
                        // Try chromium as fallback
                        execSync('which chromium', { stdio: 'pipe' });
                        chromeCommand = 'chromium --version';
                    } catch {
                        // If in WSL and no Linux Chrome found, warn about chrome.exe
                        if (process.env.WSL_DISTRO_NAME) {
                            console.log('WSL detected but no Linux Chrome found. Install Chrome in WSL with:');
                            console.log('  wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -');
                            console.log('  echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list');
                            console.log('  sudo apt update && sudo apt install google-chrome-stable');
                        }
                        throw new Error('No Chrome installation found');
                    }
                }
            }
            
            const chromeVersion = execSync(chromeCommand)
                .toString()
                .trim();
            console.log(`Detected Chrome version: ${chromeVersion}`);
        } catch (e) {
            console.log(
                'Could not detect Chrome version, but continuing anyway'
            );
        }

        // Determine Chrome binary path for WSL/Linux environments
        let chromePath: string | undefined = undefined;
        if (process.platform === 'linux' || process.env.WSL_DISTRO_NAME) {
            try {
                const { execSync } = await import('child_process');
                try {
                    // Prefer google-chrome in WSL/Linux
                    const path = execSync('which google-chrome', { stdio: 'pipe' }).toString().trim();
                    if (path) {
                        chromePath = path;
                        console.log(`Using Chrome at: ${chromePath}`);
                    }
                } catch {
                    try {
                        // Fallback to chrome
                        const path = execSync('which chrome', { stdio: 'pipe' }).toString().trim();
                        if (path) {
                            chromePath = path;
                            console.log(`Using Chrome at: ${chromePath}`);
                        }
                    } catch {
                        try {
                            // Fallback to chromium
                            const path = execSync('which chromium', { stdio: 'pipe' }).toString().trim();
                            if (path) {
                                chromePath = path;
                                console.log(`Using Chromium at: ${chromePath}`);
                            }
                        } catch {
                            console.log('Could not find Chrome binary path, letting chrome-launcher auto-detect');
                        }
                    }
                }
            } catch (e) {
                console.log('Error detecting Chrome path:', e);
            }
        }

        // Now use chrome-launcher with explicit Chrome path if found
        const launchOptions: any = {
            chromeFlags: allFlags,
            userDataDir: chromeProfileDir,
            startingUrl: 'about:blank',
            ignoreDefaultFlags: true, // We're providing all flags we need
            port: port, // Always use explicit port
            logLevel: 'verbose', // Get more detailed logs
        };

        // Add Chrome path if we found one (prevents chrome-launcher from using Windows Chrome in WSL)
        if (chromePath) {
            launchOptions.chromePath = chromePath;
        }

        const chrome = await chromeLauncher.launch(launchOptions);

        // Verify Chrome is actually running
        if (!chrome.pid) {
            throw new Error('Chrome launched but no PID was returned');
        }

        instance = {
            chrome,
            endpoint: `http://localhost:${chrome.port}`,
            userDataDir: chromeProfileDir,
            shutdownCallbacks: [],
            cdpClients: new Set(),
        };

        console.log(
            `Chrome running on port ${chrome.port} (PID: ${chrome.pid})`
        );
        console.log(`Chrome DevTools endpoint: ${instance.endpoint}`);
    } catch (error) {
        console.error('Failed to launch Chrome:');
        console.error(error);
        throw error; // Re-throw to let caller handle it
    }

    // Register graceful shutdown handler
    if (attachExitHandlers) {
        process.on('SIGINT', () => shutdownChrome(instance));
        process.on('SIGTERM', () => shutdownChrome(instance));
        process.on('exit', () => shutdownChrome(instance));
    }

    // Store the instance
    globalChromeInstance = instance;
    return instance;
}

/**
 * Shutdown Chrome and clean up resources
 */
export async function shutdownChrome(
    instance: ChromeInstance = globalChromeInstance!
): Promise<void> {
    if (!instance) return;

    console.log(`Shutting down Chrome (PID: ${instance.chrome.pid})`);

    // Run registered shutdown callbacks
    for (const callback of instance.shutdownCallbacks) {
        try {
            await Promise.resolve(callback());
        } catch (error) {
            console.error('Error in shutdown callback:', error);
        }
    }

    // Close all CDP clients
    const closePromises = Array.from(instance.cdpClients).map(async client => {
        try {
            await client.close();
        } catch (error) {
            console.error('Error closing CDP client:', error);
        }
    });

    await Promise.all(closePromises);

    // Define a function to check if a process is running
    const isProcessRunning = async (pid: number): Promise<boolean> => {
        try {
            const { execSync } = await import('child_process');
            execSync(`ps -p ${pid} > /dev/null 2>&1`);
            return true; // Process exists
        } catch (e) {
            return false; // Process doesn't exist
        }
    };

    // Kill Chrome - use a direct approach with no intermediary function
    if (instance.chrome.pid) {
        const pid = instance.chrome.pid;
        try {
            const { execSync } = await import('child_process');

            // Try using chrome-launcher's kill method first
            try {
                console.log(
                    `Attempting to kill Chrome process ${pid} with built-in kill()`
                );
                await instance.chrome.kill();
            } catch (e) {
                console.log(
                    `Built-in kill() failed or timed out: ${e instanceof Error ? e.message : String(e)}`
                );
            }

            // Check if the process is still running
            if (await isProcessRunning(pid)) {
                console.log(`Sending SIGTERM to Chrome process ${pid}`);
                execSync(`kill -TERM ${pid}`);

                // Wait a bit and check again
                await new Promise(resolve => setTimeout(resolve, 1000));

                if (await isProcessRunning(pid)) {
                    console.log(
                        `Chrome process ${pid} still running after SIGTERM, sending SIGKILL`
                    );
                    execSync(`kill -KILL ${pid}`);

                    // Final check
                    await new Promise(resolve => setTimeout(resolve, 500));
                    if (!(await isProcessRunning(pid))) {
                        console.log(
                            `Chrome process ${pid} successfully killed with SIGKILL`
                        );
                    } else {
                        console.log(
                            `WARNING: Chrome process ${pid} still running after SIGKILL, trying pkill as last resort`
                        );

                        // Use pkill as a last resort - this will kill all Chrome processes with this port
                        // This is more aggressive but should ensure Chrome is definitely killed
                        if (instance.chrome.port) {
                            try {
                                console.log(
                                    `Using pkill to force kill Chrome on port ${instance.chrome.port}`
                                );
                                execSync(
                                    `pkill -9 -f "Chrome --remote-debugging-port=${instance.chrome.port}"`
                                );
                                console.log(
                                    'pkill command executed successfully'
                                );
                            } catch (e) {
                                console.log(
                                    `pkill command failed or no matching processes: ${e instanceof Error ? e.message : String(e)}`
                                );
                            }
                        }
                    }
                } else {
                    console.log(
                        `Chrome process ${pid} successfully terminated with SIGTERM`
                    );
                }
            } else {
                console.log(
                    `Chrome process ${pid} successfully terminated with built-in kill()`
                );
            }
        } catch (error) {
            console.error(
                `Failed to kill Chrome process ${pid}:`,
                error instanceof Error ? error.message : String(error)
            );
        }
    } else {
        console.log('No Chrome PID available to kill');
    }

    // We no longer need to merge profiles since we're using a persistent profile

    // Remove temp directories if needed
    if (
        instance.userDataDir &&
        instance.userDataDir.includes('magi-chrome-') &&
        fs.existsSync(instance.userDataDir)
    ) {
        try {
            // Keep temp profiles for debugging unless explicitly told to clean up
            if (process.env.MAGI_CLEAN_TEMP_PROFILES === 'true') {
                console.log(
                    `Removing temporary Chrome profile: ${instance.userDataDir}`
                );
                // Recursive directory removal is complex - consider using a library like fs-extra in production
                // For now, just mark that it should be done
                console.log(
                    '(Not actually removing due to safety - set MAGI_CLEAN_TEMP_PROFILES=true to clean up)'
                );
            }
        } catch (error) {
            console.error('Error removing temporary Chrome profile:', error);
        }
    }

    if (globalChromeInstance === instance) {
        globalChromeInstance = null;
    }
}

/**
 * Register a callback to be called when Chrome is shutting down
 */
export function registerShutdownCallback(
    callback: () => Promise<void> | void
): void {
    if (!globalChromeInstance) {
        console.warn(
            'No Chrome instance running, shutdown callback will not be registered'
        );
        return;
    }

    globalChromeInstance.shutdownCallbacks.push(callback);
}

/**
 * Check if Chrome is running
 */
export function isChromeRunning(): boolean {
    return globalChromeInstance !== null;
}

/**
 * Get information about the running Chrome instance
 */
export async function getChromeInfo(): Promise<{
    running: boolean;
    port?: number;
    endpoint?: string;
    pid?: number;
    userDataDir?: string;
}> {
    // First check the global instance
    if (globalChromeInstance) {
        return {
            running: true,
            port: globalChromeInstance.chrome.port,
            endpoint: globalChromeInstance.endpoint,
            pid: globalChromeInstance.chrome.pid,
            userDataDir: globalChromeInstance.userDataDir,
        };
    }

    // If no global instance, check if there's a Chrome running on the port from env
    const port = parseInt(process.env.HOST_CDP_PORT || '0', 10);
    if (port > 0) {
        try {
            const isRunning = await checkExistingChromeInstance(port);
            if (isRunning) {
                // Try to get PID
                let pid: number | undefined;
                try {
                    const { execSync } = await import('child_process');
                    const output = execSync(`lsof -i:${port} -t`)
                        .toString()
                        .trim();
                    pid = parseInt(output, 10);
                } catch (e) {
                    // Ignore error
                }

                return {
                    running: true,
                    port,
                    endpoint: `http://localhost:${port}`,
                    pid: pid || undefined,
                    userDataDir:
                        process.env.MAGI_USER_DATA_DIR ||
                        getDefaultChromeUserDataDir(),
                };
            }
        } catch (e) {
            // Ignore errors and return not running
        }
    }

    return { running: false };
}
