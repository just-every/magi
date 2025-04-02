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

console.log('\x1b[36m%s\x1b[0m', '┌─────────────────────────────────────┐');
console.log('\x1b[36m%s\x1b[0m', '│           MAGI SYSTEM SETUP         │');
console.log('\x1b[36m%s\x1b[0m', '└─────────────────────────────────────┘');
console.log('');

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

function ensureAllEnvVars(): void {
  console.log('\x1b[33m%s\x1b[0m', 'Step 1: Setting up environment variables');
  
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
    
    console.log(`Found ${missingVars.length} missing environment variables:`);
    missingVars.forEach(key => {
      console.log(`  - ${key}`);
    });
    
    rl.question('Do you want to set up missing environment variables? (y/n): ', (answer) => {
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        promptForMissingKeys();
      } else {
        console.log('\x1b[32m%s\x1b[0m', '✓ Using existing environment variables');
        installDependencies();
      }
    });
    return;
  }
  
  // No .env file exists, create from scratch
  console.log('Creating new .env file...');
  envVars = {};
  promptForMissingKeys();
}

function promptForMissingKeys(): void {
  // All configuration options
  const configPrompts = [
    { 
      key: 'YOUR_NAME', 
      question: 'Do you want to set your name? (y/n): ',
      prompt: 'Enter your name (default: Human): ',
      defaultValue: 'Human'
    },
    { 
      key: 'AI_NAME', 
      question: 'Do you want to set AI name? (y/n): ',
      prompt: 'Enter AI name (default: Magi): ',
      defaultValue: 'Magi'
    },
    { 
      key: 'OPENAI_API_KEY', 
      question: 'Do you want to set up OpenAI API key? (y/n): ',
      prompt: 'Enter your OpenAI API Key: ',
      infoUrl: 'https://platform.openai.com/api-keys'
    },
    { 
      key: 'ANTHROPIC_API_KEY', 
      question: 'Do you want to set up Anthropic API key for Claude models? (y/n): ',
      prompt: 'Enter your Anthropic API Key: '
    },
    { 
      key: 'ANTHROPIC_ORG_ID', 
      question: 'Do you want to set up Anthropic Organization ID? (y/n): ',
      prompt: 'Enter your Anthropic Organization ID: '
    },
    { 
      key: 'GOOGLE_API_KEY', 
      question: 'Do you want to set up Google API key for Gemini models? (y/n): ',
      prompt: 'Enter your Google API Key: '
    },
    { 
      key: 'XAI_API_KEY', 
      question: 'Do you want to set up X.AI API key for Grok models? (y/n): ',
      prompt: 'Enter your X.AI API Key: '
    },
    { 
      key: 'DEEPSEEK_API_KEY', 
      question: 'Do you want to set up DeepSeek API key? (y/n): ',
      prompt: 'Enter your DeepSeek API Key: '
    },
    { 
      key: 'BRAVE_API_KEY', 
      question: 'Do you want to set up Brave API key for web search? (y/n): ',
      prompt: 'Enter your Brave API Key: '
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
    
    rl.question(nextPrompt.question, (answer) => {
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        // Show info URL if available
        if (nextPrompt.infoUrl) {
          console.log(`Get your ${nextPrompt.key} at: \x1b[34m${nextPrompt.infoUrl}\x1b[0m`);
        }
        
        rl.question(nextPrompt.prompt, (keyValue) => {
          if (keyValue && keyValue.trim() !== '') {
            envVars[nextPrompt.key] = keyValue.trim();
            
            // Update openaiApiKey if we're setting that value
            if (nextPrompt.key === 'OPENAI_API_KEY') {
              openaiApiKey = keyValue.trim();
            }
          } else if (nextPrompt.defaultValue) {
            // Use default value if available and user input is empty
            envVars[nextPrompt.key] = nextPrompt.defaultValue;
          }
          promptForMissingKeys();
        });
      } else {
        // Mark as processed by setting to empty string
        envVars[nextPrompt.key] = '';
        promptForMissingKeys();
      }
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
      { key: 'ANTHROPIC_ORG_ID', comment: '# Anthropic Organization ID if applicable' },
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
    installDependencies();
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', `Error saving .env file: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

function installDependencies(): void {
	console.log('');
	console.log('\x1b[33m%s\x1b[0m', 'Step 2: Installing npm dependencies');

	try {
		console.log('Running npm ci...');
		execSync('npm ci', {stdio: 'inherit', cwd: rootDir});
		console.log('\x1b[32m%s\x1b[0m', '✓ Dependencies installed successfully');
		buildDockerImage();
	} catch {
		console.error('\x1b[31m%s\x1b[0m', 'Failed to install dependencies. Please try again.');
		process.exit(1);
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
	console.log('\x1b[33m%s\x1b[0m', 'Step 3: Building Docker image');

	// Check if Docker is installed
	if (!checkDockerInstalled()) {
		console.error('\x1b[31m%s\x1b[0m', 'Docker is not installed or not in the PATH.');
		console.error('Please install Docker first: https://docs.docker.com/get-docker/');

		// Ask if user wants to continue without Docker
		rl.question('Do you want to continue setup without building the Docker image? (y/n): ', (answer) => {
			if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
				console.log('\x1b[33m%s\x1b[0m', 'Skipping Docker build. Note: MAGI System requires Docker to run properly.');
				setupClaude();
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
		setupClaude();
	} catch (error) {
		console.error('\x1b[31m%s\x1b[0m', 'Failed to build Docker image.');
		console.error('Error: ', error instanceof Error ? error.message : String(error));

		// Ask if user wants to continue without Docker
		rl.question('Do you want to continue setup without the Docker image? (y/n): ', (answer) => {
			if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
				console.log('\x1b[33m%s\x1b[0m', 'Continuing without Docker image. Note: MAGI System requires Docker to run properly.');
				setupClaude();
			} else {
				console.log('Setup aborted. Please fix the Docker issue and try again.');
				process.exit(1);
			}
		});
	}
}

function setupClaude(): void {
	console.log('');
	console.log('\x1b[33m%s\x1b[0m', 'Step 4: Setting up Claude');

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
