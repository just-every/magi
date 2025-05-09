/**
 * Execute Command Test Tool
 *
 * This tool tests the `execute_command` tool available in the Magi environment.
 * The `execute_command` function is injected at runtime by the tool executor.
 * Type definitions are provided by the ambient declarations in tool-types.d.ts.
 *
 * NOTE: The import below is just to satisfy TypeScript and is not used at runtime.
 */

interface ExecuteCommandOptions {
  command?: string;
  verbose?: boolean;
}

interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  command: string;
}

/**
 * Main function for the execute-command tool
 */
export default async function executeCommandTest(options: ExecuteCommandOptions): Promise<ToolResult> {
  const { command = "pwd", verbose = false } = options;

  if (!command) {
    return {
      success: false,
      error: 'Command option is required',
      command: command,
    };
  }

  if (verbose) {
    console.log(`Execute Command Test Tool executing command: "${command}"`);
  }

  try {
    // Execute the command directly
    const output = await execute_command(command);

    if (verbose) {
      console.log('Command executed successfully. Output:');
      console.log(output);
    }

    return {
      success: true,
      output: output,
      command: command,
    };

  } catch (error: unknown) {
    console.error('Error executing command:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      command: command,
    };
  }
}
