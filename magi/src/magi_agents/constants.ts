/**
 * Constants and shared text for MAGI agents.
 */
import {get_output_dir} from '../utils/file_utils.js';

// Agent descriptions for each specialized agent
export const AGENT_DESCRIPTIONS: Record<string, string> = {
	'ManagerAgent': 'Versatile task assignment - coordinates research, coding, planning, and coordination',
	'ReasoningAgent': 'Expert at complex reasoning and multi-step problem-solving',
	'CodeAgent': 'Specialized in programming, explaining, and modifying code in any language',
	'BrowserAgent': 'Controls a browser to interact with websites, fill forms, and extract data',
	'ShellAgent': 'Executes shell commands for system operations and scripts',
	'SearchAgent': 'Performs web searches for current information from various sources',
	'BrowserVisionAgent': 'Uses a computer vision to browse websites',
	'GodelMachine': 'Advanced structured pipeline for code authoring, testing, and PR management',
};

// Common warning text for all agents
export const COMMON_WARNINGS = `IMPORTANT WARNINGS:
1. Do not fabricate responses or guess when you can find the answer
2. If you encounter an error, try a different approach rather than giving up
3. Be precise and thorough in your work
4. Document what you're doing and why
5. Call a tool only once you have all the required parameters
6. Make sure to validate your results before reporting them`;

// Docker environment information
export const DOCKER_ENV_TEXT = `DOCKER ENVIRONMENT INFO:
You are running in a secure Docker container with the following setup:
- Debian Bookworm with Node.js and standard development tools
- Network access for web searches and browsing
- Access to shell commands for installing packages and running code
- You can make any necessary changes in this environment without restrictions
- You have access to read and write files in ${get_output_dir()}
- Files in ${get_output_dir()} can be read by the person who receives your response`;

// Self-sufficiency guidance
export const SELF_SUFFICIENCY_TEXT = `SELF-SUFFICIENCY PRINCIPLES:
Assume you have been given all the information necessary to complete the task.
1. Use your tools without requesting additional information
2. If at first you don't succeed, try diverse actions to try again from multiple angles
3. If in doubt, make an educated guess about the best possible approach
4. Return your final outcome and include any educated guesses you had to make`;

// File tools text
export const FILE_TOOLS_TEXT = `FILE TOOLS:
- read_file: Read files from the file system (provide absolute path)
- write_file: Write content to files (provide absolute path and content)`;
