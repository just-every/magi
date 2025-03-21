/**
 * Code agent for the MAGI system.
 *
 * This agent specializes in writing, explaining, and modifying code using the Claude CLI.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { Agent } from '../../utils/agent.js';
import { getFileTools } from '../../utils/file_utils.js';
import { ToolDefinition } from '../../types.js';
import { COMMON_WARNINGS, DOCKER_ENV_TEXT, SELF_SUFFICIENCY_TEXT, FILE_TOOLS_TEXT } from '../constants.js';

// Promisify exec for async/await usage
const execAsync = promisify(exec);

/**
 * Check if Claude CLI is available
 * @returns Promise with boolean indicating if Claude CLI is available
 */
async function isClaudeCLIAvailable(): Promise<boolean> {
  // For now, return false to avoid using Claude CLI until we can debug the issues
  console.log('[CodeAgent] Skipping Claude CLI due to timeout issues');
  return false;

  // Original implementation - commented out for now
  /*
  try {
    const { stdout, stderr } = await execAsync('which claude');
    return !!stdout && !stderr;
  } catch (error) {
    console.warn('Claude CLI not available:', error);
    return false;
  }
  */
}

/**
 * Run Claude CLI with a prompt
 * Uses --print and --dangerously-skip-permissions flags for non-interactive execution.
 *
 * @param prompt - The prompt to send to Claude
 * @param working_directory - Optional working directory for file operations
 * @returns The response from Claude CLI
 */
async function runClaudeCLI(prompt: string, working_directory?: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    // First check if Claude CLI is available
    const cliAvailable = await isClaudeCLIAvailable();
    if (!cliAvailable) {
      console.log('[CodeAgent] Claude CLI not available, using default agent behavior instead');
      return {
        success: false,
        output: '',
        error: 'Claude CLI not available. Using default agent behavior instead.'
      };
    }

    // Set cwd to working directory if provided, otherwise use current directory
    const options: any = {
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      timeout: 30000, // 30 second timeout
    };

    if (working_directory) {
      options.cwd = working_directory;
    }

    // Escape quotes in the prompt for shell safety
    const safePrompt = prompt.replace(/"/g, '\\"');

    // Claude CLI command with appropriate flags
    const command = `claude --print --dangerously-skip-permissions -p "${safePrompt}"`;

    console.log(`[CodeAgent] Running Claude CLI: ${command.substring(0, 100)}...`);
    let stdout = '';

    try {
      const result = await execAsync(command, options);
      stdout = result.stdout.toString();

      if (result.stderr) {
        console.warn(`[CodeAgent] Claude CLI warning: ${result.stderr}`);
      }

      // Log a sample of the output for debugging
      console.log(`[CodeAgent] Claude CLI output first 100 chars: ${stdout.substring(0, 100)}...`);

      return {
        success: true,
        output: stdout
      };
    } catch (execError: any) {
      console.error('[CodeAgent] Claude CLI execution error:', execError.message);
      throw execError;
    }
  } catch (error: any) {
    console.error('[CodeAgent] Error running Claude CLI:', error);
    return {
      success: false,
      output: '',
      error: `Error running Claude CLI: ${error?.message || String(error)}`
    };
  }
}

/**
 * AICoder main function that gets called by the agent
 *
 * @param prompt - The prompt to send to Claude
 * @param working_directory - Optional working directory for file operations
 * @returns The response
 */
async function AICoder(prompt: string, working_directory?: string): Promise<string> {
  try {
    console.log(`[CodeAgent] AICoder called with prompt: ${prompt.substring(0, 100)}...`);
    console.log(`[CodeAgent] Working directory: ${working_directory || 'not specified'}`);

    const result = await runClaudeCLI(prompt, working_directory);

    if (result.success) {
      console.log(`[CodeAgent] AICoder succeeded, returning ${result.output.length} characters of output`);
      return result.output;
    } else {
      // If Claude CLI fails, provide a helpful error message
      const errorMessage = result.error || 'Unknown error';
      console.log(`[CodeAgent] AICoder failed: ${errorMessage}`);

      // If the error is that the CLI is not available, make it clear we're returning a fallback
      if (errorMessage.includes('Claude CLI not available')) {
        console.log('[CodeAgent] Falling back to regular agent functionality');
        return `I attempted to use the specialized Claude CLI tool, but it's not available in this environment. I'll solve your request directly.\n\nHere's my solution to create "${prompt}":\n`;
      }

      return `I encountered an issue with the coding task: ${errorMessage}\n\nHere's my attempt to solve your request without the specialized coding tool:\n\n${prompt}`;
    }
  } catch (error: any) {
    console.error('[CodeAgent] Unexpected error in AICoder:', error);
    return `There was an unexpected error while processing your coding task: ${error?.message || String(error)}\n\nI'll try to help with your request directly:\n\n${prompt}`;
  }
}

/**
 * AICoder tool definition
 */
export const AICoderTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'AICoder',
    description: 'Runs AICoder with the provided prompt to execute any coding tasks, no matter how complicated.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The coding task or question to process'
        },
        working_directory: {
          type: 'string',
          description: 'Optional working directory for file operations'
        }
      },
      required: ['prompt']
    }
  }
};

/**
 * Create the code agent
 */
export function createCodeAgent(): Agent {
  return new Agent({
    name: 'CodeAgent',
    description: 'Specialized in writing, explaining, and modifying code in any language',
    instructions: `You manage the tool \`AICoder\`.

Your \`AICoder\` tool is the most advanced AI coding tool on the planet. Think of it as a senior developer at a FANG company who is an expert in all programming languages and frameworks. It can write, modify, and explain code in any language. It can also run code and test it.

You work with \`AICoder\` to get the job done. In most cases you should just pass your instructions on to \`AICoder\` and let it do the work. If there's an error you can try again until it completes the task.

**\`AICoder\` only knows the information you provide it in each \`prompt\`, and can read the file system at the \`working_directory\` - it has no additional context.** Please give \`AICoder\` all the information it needs to complete the task in your prompt. \`AICoder\` does not know what previous prompts were sent to it. You should summarize these before passing them to \`AICoder\` if you want it to have context.

${DOCKER_ENV_TEXT}

${FILE_TOOLS_TEXT}

${SELF_SUFFICIENCY_TEXT}

${COMMON_WARNINGS}`,
    tools: [
      ...getFileTools(),
      AICoderTool
    ],
    modelClass: 'standard'
  });
}

// Export the AICoder function for tool implementation
export { AICoder };
