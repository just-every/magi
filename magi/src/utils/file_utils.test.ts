import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    read_file,
    write_file,
    write_unique_file,
    get_output_dir,
    set_file_test_mode,
} from './file_utils.js';

// Mock fs and path modules
vi.mock('fs', () => ({
    default: {
        readFileSync: vi.fn(),
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
        existsSync: vi.fn(),
        statSync: vi.fn(),
        readdirSync: vi.fn(),
    },
}));

vi.mock('path', () => ({
    default: {
        join: vi.fn((...args) => args.join('/')),
        dirname: vi.fn(p => p.split('/').slice(0, -1).join('/')),
        basename: vi.fn((p, ext) => {
            const base = p.split('/').pop() || '';
            return ext && base.endsWith(ext)
                ? base.slice(0, -ext.length)
                : base;
        }),
        extname: vi.fn(p => {
            const parts = p.split('.');
            return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
        }),
        // Add mock for resolve - use a simple join for testing purposes or mock actual resolve if needed
        resolve: vi.fn((...args) => args.join('/')),
    },
}));

// Save original process.env
const originalEnv = { ...process.env };

describe('file_utils', () => {
    beforeEach(() => {
        // Setup mocks and environment
        vi.resetAllMocks();
        process.env.PROCESS_ID = 'test-process-id';
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        // Mock fs.existsSync to return true for all paths to avoid file system errors
        vi.mocked(fs.existsSync).mockReturnValue(true);

        // Mock fs.mkdirSync to avoid actual directory creation
        vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);

        // Set file test mode to true for some tests
        set_file_test_mode(true);
    });

    afterEach(() => {
        // Reset environment
        process.env = { ...originalEnv };
        vi.restoreAllMocks();
    });

    describe('read_file', () => {
        it('should read a file correctly', () => {
            const mockContent = 'file content';
            const filePath = '/path/to/file.txt';

            // Setup mock return
            vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

            const result = read_file(filePath);

            expect(fs.readFileSync).toHaveBeenCalledWith(filePath, 'utf-8');
            expect(result).toBe(mockContent);
        });

        it('should throw an error when file read fails', () => {
            const filePath = '/path/to/nonexistent/file.txt';
            const mockError = new Error('File not found');

            // Setup mock to throw
            vi.mocked(fs.readFileSync).mockImplementation(() => {
                throw mockError;
            });

            expect(() => read_file(filePath)).toThrow(/Error reading file/);
        });
    });

    describe('write_file', () => {
        it('should write a string to a file correctly', () => {
            const filePath = '/path/to/file.txt';
            const content = 'file content';

            // Setup directory existence check
            vi.mocked(fs.existsSync).mockReturnValue(true);

            const result = write_file(filePath, content);

            expect(fs.writeFileSync).toHaveBeenCalledWith(
                filePath,
                content,
                'utf-8'
            );
            expect(result).toContain('File written successfully');
        });

        it('should create directory if it does not exist', () => {
            const filePath = '/path/to/new/file.txt';
            const content = 'file content';
            const dirPath = '/path/to/new';

            // Setup directory existence check
            vi.mocked(fs.existsSync).mockReturnValue(false);
            vi.mocked(path.dirname).mockReturnValue(dirPath);

            write_file(filePath, content);

            expect(fs.mkdirSync).toHaveBeenCalledWith(dirPath, {
                recursive: true,
            });
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                filePath,
                content,
                'utf-8'
            );
        });

        it('should handle ArrayBuffer content', () => {
            const filePath = '/path/to/file.bin';
            const content = new ArrayBuffer(8);

            // Setup directory existence check
            vi.mocked(fs.existsSync).mockReturnValue(true);

            write_file(filePath, content);

            // Verify writeFileSync is called with Buffer.from(content)
            expect(fs.writeFileSync).toHaveBeenCalled();
            const callArgs = vi.mocked(fs.writeFileSync).mock.calls[0];
            expect(callArgs[0]).toBe(filePath);
            expect(Buffer.isBuffer(callArgs[1])).toBe(true);
        });
    });

    describe('write_unique_file', () => {
        it('should use original filename if it does not exist', () => {
            const filePath = '/path/to/file.txt';
            const content = 'file content';

            // Setup file existence check
            vi.mocked(fs.existsSync).mockReturnValue(false);

            const result = write_unique_file(filePath, content);

            expect(fs.writeFileSync).toHaveBeenCalledWith(
                filePath,
                content,
                'utf-8'
            );
            expect(result).toContain('File written successfully');
        });

        it('should increment filename if original file exists', () => {
            const filePath = '/path/to/file.txt';
            const uniqueFilePath = '/path/to/file (1).txt';
            const content = 'file content';

            // First check returns true (file exists), second returns false (unique file doesn't exist)
            vi.mocked(fs.existsSync).mockImplementation(path => {
                return path === filePath;
            });

            // Setup path module mocks
            vi.mocked(path.dirname).mockReturnValue('/path/to');
            vi.mocked(path.basename).mockReturnValue('file');
            vi.mocked(path.extname).mockReturnValue('.txt');
            vi.mocked(path.join).mockImplementation((dir, filename) => {
                if (filename === 'file (1).txt') {
                    return uniqueFilePath;
                }
                return `${dir}/${filename}`;
            });

            const result = write_unique_file(filePath, content);

            expect(fs.existsSync).toHaveBeenCalledTimes(3);
            expect(result).toContain('File already exists');
            expect(result).toContain('File written successfully');
        });
    });

    describe('get_output_dir', () => {
        it('should create main process directory when first called', () => {
            // In test mode, the base path should be relative
            const expectedBase = './test_output';
            const processId = 'test-process-id'; // Use the default from beforeEach
            const expectedDir = path.join(expectedBase, processId);

            // Mock path.join to reflect actual joining behavior
            vi.mocked(path.join).mockImplementation((...args) =>
                args.join('/')
            );
            // Mock existsSync to ensure mkdir is called
            vi.mocked(fs.existsSync).mockReturnValue(false);

            const result = get_output_dir();

            // Check the call to path.join for the process directory construction
            expect(path.join).toHaveBeenCalledWith(expectedBase, processId);
            // Check that mkdirSync was called for the base and final directory
            expect(fs.mkdirSync).toHaveBeenCalledWith(expectedBase, {
                recursive: true,
            });
            expect(fs.mkdirSync).toHaveBeenCalledWith(expectedDir, {
                recursive: true,
            });
            expect(result).toBe(expectedDir);
        });

        it('should create subdirectory when specified', () => {
            const expectedBase = './test_output'; // Base path in test mode
            const processId = 'test-process-id'; // Use the default from beforeEach
            const mainDir = path.join(expectedBase, processId);
            const subDir = 'subdir';
            const expectedDir = path.join(mainDir, subDir);

            // Mock path.join to reflect actual joining behavior
            vi.mocked(path.join).mockImplementation((...args) =>
                args.join('/')
            );

            // Mock existsSync: false for base, false for main process dir, false for subdir
            // This ensures mkdirSync gets called for all levels
            vi.mocked(fs.existsSync).mockImplementation(p => {
                const resolvedPath = path.resolve(p.toString());
                if (resolvedPath === path.resolve(expectedBase)) return false;
                if (resolvedPath === path.resolve(mainDir)) return false;
                if (resolvedPath === path.resolve(expectedDir)) return false;
                return false; // Default
            });

            const result = get_output_dir(subDir);

            // Check path.join calls: one for main dir, one for subdir
            expect(path.join).toHaveBeenCalledWith(expectedBase, processId);
            expect(path.join).toHaveBeenCalledWith(mainDir, subDir);
            // Check mkdirSync calls: one for base, one for main, one for subdir (due to existsSync mock)
            expect(fs.mkdirSync).toHaveBeenCalledWith(expectedBase, {
                recursive: true,
            });
            expect(fs.mkdirSync).toHaveBeenCalledWith(mainDir, {
                recursive: true,
            });
            expect(fs.mkdirSync).toHaveBeenCalledWith(expectedDir, {
                recursive: true,
            });
            expect(result).toBe(expectedDir);
        });
    });
});
