/**
 * Execute Command Test Tool
 *
 * This tool tests the `execute_command` tool available in the Magi environment.
 */

interface ExecuteCommandOptions {
  command: string;
  requires_approval?: boolean;
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
  const { command, requires_approval = false, verbose = false } = options;

  if (!command) {
    return {
      success: false,
      error: 'Command option is required',
      command: command,
    };
  }

  if (verbose) {
    console.log(`Execute Command Test Tool executing command: "${command}" (requires_approval: ${requires_approval})`);
  }

  if (!tools || !tools.execute_command) {
    return {
      success: false,
      error: 'execute_command tool not available',
      command: command,
    };
  }

  try {
    // The execute_command tool returns the command output directly
    const output = await tools.execute_command({
      command: command,
      requires_approval: requires_approval,
    });

    if (verbose) {
      console.log('Command executed successfully. Output:');
      console.log(output);
    }

    return {
      success: true,
      output: output,
      command: command,
    };

  } catch (error: any) {
    console.error('Error executing command:', error);
    return {
      success: false,
      error: error.message || String(error),
      command: command,
    };
  }
}
