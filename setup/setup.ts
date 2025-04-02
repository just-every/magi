#!/usr/bin/env node

import * as fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';
import {execSync} from 'child_process';

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine the project root
// When running from dist/setup/setup.js, we need to go up two levels
// Check if we're running from dist or directly from setup
const isRunningFromDist = __dirname.includes('dist/setup');
const rootDir = isRunningFromDist
  ? path.resolve(__dirname, '../..')
  : path.resolve(__dirname, '..');

const envPath = path.join(rootDir, '.env');
const envExamplePath = path.join(rootDir, '.env.example');

// Verify paths are correct - debug info
console.log('Current directory:', __dirname);
console.log('Detected running from:', isRunningFromDist ? 'dist/setup' : 'setup');
console.log('Project root directory:', rootDir);
console.log('.env path:', envPath);
console.log('.env.example path:', envExamplePath);

// Verify .env.example exists
if (!fs.existsSync(envExamplePath)) {
  console.error('\x1b[31m%s\x1b[0m', `ERROR: .env.example file not found at ${envExamplePath}`);
  process.exit(1);
}

// Store environment variables
let envVars: Record<string, string> = {};
let openaiApiKey = '';

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
        if (value &&
            !value.includes('your_') &&
            !value.includes('_here') &&
            !value.includes('_if_applicable')) {
          result[key] = value;
        }
      }
    });

    return result;
  } catch (error) {
    console.error(`Error reading ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

// Core dependencies are now installed by bootstrap.js before this script runs

function ensureAllEnvVars(): void {
  console.log('');
  console.log('\x1b[36m%s\x1b[0m', 'Step 2: Setting up environment variables');

  // Load example env vars as templates
  const exampleEnvVars = parseEnvFile(envExamplePath);

  // Check if .env file already exists and load existing values
  if (fs.existsSync(envPath)) {
    console.log('\x1b[33m%s\x1b[0m', 'A .env file already exists. Checking for missing variables...');

    // Load current env vars
    envVars = parseEnvFile(envPath);

    // Check if OpenAI API key exists
    const apiKey = envVars['OPENAI_API_KEY'];
    if (apiKey) {
      openaiApiKey = apiKey;
      console.log('Current OpenAI API key found: ' + apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4));
    }

    // Create a list of missing variables
    const missingVars = Object.keys(exampleEnvVars).filter(key => !envVars[key]);

    if (missingVars.length === 0) {
      console.log('\x1b[32m%s\x1b[0m', '✓ All environment variables are set');
      promptForMissingKeys();
      return;
    }

    console.log(`\nYou'll be prompted for ${missingVars.length} environment settings.`);
    console.log('\x1b[90mPress Enter to skip any setting you don\'t want to configure.\x1b[0m\n');
    promptForMissingKeys();
    return;
  }

  // No .env file exists, create from scratch
  console.log('Creating new .env file...');
  console.log(`\nYou'll be prompted for environment settings.`);
  console.log('\x1b[90mPress Enter to skip any setting you don\'t want to configure.\x1b[0m\n');
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
      description: 'Your name - identifies you in primary commands'
    },
    {
      key: 'AI_NAME',
      prompt: 'Enter AI name (press Enter for default "Magi" or to skip): ',
      defaultValue: 'Magi',
      description: 'AI name - identifies the AI in thought processes'
    },
    {
      key: 'OPENAI_API_KEY',
      prompt: 'Enter your OpenAI API Key (press Enter to skip): ',
      infoUrl: 'https://platform.openai.com/api-keys',
      description: 'OpenAI'
    },
    {
      key: 'ANTHROPIC_API_KEY',
      prompt: 'Enter your Anthropic API Key (press Enter to skip): ',
      infoUrl: 'https://console.anthropic.com/settings/keys',
      description: 'Anthropic for Claude models'
    },
    {
      key: 'GOOGLE_API_KEY',
      prompt: 'Enter your Google API Key (press Enter to skip): ',
      infoUrl: 'https://makersuite.google.com/app/apikey',
      description: 'Google API key for Gemini models'
    },
    {
      key: 'XAI_API_KEY',
      prompt: 'Enter your X.AI API Key (press Enter to skip): ',
      infoUrl: 'https://platform.x.com/products/grok',
      description: 'X.AI API key for Grok models'
    },
    {
      key: 'DEEPSEEK_API_KEY',
      prompt: 'Enter your DeepSeek API Key (press Enter to skip): ',
      infoUrl: 'https://platform.deepseek.com/',
      description: 'DeepSeek API key'
    },
    {
      key: 'BRAVE_API_KEY',
      prompt: 'Enter your Brave API Key (press Enter to skip): ',
      infoUrl: 'https://api.search.brave.com/register',
      description: 'Brave API key for web search'
    }
  ];

  // Find first missing key that hasn't been prompted yet
  const nextPrompt = configPrompts.find(item => !envVars[item.key] && envVars[item.key] !== '');

  if (nextPrompt) {
    // Skip if already has value
    if (envVars[nextPrompt.key]) {
      promptForMissingKeys();
      return;
    }

    // Add a newline before each prompt
    console.log('');

    // Show description and URL if available
    if (nextPrompt.description) {
      if (nextPrompt.infoUrl) {
        // If we have both description and URL, show them on the same line
        // Use Hyperlink escape sequences to make the URL clickable in compatible terminals
        console.log(`\x1b[90m${nextPrompt.description} (\x1b]8;;${nextPrompt.infoUrl}\x1b\\\x1b[34m${nextPrompt.infoUrl}\x1b[0m\x1b]8;;\x1b\\\x1b[90m)\x1b[0m`);
      } else {
        // Just show the description if no URL
        console.log(`\x1b[90m${nextPrompt.description}\x1b[0m`);
      }
    }

    rl.question(nextPrompt.prompt, (keyValue) => {
      if (keyValue && keyValue.trim() !== '') {
        // User entered a value
        envVars[nextPrompt.key] = keyValue.trim();

        // Update openaiApiKey if we're setting that value
        if (nextPrompt.key === 'OPENAI_API_KEY') {
          openaiApiKey = keyValue.trim();
        }
      } else if (nextPrompt.defaultValue) {
        // Use default value if available and user input is empty
        envVars[nextPrompt.key] = nextPrompt.defaultValue;
        console.log(`Using default: "${nextPrompt.defaultValue}"`);
      } else if (nextPrompt.key === 'OPENAI_API_KEY') {
        // Double confirm if user wants to skip OpenAI API key
        console.log('\x1b[33m%s\x1b[0m', 'NOTE: The OpenAI API key is highly recommended. Voice output will not work without it.');
        rl.question('Are you sure you want to skip this key? (y/n): ', (confirmation) => {
          if (confirmation.toLowerCase() === 'n' || confirmation.toLowerCase() === 'no') {
            // User changed their mind, ask for the key again
            console.log('');
            if (nextPrompt.infoUrl) {
              console.log(`\x1b[90m${nextPrompt.description} (\x1b]8;;${nextPrompt.infoUrl}\x1b\\\x1b[34m${nextPrompt.infoUrl}\x1b[0m\x1b]8;;\x1b\\\x1b[90m)\x1b[0m`);
            }
            rl.question(nextPrompt.prompt, (keyValue) => {
              if (keyValue && keyValue.trim() !== '') {
                envVars[nextPrompt.key] = keyValue.trim();
                openaiApiKey = keyValue.trim();
              } else {
                envVars[nextPrompt.key] = '';
                console.log('OpenAI API key skipped. Voice output will not be available.');
              }
              promptForMissingKeys();
            });
            return;
          } else {
            // Confirmed skip
            envVars[nextPrompt.key] = '';
            console.log('OpenAI API key skipped. Voice output will not be available.');
            promptForMissingKeys();
          }
        });
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
      { key: 'YOUR_NAME', comment: '# Your name - identifies you in primary commands' },
      { key: 'AI_NAME', comment: '# AI name - identifies the AI in thought processes' },
      { key: 'OPENAI_API_KEY', comment: '# OpenAI API key for GPT models' },
      { key: 'ANTHROPIC_API_KEY', comment: '# Anthropic API key for Claude models' },
      { key: 'GOOGLE_API_KEY', comment: '# Google API key for Gemini models' },
      { key: 'XAI_API_KEY', comment: '# X.AI API key for Grok models' },
      { key: 'DEEPSEEK_API_KEY', comment: '# DeepSeek API key' },
      { key: 'BRAVE_API_KEY', comment: '# Brave API key for web search' }
    ];

    // Add each variable if it exists and has a value
    configKeys.forEach(({ key, comment }) => {
      if (envVars[key] && envVars[key].trim() !== '') {
        envContent += `${comment}\n${key}=${envVars[key]}\n\n`;
      }
    });

    // Write to .env file
    fs.writeFileSync(envPath, envContent);
    console.log('\x1b[32m%s\x1b[0m', '✓ Environment variables saved to .env file');
    installSubDependencies();
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', `Error saving .env file: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

function installSubDependencies(): void {
	console.log('');
	console.log('\x1b[36m%s\x1b[0m', 'Step 3: Installing component dependencies');

	try {
		console.log('Installing controller and magi dependencies...');
		execSync('cd controller && npm install && cd ../magi && npm install', {stdio: 'inherit', cwd: rootDir});
		console.log('\x1b[32m%s\x1b[0m', '✓ Component dependencies installed successfully');
		buildDockerImage();
	} catch (error) {
		console.error('\x1b[31m%s\x1b[0m', 'Failed to install component dependencies.');
		console.error('Error: ', error instanceof Error ? error.message : String(error));

		rl.question('Do you want to continue setup without installing all dependencies? (y/n): ', (answer) => {
			if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
				console.log('\x1b[33m%s\x1b[0m', 'Continuing without installing all dependencies. This may cause issues later.');
				buildDockerImage();
			} else {
				console.log('Setup aborted. Please fix the installation issues and try again.');
				process.exit(1);
			}
		});
	}
}

function checkDockerInstalled(): boolean {
	try {
		execSync('docker --version', {stdio: 'pipe'});
		return true;
	} catch {
		return false;
	}
}

function buildDockerImage(): void {
	console.log('');
	console.log('\x1b[36m%s\x1b[0m', 'Step 4: Building Docker image');

	// Check if Docker is installed
	if (!checkDockerInstalled()) {
		console.error('\x1b[31m%s\x1b[0m', 'Docker is not installed or not in the PATH.');
		console.error('Please install Docker first: https://docs.docker.com/get-docker/');

		// Ask if user wants to continue without Docker
		rl.question('Do you want to continue setup without building the Docker image? (y/n): ', (answer) => {
			if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
				console.log('\x1b[33m%s\x1b[0m', 'Skipping Docker build. Note: MAGI System requires Docker to run properly.');
				setupDockerVolumes();
			} else {
				console.log('Setup aborted. Please install Docker and try again.');
				process.exit(1);
			}
		});
		return;
	}

	console.log('This may take a few minutes...');

	try {
		execSync('docker build -t magi-system:latest -f magi/docker/Dockerfile .', {
			stdio: 'inherit',
			cwd: rootDir
		});
		console.log('\x1b[32m%s\x1b[0m', '✓ Docker image built successfully');
		setupDockerVolumes();
	} catch (error) {
		console.error('\x1b[31m%s\x1b[0m', 'Failed to build Docker image.');
		console.error('Error: ', error instanceof Error ? error.message : String(error));

		// Ask if user wants to continue without Docker
		rl.question('Do you want to continue setup without the Docker image? (y/n): ', (answer) => {
			if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
				console.log('\x1b[33m%s\x1b[0m', 'Continuing without Docker image. Note: MAGI System requires Docker to run properly.');
				setupDockerVolumes();
			} else {
				console.log('Setup aborted. Please fix the Docker issue and try again.');
				process.exit(1);
			}
		});
	}
}

function setupDockerVolumes(): void {
	console.log('');
	console.log('\x1b[36m%s\x1b[0m', 'Step 5: Setting up Docker volumes');

	// Check if Docker is available
	if (!checkDockerInstalled()) {
		console.error('\x1b[33m%s\x1b[0m', 'Docker is required for volume setup.');
		rl.question('Do you want to skip volume setup and continue? (y/n): ', (answer) => {
			if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
				console.log('\x1b[33m%s\x1b[0m', 'Skipping volume setup. You may need to run setup/setup-volumes.sh manually later.');
				setupClaude();
			} else {
				console.log('Setup aborted. Please install Docker and try again.');
				process.exit(1);
			}
		});
		return;
	}

	// UID/GID from Dockerfile
	const MAGI_UID = 1001;
	const MAGI_GID = 1001;

	try {
		console.log(`Setting permissions for volume 'magi_output' to ${MAGI_UID}:${MAGI_GID}...`);
		execSync(`docker run --rm --user root -v magi_output:/magi_output alpine:latest chown "${MAGI_UID}:${MAGI_GID}" /magi_output`, 
			{ stdio: 'inherit', cwd: rootDir });

		console.log(`Setting permissions for volume 'claude_credentials' to ${MAGI_UID}:${MAGI_GID}...`);
		execSync(`docker run --rm --user root -v claude_credentials:/claude_shared alpine:latest chown -R "${MAGI_UID}:${MAGI_GID}" /claude_shared`, 
			{ stdio: 'inherit', cwd: rootDir });

		console.log('\x1b[32m%s\x1b[0m', '✓ Docker volumes set up successfully');
		setupClaude();
	} catch (error) {
		console.error('\x1b[31m%s\x1b[0m', 'Failed to set up Docker volumes.');
		console.error('Error: ', error instanceof Error ? error.message : String(error));
		
		rl.question('Do you want to continue without setting up volumes? (y/n): ', (answer) => {
			if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
				console.log('\x1b[33m%s\x1b[0m', 'Continuing without volume setup. You may need to run setup/setup-volumes.sh manually later.');
				setupClaude();
			} else {
				console.log('Setup aborted. Please fix the Docker issues and try again.');
				process.exit(1);
			}
		});
	}
}

function setupClaude(): void {
	console.log('');
	console.log('\x1b[36m%s\x1b[0m', 'Step 6: Setting up Claude');

	// Check if Docker is available for Claude setup
	if (!checkDockerInstalled()) {
		console.error('\x1b[33m%s\x1b[0m', 'Docker is required for Claude setup.');
		rl.question('Do you want to skip Claude setup and complete the installation? (y/n): ', (answer) => {
			if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
				console.log('\x1b[33m%s\x1b[0m', 'Skipping Claude setup. You can run "npm run setup-claude" later when Docker is available.');
				setupComplete();
			} else {
				console.log('Setup aborted. Please install Docker and try again.');
				process.exit(1);
			}
		});
		return;
	}

	try {
		console.log('Running npm run setup-claude...');
		console.log('\x1b[33m%s\x1b[0m', 'Follow the prompts to authenticate with Claude when they appear.');
		console.log('\x1b[33m%s\x1b[0m', 'When complete, press Ctrl+C to continue with the setup.');

		execSync('npm run setup-claude', {stdio: 'inherit', cwd: rootDir});
		console.log('\x1b[32m%s\x1b[0m', '✓ Claude setup completed successfully');
		setupComplete();
	} catch (error) {
		console.error('\x1b[31m%s\x1b[0m', 'Failed to set up Claude.');
		console.error('Error: ', error instanceof Error ? error.message : String(error));

		rl.question('Do you want to continue without Claude setup? (y/n): ', (answer) => {
			if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
				console.log('\x1b[33m%s\x1b[0m', 'Skipping Claude setup. You can run "npm run setup-claude" later.');
				setupComplete();
			} else {
				console.log('Setup aborted. Please fix the Claude setup issue and try again.');
				process.exit(1);
			}
		});
	}
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
	console.log('  - OpenAI API key configuration');
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
