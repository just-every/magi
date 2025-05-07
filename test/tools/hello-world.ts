/**
 * Hello World Tool
 *
 * A simple test tool to verify that magi-run-tool is working correctly.
 * It outputs information about the execution environment and demonstrates
 * basic TypeScript features
 */

// TypeScript interface for structured greeting
interface GreetingOptions {
  name?: string;
  language?: 'en' | 'es' | 'fr';
  verbose?: boolean;
}

// TypeScript interface for our result
interface ToolResult {
  success: boolean;
  greeting: string;
  timestamp: number;
  environment: {
    tools: string[];
    agentId: string;
    nodeVersion: string;
    hasFileAccess: boolean;
  };
  args: GreetingOptions;
}

/**
 * Main function for the hello-world tool
 * This will be executed by the magi-run-tool environment
 *
 * NOTE: Export this as the default export so our test runner can find it
 */
export default async function helloWorld(options: GreetingOptions = {}): Promise<ToolResult> {
  console.log('Hello World Tool executing...');

  // Extract options with defaults
  const {
    name = 'World',
    language = 'en',
    verbose = false
  } = options;

  // Get greeting in specified language
  let greeting: string;
  switch (language) {
    case 'es':
      greeting = `¡Hola, ${name}!`;
      break;
    case 'fr':
      greeting = `Bonjour, ${name}!`;
      break;
    default:
      greeting = `Hello, ${name}!`;
  }

  if (verbose) {
    console.log(`Selected language: ${language}`);
    console.log(`Greeting: ${greeting}`);
  }

  const toolCategories = tools ? Object.keys(tools) : [];

  // Check if we have file access
  let hasFileAccess = false;
  if (tools && tools.file_utils) {
    try {
      await tools.file_utils.read_file('./package.json');
      hasFileAccess = true;
      if (verbose) {
        console.log('Successfully verified file access');
      }
    } catch (error) {
      console.error('File access check failed:', error);
    }
  }

  // Create the result object
  const result: ToolResult = {
    success: true,
    greeting,
    timestamp: Date.now(),
    environment: {
      tools: toolCategories,
      agentId: agentId || 'unknown',
      nodeVersion: process.version,
      hasFileAccess
    },
    args: { name, language, verbose }
  };

  // Log the result if verbose
  if (verbose) {
    console.log('Tool execution completed with result:', JSON.stringify(result, null, 2));
  }

  return result;
}

// This code will run when the file is executed directly
console.log('Hello World Tool loaded');
