/**
 * Constants and shared text for MAGI agents.
 */
import {get_output_dir} from '../utils/file_utils.js';

// Agent descriptions for each specialized agent
export const AGENT_DESCRIPTIONS: Record<string, string> = {
	'ManagerAgent': 'ManagerAgent: Versatile task assignment - coordinates research, coding, planning, and coordination',
	'ReasoningAgent': 'ReasoningAgent: Expert at complex reasoning and multi-step problem-solving',
	'CodeAgent': 'CodeAgent: Specialized in programming, explaining, and modifying code in any language. Has skills equivalent to a senior software engineer.',
	'BrowserAgent': 'BrowserAgent: Uses a browser to interact with websites, fill forms, and extract data. Can act like any human user.',
	'ShellAgent': 'ShellAgent: Executes shell commands for system operations in your docker container',
	'SearchAgent': 'SearchAgent: Performs complex web searches for current information from various sources',
	'BrowserVisionAgent': 'BrowserVisionAgent: Uses a computer vision to browse websites',
	'GodelMachine': 'GodelMachine: Advanced structured pipeline for code authoring, testing, and PR management',
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
export const DOCKER_ENV_TEXT = `ENVIRONMENT INFO:
- You are running in a Docker container with Debian Bookworm
- You can run programs and modify you environment without fear of permanent damage
- You have full network access for web searches and browsing
- Both you and whoever receives your response has read/write access to all files in ${get_output_dir()}`;

// Self-sufficiency guidance
export const SELF_SUFFICIENCY_TEXT = `SELF-SUFFICIENCY:
Assume you have been given all the information necessary to complete the task.
1. Complete your task using any resources available to you without requesting additional information
2. If at first you don't succeed, try diverse actions to try again from multiple angles
3. If in doubt, make an educated guess about the best possible approach
4. Return your final outcome and include any educated guesses you had to make`;

export const SIMPLE_SELF_SUFFICIENCY_TEXT = `SELF-SUFFICIENCY:
Assume you have been given all the information necessary to complete the task.
Complete your task using any resources available to you without requesting additional information.
Return your final outcome and include any educated guesses you had to make.`;

// File tools text
export const FILE_TOOLS_TEXT = `FILE TOOLS:
- read_file: Read files from the file system (provide absolute path)
- write_file: Write content to files (provide absolute path and content)
- get_git_repositories: Get a list of all git repositories available
- use_git_repository: Use a git repository for editing with optional branch creation
- commit_git_changes: Commit changes to a git repository`;
