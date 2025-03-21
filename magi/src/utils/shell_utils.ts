/**
 * Shell utility functions for the MAGI system.
 * 
 * This module provides tools for shell command execution and system operations.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { ToolDefinition } from '../types.js';

// Promisify exec for async/await usage
const execAsync = promisify(exec);

/**
 * Execute a shell command
 * 
 * @param command - Shell command to execute
 * @returns Command output and error if any
 */
export async function executeCommand(command: string): Promise<{ success: boolean; stdout: string; stderr: string; message: string }> {
  try {
    // Check for potentially dangerous commands
    const dangerousCommands = [
      'rm -rf', 'mkfs', 'dd', 'sudo', 'su', 'chmod 777'
    ];
    
    for (const dangerous of dangerousCommands) {
      if (command.includes(dangerous)) {
        return {
          success: false,
          stdout: '',
          stderr: '',
          message: `Potentially dangerous command detected: "${dangerous}". Command execution aborted.`
        };
      }
    }
    
    // Execute the command
    const { stdout, stderr } = await execAsync(command, { maxBuffer: 1024 * 1024 });
    
    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      message: `Command executed: ${command}`
    };
  } catch (error: any) {
    console.error(`Error executing command "${command}":`, error);
    return {
      success: false,
      stdout: '',
      stderr: error?.stderr || '',
      message: `Error executing command: ${error?.message || String(error)}`
    };
  }
}

/**
 * Install a package
 * 
 * @param package_name - Name of the package to install
 * @param package_manager - Package manager to use (apt, npm, pip)
 * @returns Installation result
 */
export async function installPackage(
  package_name: string,
  package_manager: 'apt' | 'npm' | 'pip' = 'apt'
): Promise<{ success: boolean; stdout: string; stderr: string; message: string }> {
  try {
    // Sanitize package name
    const sanitizedPackage = package_name.replace(/[;&|<>$\n]/g, '');
    
    // Different install commands based on package manager
    let command = '';
    switch (package_manager) {
      case 'apt':
        command = `apt-get update && apt-get install -y ${sanitizedPackage}`;
        break;
      case 'npm':
        command = `npm install ${sanitizedPackage}`;
        break;
      case 'pip':
        command = `pip install ${sanitizedPackage}`;
        break;
      default:
        return {
          success: false,
          stdout: '',
          stderr: '',
          message: `Unsupported package manager: ${package_manager}`
        };
    }
    
    // Execute the install command
    const { stdout, stderr } = await execAsync(command, { maxBuffer: 1024 * 1024 });
    
    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      message: `Package ${sanitizedPackage} installed using ${package_manager}`
    };
  } catch (error: any) {
    console.error(`Error installing package ${package_name}:`, error);
    return {
      success: false,
      stdout: '',
      stderr: error?.stderr || '',
      message: `Error installing package: ${error?.message || String(error)}`
    };
  }
}

/**
 * File info interface
 */
interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: string;
}

/**
 * List files in a directory
 * 
 * @param directory - Directory path to list
 * @returns List of files and directories
 */
export async function listDirectory(directory: string): Promise<{ success: boolean; files: FileInfo[]; message: string }> {
  try {
    // Read the directory
    const files = fs.readdirSync(directory);
    
    // Get file stats for each entry
    const filesWithInfo = await Promise.all(
      files.map(async (file) => {
        const fullPath = `${directory}/${file}`;
        try {
          const stats = fs.statSync(fullPath);
          return {
            name: file,
            path: fullPath,
            isDirectory: stats.isDirectory(),
            size: stats.size,
            modified: stats.mtime.toISOString()
          };
        } catch (error) {
          // If we can't stat a file, just return the name
          return {
            name: file,
            path: fullPath,
            isDirectory: false,
            size: 0,
            modified: new Date().toISOString()
          };
        }
      })
    );
    
    return {
      success: true,
      files: filesWithInfo,
      message: `Listed ${filesWithInfo.length} entries in ${directory}`
    };
  } catch (error: any) {
    console.error(`Error listing directory ${directory}:`, error);
    return {
      success: false,
      files: [],
      message: `Error listing directory: ${error?.message || String(error)}`
    };
  }
}

/**
 * Execute command tool definition
 */
export const executeCommandTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'execute_command',
    description: 'Execute a shell command and get the output',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute'
        }
      },
      required: ['command']
    }
  }
};

/**
 * Install package tool definition
 */
export const installPackageTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'install_package',
    description: 'Install a software package using the specified package manager',
    parameters: {
      type: 'object',
      properties: {
        package_name: {
          type: 'string',
          description: 'Name of the package to install'
        },
        package_manager: {
          type: 'string',
          description: 'Package manager to use (apt, npm, pip)',
          enum: ['apt', 'npm', 'pip']
        }
      },
      required: ['package_name']
    }
  }
};

/**
 * List directory tool definition
 */
export const listDirectoryTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_directory',
    description: 'List files and directories in the specified path',
    parameters: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'Directory path to list'
        }
      },
      required: ['directory']
    }
  }
};

/**
 * Get all shell tools as an array of tool definitions
 */
export function getShellTools(): ToolDefinition[] {
  return [
    executeCommandTool,
    installPackageTool,
    listDirectoryTool
  ];
}

/**
 * Shell tool implementations mapped by name for easy lookup
 */
export const shellToolImplementations: Record<string, (...args: any[]) => any | Promise<any>> = {
  'execute_command': executeCommand,
  'install_package': installPackage,
  'list_directory': listDirectory
};