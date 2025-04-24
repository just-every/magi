#!/usr/bin/env node

/**
 * MAGI System Bootstrap
 *
 * This script handles the initial setup process before Node.js packages are installed.
 * It displays the welcome message and then runs npm install before proceeding with the
 * TypeScript-based setup.
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Display welcome message
console.log('\x1b[36m%s\x1b[0m', '┌─────────────────────────────────────┐');
console.log('\x1b[36m%s\x1b[0m', '│           MAGI SYSTEM SETUP         │');
console.log('\x1b[36m%s\x1b[0m', '└─────────────────────────────────────┘');
console.log('');

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('\x1b[36m%s\x1b[0m', 'Step 1: Installing core dependencies');
console.log('This may take a few minutes...');

try {
  // Install the core dependencies first
  console.log('Running npm install...');
  execSync('npm install', { stdio: 'inherit', cwd: rootDir });
  console.log('\x1b[32m%s\x1b[0m', '✓ Core dependencies installed successfully');

  // Now compile and run the TypeScript setup
  console.log('Compiling setup script...');
  execSync('npx tsc -p host', { stdio: 'inherit', cwd: rootDir });

  console.log('Running setup...');
  execSync('node setup/dist/setup.js', { stdio: 'inherit', cwd: rootDir });
} catch (error) {
  console.error('\x1b[31m%s\x1b[0m', 'Failed to complete setup:');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
