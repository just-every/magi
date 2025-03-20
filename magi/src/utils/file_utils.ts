/**
 * File utility functions for the MAGI system.
 */

import fs from 'fs';
import path from 'path';
import { ToolDefinition } from '../types.js';

/**
 * Read a file from the file system
 * 
 * @param filePath - Path to the file to read
 * @returns File contents as a string
 */
export function readFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    throw new Error(`Error reading file ${filePath}: ${error}`);
  }
}

/**
 * Write content to a file
 * 
 * @param filePath - Path to write the file to
 * @param content - Content to write to the file
 * @returns Success message with the path
 */
export function writeFile(filePath: string, content: string): string {
  try {
    // Ensure the directory exists
    const directory = path.dirname(filePath);
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
    
    // Write the file
    fs.writeFileSync(filePath, content, 'utf-8');
    return `File written successfully to ${filePath}`;
  } catch (error) {
    throw new Error(`Error writing file ${filePath}: ${error}`);
  }
}

/**
 * Read file tool definition
 */
export const readFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'read_file',
    description: 'Read the contents of a file from the file system',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file to read'
        }
      },
      required: ['file_path']
    }
  }
};

/**
 * Write file tool definition
 */
export const writeFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'write_file',
    description: 'Write content to a file in the file system',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to write the file to'
        },
        content: {
          type: 'string',
          description: 'Content to write to the file'
        }
      },
      required: ['file_path', 'content']
    }
  }
};

/**
 * Get all file tools as an array of tool definitions
 */
export function getFileTools(): ToolDefinition[] {
  return [
    readFileTool,
    writeFileTool
  ];
}

/**
 * File tool implementations mapped by name for easy lookup
 */
export const fileToolImplementations: Record<string, Function> = {
  'read_file': readFile,
  'write_file': writeFile
};