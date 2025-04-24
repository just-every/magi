#!/usr/bin/env node

import * as fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';
import { execSync } from 'child_process';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine the project root
// When running from dist/setup/setup.js, we need to go up two levels
// Check if we're running from dist or directly from setup
const isRunningFromDist = __dirname.includes('setup/dist');
const rootDir = isRunningFromDist
    ? path.resolve(__dirname, '../..')
    : path.resolve(__dirname, '..');

const envPath = path.join(rootDir, '.env');
const envExamplePath = path.join(rootDir, '.env.example');

// Verify .env.example exists
if (!fs.existsSync(envExamplePath)) {
    console.error(
        '\x1b[31m%s\x1b[0m',
        `ERROR: .env.example file not found at ${envExamplePath}`
    );
    process.exit(1);
}

// Store environment variables
let envVars: Record<string, string> = {};

// Parse environment variables from file
function parseEnvFile(filePath: string): Record<string, string> {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const result: Record<string, string> = {};

        content.split('\n').forEach(line => {
            // Skip comments and empty lines
            if (line.trim().startsWith('#') || line.trim() === '') {
                return;
            }

            // Split by first = sign (to handle values that contain = signs)
            const separatorIndex = line.indexOf('=');
            if (separatorIndex > 0) {
                const key = line.substring(0, separatorIndex).trim();
                const value = line.substring(separatorIndex + 1).trim();

                // Skip placeholders and example values
                if (
                    value &&
                    !value.includes('your_') &&
                    !value.includes('_here') &&
                    !value.includes('_if_applicable')
                ) {
                    result[key] = value;
                }
            }
        });

        return result;
    } catch (error) {
        console.error(
            `Error reading ${filePath}: ${error instanceof Error ? error.message : String(error)}`
        );
        return {};
    }
}

// Function to find recently modified Git directories
function getRecentDirectories(baseDir: string, limit: number = 10): string[] {
    try {
        // Parent directory
        const parentDir = path.resolve(baseDir, '..');

        // Get all entries in the parent directory
        const entries = fs.readdirSync(parentDir, { withFileTypes: true });

        // Filter for directories and get their stats
        const dirs = entries
            .filter(entry => entry.isDirectory())
            .map(dir => {
                const fullPath = path.join(parentDir, dir.name);
                try {
                    // Check if it's a Git repository (has a .git directory)
                    const isGitRepo = fs.existsSync(
                        path.join(fullPath, '.git')
                    );
                    if (!isGitRepo) return null;

                    const stats = fs.statSync(fullPath);
                    return {
                        path: fullPath,
                        name: dir.name,
                        mtime: stats.mtime.getTime(),
                    };
                } catch (error) {
                    // Skip directories we can't access
                    return null;
                }
            })
            .filter(item => item !== null) as {
            path: string;
            name: string;
            mtime: number;
        }[];

        // Sort by modification time (most recent first)
        const sortedDirs = dirs.sort((a, b) => b.mtime - a.mtime);

        // Check if magi-system is in the list
        const magiSystemDir = sortedDirs.find(
            dir => dir.name === 'magi-system'
        );
        const magiSystemPath = magiSystemDir ? magiSystemDir.path : null;

        // Get paths from sorted directories
        const results = sortedDirs.map(dir => dir.path);

        // If magi-system is not in the list and doesn't match rootDir, add it
        if (!magiSystemPath && !rootDir.endsWith('magi-system')) {
            // Try to find magi-system in parent directory
            const possibleMagiPath = path.join(parentDir, 'magi-system');
            if (
                fs.existsSync(possibleMagiPath) &&
                fs.existsSync(path.join(possibleMagiPath, '.git'))
            ) {
                // Add magi-system to the list (at the end)
                results.push(possibleMagiPath);
            }
        }

        // Take only the top N
        return results.slice(0, limit);
    } catch (error) {
        console.error(
            `Error getting recent directories: ${error instanceof Error ? error.message : String(error)}`
        );
        return [];
    }
}

// Handle the directory selection UI
function handleDirectorySelection(): void {
    console.log('\x1b[36m%s\x1b[0m', 'Directory Selection');
    console.log(
        '\x1b[32m%s\x1b[0m',
        'MAGI will only be able to access the directories you select here.'
    );
    console.log(
        '\x1b[33m%s\x1b[0m',
        'Changes will be saved as git branches and only merged with your approval.'
    );

    // Check if PROJECT_REPOSITORIES is already set
    if (
        envVars['PROJECT_REPOSITORIES'] &&
        envVars['PROJECT_REPOSITORIES'].trim() !== ''
    ) {
        const currentDirs = envVars['PROJECT_REPOSITORIES'].split(',');
        console.log('\n\x1b[33m%s\x1b[0m', 'Current directory access:');
        currentDirs.forEach((dir, i) => {
            console.log(`\x1b[32m✓\x1b[0m ${i + 1}. ${dir}`);
        });

        rl.question(
            '\nWould you like to update your directory access settings? (y/n): ',
            answer => {
                if (
                    answer.toLowerCase() !== 'y' &&
                    answer.toLowerCase() !== 'yes'
                ) {
                    console.log(
                        '\x1b[32m%s\x1b[0m',
                        `✓ Keeping current directory access settings`
                    );
                    promptForMissingKeys();
                    return;
                }
                // Continue with directory selection
                setupDirectorySelection();
            }
        );
        return;
    }

    // No existing PROJECT_REPOSITORIES, proceed with selection
    setupDirectorySelection();

    // Function to set up and handle directory selection
    function setupDirectorySelection() {
        // Get parent directory of the root directory
        const parentDir = path.resolve(rootDir, '..');

        // Get top 10 recently modified Git repositories
        let recentDirs = getRecentDirectories(rootDir);

        // Remove rootDir from recentDirs to avoid duplication
        recentDirs = recentDirs.filter(dir => dir !== rootDir);

        // Make sure all directories are within the parent directory
        recentDirs = recentDirs.filter(dir => dir.startsWith(parentDir));

        // Create a combined list starting with rootDir
        const baseAllDirs = [rootDir, ...recentDirs];

        // This will store custom directories added by the user (preserved across selections)
        const customDirs: string[] = [];

        // By default, include only the current directory
        const selectedDirs = new Set([rootDir]);

        // Display directory list and handle selections
        function displayDirectories() {
            // Create the full list including any custom directories
            const fullDirList = [...baseAllDirs, ...customDirs];

            // Display all Git repositories with appropriate indicators
            console.log('\nRecently modified Git repositories:');
            fullDirList.forEach((dir, index) => {
                const isCurrentDir = dir === rootDir;
                const isSelected = selectedDirs.has(dir);
                const indicator = isSelected
                    ? `\x1b[32m✓\x1b[0m`
                    : `\x1b[31m✗\x1b[0m`;
                const label = isCurrentDir ? `${dir} (current directory)` : dir;
                console.log(`${indicator} ${index + 1}. ${label}`);
            });

            // Display options
            console.log('\nOptions:');
            console.log(
                '  - Enter directory numbers to toggle selection (e.g., "2 3" to toggle #2 and #3)'
            );
            console.log('  - Type "a" to select all');
            console.log('  - Type "n" to deselect all');
            console.log('  - Press Enter to accept current selection');
            console.log('  - Type a full path to add a custom directory');
        }

        // Function to handle Git repository checking and initialization
        function handleGitRepository(
            dirPath: string,
            callback: (success: boolean) => void
        ) {
            const isGitRepo = fs.existsSync(path.join(dirPath, '.git'));

            if (!isGitRepo) {
                console.log(
                    `\x1b[33m%s\x1b[0m`,
                    `Warning: ${dirPath} is not a Git repository.`
                );
                rl.question(
                    'Would you like to initialize Git in this directory? (y/n): ',
                    gitAnswer => {
                        if (
                            gitAnswer.toLowerCase() === 'y' ||
                            gitAnswer.toLowerCase() === 'yes'
                        ) {
                            try {
                                // Initialize Git repository
                                console.log(
                                    `Initializing Git repository in ${dirPath}...`
                                );
                                execSync(`git -C "${dirPath}" init`, {
                                    stdio: 'inherit',
                                });
                                console.log(
                                    `\x1b[32m%s\x1b[0m`,
                                    `Git repository initialized in ${dirPath}`
                                );
                                callback(true);
                            } catch (error) {
                                console.log(
                                    `\x1b[31m%s\x1b[0m`,
                                    `Error initializing Git: ${error instanceof Error ? error.message : String(error)}`
                                );
                                callback(false);
                            }
                        } else {
                            console.log(
                                `\x1b[31m%s\x1b[0m`,
                                `Directory cannot be used without Git. Not adding ${dirPath}`
                            );
                            callback(false);
                        }
                    }
                );
            } else {
                // Directory already has Git
                callback(true);
            }
        }

        const promptForSelection = () => {
            rl.question('\nSelection (press Enter to accept): ', input => {
                input = input.trim();

                if (input === '' || input.toLowerCase() === 'c') {
                    // Continue with current selection
                    // Convert paths to just the basename relative to parent directory
                    const parentDir = path.resolve(rootDir, '..');
                    const dirList = Array.from(selectedDirs)
                        .map(dir => {
                            // If path starts with parent dir, just use the basename
                            if (dir.startsWith(parentDir)) {
                                return path.basename(dir);
                            }
                            // Otherwise use the full path (shouldn't happen with our validation)
                            return dir;
                        })
                        .join(',');

                    envVars['PROJECT_REPOSITORIES'] = dirList;
                    console.log(
                        `\x1b[32m%s\x1b[0m`,
                        `✓ Selected directories: ${dirList}`
                    );
                    promptForMissingKeys();
                    return;
                } else if (input.toLowerCase() === 'a') {
                    // Select all (including custom dirs)
                    selectedDirs.add(rootDir);
                    recentDirs.forEach(dir => selectedDirs.add(dir));
                    customDirs.forEach(dir => selectedDirs.add(dir));
                } else if (input.toLowerCase() === 'n') {
                    // Deselect all
                    selectedDirs.clear();
                } else if (/^\d+(\s+\d+)*$/.test(input)) {
                    // Toggle selected directories by number
                    input.split(/\s+/).forEach(numStr => {
                        const num = parseInt(numStr, 10);
                        const fullDirList = [...baseAllDirs, ...customDirs];

                        if (num >= 1 && num <= fullDirList.length) {
                            // Get the directory from the full list (using the original numbers)
                            const dir = fullDirList[num - 1];
                            if (selectedDirs.has(dir)) {
                                selectedDirs.delete(dir);
                                console.log(
                                    `\x1b[31m%s\x1b[0m`,
                                    `Removed: ${dir}`
                                );
                            } else {
                                selectedDirs.add(dir);
                                console.log(
                                    `\x1b[32m%s\x1b[0m`,
                                    `Added: ${dir}`
                                );
                            }
                        } else {
                            console.log(
                                `\x1b[33m%s\x1b[0m`,
                                `Warning: Number ${num} is out of range`
                            );
                        }
                    });
                } else if (input && fs.existsSync(input)) {
                    // Add custom directory
                    try {
                        const stats = fs.statSync(input);
                        if (stats.isDirectory()) {
                            // Check if the directory is within the parent directory
                            const fullPath = path.isAbsolute(input)
                                ? input
                                : path.resolve(process.cwd(), '..', input);
                            if (!fullPath.startsWith(parentDir)) {
                                console.log(
                                    `\x1b[31m%s\x1b[0m`,
                                    `\nERROR: ${fullPath} is outside the parent directory ${parentDir}`
                                );
                                console.log(
                                    `\x1b[33m%s\x1b[0m`,
                                    `For security reasons, only directories within ${parentDir} can be accessed`
                                );
                                displayDirectories();
                                promptForSelection();
                                return;
                            }

                            // Handle Git repository checking
                            handleGitRepository(input, success => {
                                if (success) {
                                    // Add to custom directories if not already in lists
                                    const fullDirList = [
                                        ...baseAllDirs,
                                        ...customDirs,
                                    ];
                                    if (!fullDirList.includes(input)) {
                                        customDirs.push(input);
                                    }

                                    // Toggle selection
                                    if (selectedDirs.has(input)) {
                                        selectedDirs.delete(input);
                                        console.log(
                                            `\x1b[31m%s\x1b[0m`,
                                            `Removed: ${input}`
                                        );
                                    } else {
                                        selectedDirs.add(input);
                                        console.log(
                                            `\x1b[32m%s\x1b[0m`,
                                            `Added: ${input}`
                                        );
                                    }
                                }

                                // Display directories and continue
                                displayDirectories();
                                promptForSelection();
                            });
                            return; // Exit and wait for nested callback
                        } else {
                            console.log(
                                `\x1b[31m%s\x1b[0m`,
                                `\nERROR: ${input} is not a directory`
                            );
                        }
                    } catch (error) {
                        console.log(
                            `\x1b[31m%s\x1b[0m`,
                            `\nERROR: accessing ${input} failed: ${error instanceof Error ? error.message : String(error)}`
                        );
                    }
                } else {
                    console.log(
                        `\x1b[31m%s\x1b[0m`,
                        `\nERROR: ${input} does not exist`
                    );
                }

                // Display directories with updated selections
                displayDirectories();

                // Recursively prompt for more selection
                promptForSelection();
            });
        };

        // Initial display of directories
        displayDirectories();

        // Start the selection process
        promptForSelection();
    }
}

// Core dependencies are now installed by bootstrap.js before this script runs

function ensureAllEnvVars(): void {
    console.log('');
    console.log(
        '\x1b[36m%s\x1b[0m',
        'Step 2: Setting up environment variables'
    );

    // Create a list of all available configuration keys
    const allConfigPrompts = [
        { key: 'YOUR_NAME', defaultValue: 'User' },
        { key: 'AI_NAME', defaultValue: 'Magi' },
        { key: 'OPENROUTER_API_KEY' },
        { key: 'OPENAI_API_KEY' },
        { key: 'ANTHROPIC_API_KEY' },
        { key: 'GOOGLE_API_KEY' },
        { key: 'XAI_API_KEY' },
        { key: 'DEEPSEEK_API_KEY' },
        { key: 'BRAVE_API_KEY' },
        { key: 'TELEGRAM_BOT_TOKEN' },
        { key: 'TELEGRAM_ALLOWED_CHAT_IDS' },
        { key: 'PROJECT_REPOSITORIES' },
    ];

    // Check if .env file already exists and load existing values
    if (fs.existsSync(envPath)) {
        console.log(
            '\x1b[33m%s\x1b[0m',
            'A .env file already exists. Checking for missing variables...'
        );

        // Load current env vars
        envVars = parseEnvFile(envPath);

        // Create a list of missing variables using configPrompts
        const missingVars = allConfigPrompts
            .map(item => item.key)
            .filter(key => !envVars[key] && envVars[key] !== '');

        if (missingVars.length === 0) {
            console.log(
                '\x1b[32m%s\x1b[0m',
                '✓ All environment variables are set'
            );

            // Ask if user wants to edit the variables
            rl.question(
                '\nWould you like to edit the current variables? (y/n): ',
                answer => {
                    if (
                        answer.toLowerCase() === 'y' ||
                        answer.toLowerCase() === 'yes'
                    ) {
                        console.log(
                            '\x1b[36m%s\x1b[0m',
                            '\nEditing environment variables:'
                        );
                        console.log(
                            '\x1b[90m%s\x1b[0m',
                            'Press Enter to keep the current value, or enter a new value to change it.\n'
                        );

                        // Set all keys to undefined so they'll be prompted again
                        allConfigPrompts.forEach(item => {
                            // Keep the current value in envVars, but mark for prompting
                            if (envVars[item.key]) {
                                // Flag to indicate this is being edited (not a missing var)
                                envVars[`_edit_${item.key}`] = 'true';
                            }
                        });

                        promptForMissingKeys();
                    } else {
                        console.log(
                            '\x1b[32m%s\x1b[0m',
                            'Keeping current environment variables.'
                        );
                        promptForMissingKeys();
                    }
                }
            );
            return;
        }

        console.log(
            `\nYou'll be prompted for ${missingVars.length} environment settings.`
        );
        console.log(
            "\x1b[90mPress Enter to skip any setting you don't want to configure.\x1b[0m\n"
        );
        promptForMissingKeys();
        return;
    }

    // No .env file exists, create from scratch
    console.log('Creating new .env file...');
    console.log(`\nYou'll be prompted for environment settings.`);
    console.log(
        "\x1b[90mPress Enter to skip any setting you don't want to configure.\x1b[0m\n"
    );
    envVars = {};
    promptForMissingKeys();
}

function promptForMissingKeys(): void {
    // All configuration options
    const configPrompts = [
        {
            key: 'YOUR_NAME',
            prompt: 'Enter your name (press Enter for default "Human" or to skip): ',
            defaultValue: 'Human',
            description: 'Your name - identifies you in primary commands',
        },
        {
            key: 'AI_NAME',
            prompt: 'Enter AI name (press Enter for default "Magi" or to skip): ',
            defaultValue: 'Magi',
            description: 'AI name - identifies the AI in thought processes',
        },
        {
            key: 'OPENROUTER_API_KEY',
            prompt: 'Enter your OpenRouter API Key (press Enter to skip): ',
            infoUrl: 'https://openrouter.ai/settings/keys',
            description: 'OpenRouter',
        },
        {
            key: 'OPENAI_API_KEY',
            prompt: 'Enter your OpenAI API Key (press Enter to skip): ',
            infoUrl: 'https://platform.openai.com/api-keys',
            description: 'OpenAI',
        },
        {
            key: 'ANTHROPIC_API_KEY',
            prompt: 'Enter your Anthropic API Key (press Enter to skip): ',
            infoUrl: 'https://console.anthropic.com/settings/keys',
            description: 'Anthropic for Claude models',
        },
        {
            key: 'GOOGLE_API_KEY',
            prompt: 'Enter your Google API Key (press Enter to skip): ',
            infoUrl: 'https://makersuite.google.com/app/apikey',
            description: 'Google API key for Gemini models',
        },
        {
            key: 'XAI_API_KEY',
            prompt: 'Enter your X.AI API Key (press Enter to skip): ',
            infoUrl: 'https://platform.x.com/products/grok',
            description: 'X.AI API key for Grok models',
        },
        {
            key: 'DEEPSEEK_API_KEY',
            prompt: 'Enter your DeepSeek API Key (press Enter to skip): ',
            infoUrl: 'https://platform.deepseek.com/',
            description: 'DeepSeek API key',
        },
        {
            key: 'BRAVE_API_KEY',
            prompt: 'Enter your Brave API Key (press Enter to skip): ',
            infoUrl: 'https://api.search.brave.com/register',
            description: 'Brave API key for web search',
        },
        {
            key: 'TELEGRAM_BOT_TOKEN',
            prompt: 'Enter your Telegram Bot Token (press Enter to skip): ',
            infoUrl: 'https://t.me/BotFather',
            description:
                'Telegram Bot API token for remote communication via Telegram. To create a bot, message /newbot to @BotFather to get your API token. IMPORTANT: After setup, you must send a message to your bot first before it can message you.',
        },
        {
            key: 'TELEGRAM_ALLOWED_CHAT_IDS',
            prompt: 'Enter your Telegram chat IDs (comma-separated for multiple IDs, press Enter to skip): ',
            infoUrl: 'https://t.me/userinfobot',
            description:
                'Telegram chat IDs allowed to communicate with MAGI. Message @userinfobot on Telegram to get your chat ID. NOTE: You must initiate a conversation with your bot for messages to work.',
        },
        {
            key: 'PROJECT_REPOSITORIES',
            prompt: 'Select directories Magi should have access to (current directory is included by default): ',
            defaultValue: rootDir,
            customPrompt: true, // Flag to handle custom directory selection UI
        },
    ];

    // Find first key that needs prompting (either missing or marked for editing)
    const nextPrompt = configPrompts.find(item => {
        // Keys marked for editing with _edit_ prefix
        const isMarkedForEdit = envVars[`_edit_${item.key}`] === 'true';
        // Missing keys
        const isMissing = !envVars[item.key] && envVars[item.key] !== '';
        return isMarkedForEdit || isMissing;
    });

    if (nextPrompt) {
        // Regular check if already has value (not marked for edit)
        if (envVars[nextPrompt.key] && !envVars[`_edit_${nextPrompt.key}`]) {
            promptForMissingKeys();
            return;
        }

        // If we're editing, show the current value
        const currentValue = envVars[nextPrompt.key];
        const isEditing = envVars[`_edit_${nextPrompt.key}`] === 'true';

        // Add a newline before each prompt
        console.log('');

        // Show description and URL if available
        if (nextPrompt.description) {
            if (nextPrompt.infoUrl) {
                // If we have both description and URL, show them on the same line
                // Use Hyperlink escape sequences to make the URL clickable in compatible terminals
                console.log(
                    `\x1b[90m${nextPrompt.description} (\x1b]8;;${nextPrompt.infoUrl}\x1b\\\x1b[34m${nextPrompt.infoUrl}\x1b[0m\x1b]8;;\x1b\\\x1b[90m)\x1b[0m`
                );
            } else {
                // Just show the description if no URL
                console.log(`\x1b[90m${nextPrompt.description}\x1b[0m`);
            }
        }

        // Custom UI for directory selection
        if (
            nextPrompt.customPrompt &&
            nextPrompt.key === 'PROJECT_REPOSITORIES'
        ) {
            // Clean up the edit flag before handling directory selection
            if (isEditing) {
                delete envVars[`_edit_${nextPrompt.key}`];
            }
            handleDirectorySelection();
            return;
        }

        // Modify prompt to show current value if editing
        let displayValue = currentValue;

        // For API keys, mask most characters for security
        if (
            isEditing &&
            currentValue &&
            nextPrompt.key.includes('API_KEY') &&
            currentValue.length > 8
        ) {
            // Show first 4 and last 4 characters, mask the rest with asterisks
            displayValue = `${currentValue.substring(0, 4)}...${currentValue.substring(currentValue.length - 4)}`;
        }

        const promptText = isEditing
            ? `${nextPrompt.prompt.replace(':', '')} [current: ${displayValue}]: `
            : nextPrompt.prompt;

        rl.question(promptText, keyValue => {
            // Clean up the edit flag
            if (isEditing) {
                delete envVars[`_edit_${nextPrompt.key}`];
            }

            if (keyValue && keyValue.trim() !== '') {
                // User entered a value
                envVars[nextPrompt.key] = keyValue.trim();
            } else if (isEditing && currentValue) {
                // Keep current value when editing and user pressed Enter
                console.log(`Keeping current value: "${displayValue}"`);
            } else if (nextPrompt.defaultValue) {
                // Use default value if available and user input is empty
                envVars[nextPrompt.key] = nextPrompt.defaultValue;
                console.log(`Using default: "${nextPrompt.defaultValue}"`);
            } else if (nextPrompt.key === 'OPENAI_API_KEY') {
                // Double confirm if user wants to skip OpenAI API key
                console.log(
                    '\x1b[33m%s\x1b[0m',
                    'NOTE: The OpenAI API key is highly recommended. Voice output will not work without it.'
                );
                rl.question(
                    'Are you sure you want to skip this key? (y/n): ',
                    confirmation => {
                        if (
                            confirmation.toLowerCase() === 'n' ||
                            confirmation.toLowerCase() === 'no'
                        ) {
                            // User changed their mind, ask for the key again
                            console.log('');
                            if (nextPrompt.infoUrl) {
                                console.log(
                                    `\x1b[90m${nextPrompt.description} (\x1b]8;;${nextPrompt.infoUrl}\x1b\\\x1b[34m${nextPrompt.infoUrl}\x1b[0m\x1b]8;;\x1b\\\x1b[90m)\x1b[0m`
                                );
                            }
                            rl.question(nextPrompt.prompt, keyValue => {
                                if (keyValue && keyValue.trim() !== '') {
                                    envVars[nextPrompt.key] = keyValue.trim();
                                } else {
                                    envVars[nextPrompt.key] = '';
                                    console.log(
                                        'OpenAI API key skipped. Voice output will not be available.'
                                    );
                                }
                                promptForMissingKeys();
                            });
                            return;
                        } else {
                            // Confirmed skip
                            envVars[nextPrompt.key] = '';
                            console.log(
                                'OpenAI API key skipped. Voice output will not be available.'
                            );
                            promptForMissingKeys();
                        }
                    }
                );
                return;
            } else {
                // Mark as skipped by setting to empty string
                envVars[nextPrompt.key] = '';
                console.log('Skipped.');
            }
            promptForMissingKeys();
        });
        return;
    }

    // All environment variables have been processed
    saveEnvFile();
}

function saveEnvFile(): void {
    try {
        // Build .env file content from envVars
        let envContent = '';

        // Add standard header
        envContent += '# MAGI System Environment Variables\n\n';

        // Define all the configuration keys and their comments
        const configKeys = [
            {
                key: 'YOUR_NAME',
                comment: '# Your name - identifies you in primary commands',
            },
            {
                key: 'AI_NAME',
                comment: '# AI name - identifies the AI in thought processes',
            },
            {
                key: 'OPENROUTER_API_KEY',
                comment: '# OpenAI API key for GPT models',
            },
            {
                key: 'OPENAI_API_KEY',
                comment: '# OpenAI API key for GPT models',
            },
            {
                key: 'ANTHROPIC_API_KEY',
                comment: '# Anthropic API key for Claude models',
            },
            {
                key: 'GOOGLE_API_KEY',
                comment: '# Google API key for Gemini models',
            },
            { key: 'XAI_API_KEY', comment: '# X.AI API key for Grok models' },
            { key: 'DEEPSEEK_API_KEY', comment: '# DeepSeek API key' },
            { key: 'BRAVE_API_KEY', comment: '# Brave API key for web search' },
            {
                key: 'TELEGRAM_BOT_TOKEN',
                comment: '# Telegram Bot API token for remote communication',
            },
            {
                key: 'TELEGRAM_ALLOWED_CHAT_IDS',
                comment: '# Comma-separated list of allowed Telegram chat IDs',
            },
            {
                key: 'PROJECT_REPOSITORIES',
                comment:
                    '# Directory names (relative to parent dir) that Magi can access, separated by commas',
            },
        ];

        // Add each variable if it exists and has a value
        configKeys.forEach(({ key, comment }) => {
            if (envVars[key] && envVars[key].trim() !== '') {
                envContent += `${comment}\n${key}=${envVars[key]}\n\n`;
            }
        });

        // Write to .env file
        fs.writeFileSync(envPath, envContent);
        console.log(
            '\x1b[32m%s\x1b[0m',
            '✓ Environment variables saved to .env file'
        );
        buildDockerImage();
    } catch (error) {
        console.error(
            '\x1b[31m%s\x1b[0m',
            `Error saving .env file: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
    }
}

function checkDockerInstalled(): boolean {
    try {
        execSync('docker --version', { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

function buildDockerImage(): void {
    console.log('');
    console.log('\x1b[36m%s\x1b[0m', 'Step 3: Building Docker image');

    // Check if Docker is installed
    if (!checkDockerInstalled()) {
        console.error(
            '\x1b[31m%s\x1b[0m',
            'Docker is not installed or not in the PATH.'
        );
        console.error(
            'Please install Docker first: https://docs.docker.com/get-docker/'
        );

        // Ask if user wants to continue without Docker
        rl.question(
            'Do you want to continue setup without building the Docker image? (y/n): ',
            answer => {
                if (
                    answer.toLowerCase() === 'y' ||
                    answer.toLowerCase() === 'yes'
                ) {
                    console.log(
                        '\x1b[33m%s\x1b[0m',
                        'Skipping Docker build. Note: MAGI System requires Docker to run properly.'
                    );
                    setupDockerVolumes();
                } else {
                    console.log(
                        'Setup aborted. Please install Docker and try again.'
                    );
                    process.exit(1);
                }
            }
        );
        return;
    }

    console.log('This may take a few minutes...');

    try {
        execSync(
            'docker build --no-cache -t magi-system:latest -f magi/docker/Dockerfile ./',
            {
                stdio: 'inherit',
                cwd: rootDir,
            }
        );
        console.log('\x1b[32m%s\x1b[0m', '✓ Docker image built successfully');
        setupDockerVolumes();
    } catch (error) {
        console.error('\x1b[31m%s\x1b[0m', 'Failed to build Docker image.');
        console.error(
            'Error: ',
            error instanceof Error ? error.message : String(error)
        );

        // Ask if user wants to continue without Docker
        rl.question(
            'Do you want to continue setup without the Docker image? (y/n): ',
            answer => {
                if (
                    answer.toLowerCase() === 'y' ||
                    answer.toLowerCase() === 'yes'
                ) {
                    console.log(
                        '\x1b[33m%s\x1b[0m',
                        'Continuing without Docker image. Note: MAGI System requires Docker to run properly.'
                    );
                    setupDockerVolumes();
                } else {
                    console.log(
                        'Setup aborted. Please fix the Docker issue and try again.'
                    );
                    process.exit(1);
                }
            }
        );
    }
}

function setupDockerVolumes(): void {
    console.log('');
    console.log('\x1b[36m%s\x1b[0m', 'Step 4: Setting up Docker volumes');

    // Check if Docker is available
    if (!checkDockerInstalled()) {
        console.error(
            '\x1b[33m%s\x1b[0m',
            'Docker is required for volume setup.'
        );
        rl.question(
            'Do you want to skip volume setup and continue? (y/n): ',
            answer => {
                if (
                    answer.toLowerCase() === 'y' ||
                    answer.toLowerCase() === 'yes'
                ) {
                    console.log(
                        '\x1b[33m%s\x1b[0m',
                        'Skipping volume setup. You may need to run setup/setup-volumes.sh manually later.'
                    );
                    setupClaude();
                } else {
                    console.log(
                        'Setup aborted. Please install Docker and try again.'
                    );
                    process.exit(1);
                }
            }
        );
        return;
    }

    // UID/GID from Dockerfile
    const MAGI_UID = 1001;
    const MAGI_GID = 1001;

    try {
        console.log(
            `Setting permissions for volume 'magi_output' to ${MAGI_UID}:${MAGI_GID}...`
        );
        execSync(
            `docker run --rm --user root -v magi_output:/magi_output alpine:latest chown "${MAGI_UID}:${MAGI_GID}" /magi_output`,
            { stdio: 'inherit', cwd: rootDir }
        );

        console.log(
            `Setting permissions for volume 'claude_credentials' to ${MAGI_UID}:${MAGI_GID}...`
        );
        execSync(
            `docker run --rm --user root -v claude_credentials:/claude_shared alpine:latest chown -R "${MAGI_UID}:${MAGI_GID}" /claude_shared`,
            { stdio: 'inherit', cwd: rootDir }
        );

        console.log(
            '\x1b[32m%s\x1b[0m',
            '✓ Docker volumes set up successfully'
        );
        setupClaude();
    } catch (error) {
        console.error('\x1b[31m%s\x1b[0m', 'Failed to set up Docker volumes.');
        console.error(
            'Error: ',
            error instanceof Error ? error.message : String(error)
        );

        rl.question(
            'Do you want to continue without setting up volumes? (y/n): ',
            answer => {
                if (
                    answer.toLowerCase() === 'y' ||
                    answer.toLowerCase() === 'yes'
                ) {
                    console.log(
                        '\x1b[33m%s\x1b[0m',
                        'Continuing without volume setup. You may need to run setup/setup-volumes.sh manually later.'
                    );
                    setupClaude();
                } else {
                    console.log(
                        'Setup aborted. Please fix the Docker issues and try again.'
                    );
                    process.exit(1);
                }
            }
        );
    }
}

function setupClaude(): void {
    console.log('');
    console.log('\x1b[36m%s\x1b[0m', 'Step 5: Setting up Claude');

    // Check if Docker is available for Claude setup
    if (!checkDockerInstalled()) {
        console.error(
            '\x1b[33m%s\x1b[0m',
            'Docker is required for Claude setup.'
        );
        rl.question(
            'Do you want to skip Claude setup and continue? (y/n): ',
            answer => {
                if (
                    answer.toLowerCase() === 'y' ||
                    answer.toLowerCase() === 'yes'
                ) {
                    console.log(
                        '\x1b[33m%s\x1b[0m',
                        'Skipping Claude setup. You can run "npm run setup:claude" later when Docker is available.'
                    );
                    setupComplete();
                } else {
                    console.log(
                        'Setup aborted. Please install Docker and try again.'
                    );
                    process.exit(1);
                }
            }
        );
        return;
    }

    // Ask user if they want to set up Claude Code
    console.log(
        '\x1b[90m%s\x1b[0m',
        'Claude Code requires separate authentication from the Anthropic API key.'
    );
    console.log(
        '\x1b[90m%s\x1b[0m',
        "It's highly recommended as part of our coding toolset."
    );
    rl.question('Do you want to set up Claude Code? (y/n): ', answer => {
        if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'no') {
            console.log(
                '\x1b[33m%s\x1b[0m',
                'Skipping Claude setup. You can run "npm run setup:claude" later if needed.'
            );
            setupComplete();
            return;
        }

        try {
            console.log('Running npm run setup:claude...');
            console.log(
                '\x1b[33m%s\x1b[0m',
                'Follow the prompts to authenticate with Claude when they appear.'
            );
            console.log(
                '\x1b[33m%s\x1b[0m',
                'When complete, press Ctrl+C to continue with the setup.'
            );

            execSync('npm run setup:claude', {
                stdio: 'inherit',
                cwd: rootDir,
            });
            console.log(
                '\x1b[32m%s\x1b[0m',
                '✓ Claude setup completed successfully'
            );
            setupComplete();
        } catch (error) {
            console.error('\x1b[31m%s\x1b[0m', 'Failed to set up Claude.');
            console.error(
                'Error: ',
                error instanceof Error ? error.message : String(error)
            );

            rl.question(
                'Do you want to continue without Claude setup? (y/n): ',
                answer => {
                    if (
                        answer.toLowerCase() === 'y' ||
                        answer.toLowerCase() === 'yes'
                    ) {
                        console.log(
                            '\x1b[33m%s\x1b[0m',
                            'Skipping Claude setup. You can run "npm run setup:claude" later.'
                        );
                        setupComplete();
                    } else {
                        console.log(
                            'Setup aborted. Please fix the Claude setup issue and try again.'
                        );
                        process.exit(1);
                    }
                }
            );
        }
    });
}

function setupComplete(): void {
    console.log('');
    console.log('\x1b[36m%s\x1b[0m', '┌─────────────────────────────────────┐');
    console.log('\x1b[36m%s\x1b[0m', '│       SETUP COMPLETE                │');
    console.log('\x1b[36m%s\x1b[0m', '└─────────────────────────────────────┘');
    console.log('');
    console.log('\x1b[32m%s\x1b[0m', 'MAGI System is now ready to use!');
    console.log('');
    console.log('To start the system, run:');
    console.log('\x1b[36m%s\x1b[0m', '  npm run dev');
    console.log('');

    rl.close();
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
    console.log('\x1b[36m%s\x1b[0m', 'MAGI System Setup Help');
    console.log('This script sets up the MAGI System environment, including:');
    console.log('  - API key configuration (OpenAI, Anthropic, Google, etc.)');
    console.log('  - Telegram bot integration');
    console.log('  - Node.js dependencies installation');
    console.log('  - Docker image building');
    console.log('  - Claude setup');
    console.log('');
    console.log('Usage:');
    console.log('  node setup/setup.js [options]');
    console.log('  npm run setup [-- options]');
    console.log('');
    console.log('Options:');
    console.log('  -h, --help     Show this help message');
    console.log('');
    process.exit(0);
}

// Start setup process
ensureAllEnvVars();
