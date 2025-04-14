/**
 * Shared test mocks and utilities for testing
 */

import { vi } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Setup common mocks for tests that need to handle file operations without actually accessing the file system
 */
export function setupFileMocks() {
  // First, backup the real fs and path methods to restore during cleanup
  const realFs = { ...fs };
  const realPath = { ...path };

  // Mock file system functions to prevent actual file system operations
  vi.mock('fs', () => ({
    default: {
      readFileSync: vi.fn().mockReturnValue('mock file content'),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      existsSync: vi.fn().mockReturnValue(true),
      statSync: vi.fn().mockReturnValue({
        isDirectory: () => true
      }),
      readdirSync: vi.fn().mockReturnValue([]),
    },
  }));

  vi.mock('path', () => ({
    default: {
      join: vi.fn((...args) => args.join('/')),
      dirname: vi.fn((p) => p.split('/').slice(0, -1).join('/')),
      basename: vi.fn((p, ext) => {
        const base = p.split('/').pop() || '';
        return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
      }),
      extname: vi.fn((p) => {
        const parts = p.split('.');
        return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
      }),
    },
  }));

  return {
    // Function to restore real fs and path functions
    restore: () => {
      vi.unstubAllGlobals();
    }
  };
}

/**
 * Setup environment variables for testing model providers
 */
export function setupModelProviderTestEnv() {
  // Set up mock API keys
  process.env.OPENAI_API_KEY = 'sk-test123456';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test123456';
  process.env.GOOGLE_API_KEY = 'test-google-key';
  process.env.XAI_API_KEY = 'xai-test123456';
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  process.env.PROCESS_ID = 'test-process-id';
}
