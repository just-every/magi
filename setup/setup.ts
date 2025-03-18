#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { execSync, spawn } from 'child_process';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\x1b[36m%s\x1b[0m', '┌─────────────────────────────────────┐');
console.log('\x1b[36m%s\x1b[0m', '│           MAGI SYSTEM SETUP         │');
console.log('\x1b[36m%s\x1b[0m', '└─────────────────────────────────────┘');
console.log('');

const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');

// Check if .env already exists
const envExists = fs.existsSync(envPath);

let openaiApiKey = '';

function getOpenAIKey(): void {
  console.log('\x1b[33m%s\x1b[0m', 'Step 1: Setting up OpenAI API Key');
  
  // Check if .env file already exists
  if (fs.existsSync(envPath)) {
    console.log('\x1b[33m%s\x1b[0m', 'A .env file already exists.');
    
    // Try to read the current API key
    try {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const apiKeyMatch = envContent.match(/OPENAI_API_KEY=([^\s]+)/);
      
      if (apiKeyMatch && apiKeyMatch[1]) {
        console.log('Current API key found: ' + apiKeyMatch[1].substring(0, 4) + '...' + apiKeyMatch[1].substring(apiKeyMatch[1].length - 4));
      }
    } catch (err) {
      // Ignore read errors
    }
    
    rl.question('Do you want to update the OpenAI API Key? (y/n): ', (answer) => {
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        promptForApiKey();
      } else {
        console.log('\x1b[32m%s\x1b[0m', '✓ Using existing OpenAI API key');
        installDependencies();
      }
    });
    return;
  }
  
  promptForApiKey();
}

function promptForApiKey(): void {
  console.log('You need an OpenAI API key to use this system.');
  console.log('Get your API key at: \x1b[34mhttps://platform.openai.com/api-keys\x1b[0m');
  
  rl.question('Enter your OpenAI API Key: ', (answer) => {
    if (!answer || answer.trim() === '') {
      console.log('\x1b[31m%s\x1b[0m', 'API key cannot be empty. Please try again.');
      promptForApiKey();
      return;
    }
    
    openaiApiKey = answer.trim();
    saveEnvFile();
  });
}

function saveEnvFile(): void {
  try {
    // Create or update .env file
    fs.writeFileSync(envPath, `OPENAI_API_KEY=${openaiApiKey}\n`);
    console.log('\x1b[32m%s\x1b[0m', '✓ OpenAI API key saved to .env file');
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
    execSync('npm ci', { stdio: 'inherit', cwd: rootDir });
    console.log('\x1b[32m%s\x1b[0m', '✓ Dependencies installed successfully');
    buildDockerImage();
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', 'Failed to install dependencies. Please try again.');
    process.exit(1);
  }
}

function checkDockerInstalled(): boolean {
  try {
    execSync('docker --version', { stdio: 'pipe' });
    return true;
  } catch (error) {
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
    
    execSync('npm run setup-claude', { stdio: 'inherit', cwd: rootDir });
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
  console.log('  ts-node setup/setup.ts [options]');
  console.log('  npm run setup [-- options]');
  console.log('');
  console.log('Options:');
  console.log('  -h, --help     Show this help message');
  console.log('');
  process.exit(0);
}

// Start setup process
getOpenAIKey();