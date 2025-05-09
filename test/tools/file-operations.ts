/**
 * File Operations Test Tool
 *
 * This tool tests file system operations within the magi-run-tool environment.
 * It verifies that the tool has proper access to read and write files in the Docker container.
 */
import fs from 'fs';

// Interface for tool options
interface FileOptions {
  readPath?: string;     // Path to read
  writePath?: string;    // Path to write sample data
  writeContent?: string; // Content to write (if not provided, a timestamp will be used)
  verbose?: boolean;     // Enable verbose output
}

// Result interface
interface FileResult {
  success: boolean;
  error?: string;
  readResult?: {
    path: string;
    exists: boolean;
    size?: number;
    excerpt?: string;
  };
  writeResult?: {
    path: string;
    success: boolean;
    bytesWritten?: number;
  };
  environment: {
    currentDirectory: string;
    platform: string;
  }
}

/**
 * Test file operations within the magi-run-tool environment
 *
 * @param options Options for file operations
 * @returns Results of the file operations
 */
export default async function fileOperations(options: FileOptions = {}): Promise<FileResult> {
  // Extract options with defaults
  const {
    readPath = './package.json',
    writePath = './tmp-test-file.txt',
    writeContent,
    verbose = false
  } = options;

  const log = (message: string) => {
    if (verbose) console.log(message);
  };

  log('Starting file operations test tool...');



  const result: FileResult = {
    success: true,
    environment: {
      currentDirectory: process.cwd(),
      platform: process.platform,
    }
  };

  // Test reading a file
  try {
    log(`Reading file: ${readPath}`);
    const content = await read_file(readPath);
    const exists = !!content;
    const size = content?.length || 0;

    // Store read result
    result.readResult = {
      path: readPath,
      exists,
      size,
      excerpt: exists ? content.substring(0, 100) + (content.length > 100 ? '...' : '') : undefined
    };

    log(`File read successful. Size: ${size} bytes`);
  } catch (error) {
    log(`Error reading file: ${error.message}`);
    result.readResult = {
      path: readPath,
      exists: false
    };
    result.success = false;
    result.error = `File read error: ${error.message}`;
  }

  // Test writing a file
  try {
    // Generate content if not provided
    const content = writeContent || `Test content generated at ${new Date().toISOString()}\nRandom number: ${Math.random()}\n`;
    log(`Writing to file: ${writePath}`);
    log(`Content: ${content}`);

    await write_file(writePath, content);

    // Verify the file was written by reading it back
    const writtenContent = await read_file(writePath);
    const success = content === writtenContent;

    // Store write result
    result.writeResult = {
      path: writePath,
      success,
      bytesWritten: content.length
    };

    log(`File write ${success ? 'successful' : 'verification failed'}`);

    // Clean up the test file
    try {
      log(`Cleaning up test file: ${writePath}`);
      // Use the fs module to unlink the file
      fs.unlink(writePath, () => {});
      log('Test file cleaned up');
    } catch (cleanupError) {
      log(`Warning: Could not clean up test file: ${cleanupError.message}`);
    }
  } catch (error) {
    log(`Error writing file: ${error.message}`);
    result.writeResult = {
      path: writePath,
      success: false
    };
    result.success = false;
    result.error = (result.error ? result.error + '; ' : '') + `File write error: ${error.message}`;
  }

  if (verbose) {
    log('File operations test completed');
    log(`Result: ${JSON.stringify(result, null, 2)}`);
  }

  return result;
}

// Will be executed when the file is run directly
console.log('File Operations Test Tool loaded');
