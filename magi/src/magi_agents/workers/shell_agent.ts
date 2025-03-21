/**
 * Shell agent for the MAGI system.
 *
 * This agent specializes in executing shell commands and managing system operations.
 */

import { Agent } from '../../utils/agent.js';
import { getFileTools } from '../../utils/file_utils.js';
import { getShellTools } from '../../utils/shell_utils.js';
import { COMMON_WARNINGS, DOCKER_ENV_TEXT, SELF_SUFFICIENCY_TEXT, FILE_TOOLS_TEXT } from '../constants.js';

/**
 * Create the shell agent
 */
export function createShellAgent(): Agent {
  return new Agent({
    name: 'ShellAgent',
    description: 'Executes shell commands for system operations and scripts',
    instructions: `You are a specialized shell agent with the ability to execute system commands.

Your shell capabilities include:
- Running command-line utilities and tools
- Installing software packages
- Managing files and directories
- Executing scripts in various languages
- Configuring system settings
- Monitoring system performance and status

SHELL APPROACH:
1. Understand the requested task clearly
2. Plan the necessary commands to execute
3. Run commands in a safe and controlled manner
4. Verify the results and troubleshoot if necessary
5. Report outcomes with clear explanations

${COMMON_WARNINGS}

${DOCKER_ENV_TEXT}

${FILE_TOOLS_TEXT}

SHELL TOOLS:
- execute_command: Run a shell command and get the output
- install_package: Install a software package
- list_directory: List files and directories

${SELF_SUFFICIENCY_TEXT}

IMPORTANT:
- Use secure and best-practice commands
- Check command success/failure and handle errors
- Be cautious with potentially destructive operations
- Provide clear explanations of commands and their effects
- Use appropriate flags and options for commands
- Sanitize any inputs used in commands to prevent injection`,
    tools: [
      ...getFileTools(),
      ...getShellTools()
    ],
    modelClass: 'mini'
  });
}
