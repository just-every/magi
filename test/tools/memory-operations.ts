/**
 * Memory Operations Test Tool
 *
 * This tool tests the memory-related tools available in the Magi environment:
 * `save_memory`, `find_memory`, and `delete_memory`.
 */


interface MemoryOperationsOptions {
  verbose?: boolean;
}

interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
  savedItem?: { data: string; timestamp: number; };
  foundItem?: string | { data: string; timestamp: number; }; // find_memory might return string or parsed object
}

/**
 * Main function for the memory-operations tool
 */
export default async function memoryOperationsTest(options: MemoryOperationsOptions = {}): Promise<ToolResult> {
  const { verbose = false } = options;

  if (verbose) {
    console.log('Memory Operations Test Tool executing...');
  }

  if (!tools || !tools.save_memory || !tools.find_memory || !tools.delete_memory) {
    return {
      success: false,
      error: 'One or more memory tools (save_memory, find_memory, delete_memory) not available',
    };
  }

  const testMemoryKey = 'test_memory_item';
  const testMemoryValue = { data: 'This is a test_memory_item', timestamp: Date.now() };

  try {
    // Test 1: Save memory
    if (verbose) console.log(`Attempting to save memory with term type 'long' and content: "${JSON.stringify(testMemoryValue)}"`);
    const saveResult = await tools.save_memory('long', JSON.stringify(testMemoryValue));
    if (verbose) console.log('Save memory result:', saveResult);

    // Extract the ID from the saveResult string
    const idMatch = typeof saveResult === 'string' ? saveResult.match(/\[(\d+)\]/) : null;
    const memoryId = idMatch ? idMatch[1] : null;

    if (!memoryId) {
      return {
        success: false,
        error: 'Failed to extract memory ID from save result',
        savedItem: testMemoryValue,
      };
    }
    if (verbose) console.log(`Extracted memory ID: ${memoryId}`);

    // Test 2: Find memory
    if (verbose) console.log(`Attempting to find memory with query term: "${testMemoryKey}"`);
    const findResultBeforeDelete = await tools.find_memory([testMemoryKey]);
    if (verbose) console.log('Find memory result (before delete):', findResultBeforeDelete);

    if (!findResultBeforeDelete || !(findResultBeforeDelete.includes(testMemoryValue.data) && findResultBeforeDelete.includes(testMemoryValue.timestamp))) {
      return {
        success: false,
        error: `Find memory failed: Expected to find "${JSON.stringify(testMemoryValue)}", but found "${findResultBeforeDelete}"`,
        savedItem: testMemoryValue,
        foundItem: findResultBeforeDelete,
      };
    }
    if (verbose) console.log('Find memory verification successful.');

    // Test 3: Delete memory
    if (verbose) console.log(`Attempting to delete memory with key: "${memoryId}"`);
    const deleteResult = await tools.delete_memory('long', parseInt(memoryId));
    if (verbose) console.log('Delete memory result:', deleteResult);

    // Test 4: Verify memory is deleted
    if (verbose) console.log(`Attempting to find memory with query term: "${testMemoryKey}" after deletion`);
    const findResultAfterDelete = await tools.find_memory([testMemoryKey]);
    if (verbose) console.log('Find memory result (after delete):', findResultAfterDelete);

    // Verify memory is no longer found (find_memory should return null or empty string if not found)
    if (findResultAfterDelete && findResultAfterDelete.includes(testMemoryValue.data) && findResultAfterDelete.includes(testMemoryValue.timestamp)) {
         return {
            success: false,
            error: `Delete memory failed: Expected memory with key "${memoryId}" to be deleted, but it was still found with value "${findResultAfterDelete}"`,
            savedItem: testMemoryValue,
            foundItem: findResultAfterDelete,
        };
    }
    if (verbose) console.log('Delete memory verification successful.');


    // All tests passed
    return {
      success: true,
      message: 'Memory operations tested successfully (save, find, delete)',
    };

  } catch (error: unknown) { // Use unknown for caught errors
    console.error('Error during memory operations test:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error), // Safely access message
      savedItem: testMemoryValue,
    };
  }
}
