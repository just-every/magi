"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FILE_TOOLS_TEXT = exports.SELF_SUFFICIENCY_TEXT = exports.DOCKER_ENV_TEXT = exports.COMMON_WARNINGS = exports.MODEL_GROUPS = exports.AGENT_DESCRIPTIONS = void 0;
exports.AGENT_DESCRIPTIONS = {
    'ManagerAgent': 'Versatile task assignment - coordinates research, coding, planning, and coordination',
    'ReasoningAgent': 'Expert at complex reasoning and multi-step problem-solving',
    'CodeAgent': 'Specialized in programming, explaining, and modifying code in any language',
    'BrowserAgent': 'Controls a browser to interact with websites, fill forms, and extract data',
    'ShellAgent': 'Executes shell commands for system operations and scripts',
    'SearchAgent': 'Performs web searches for current information from various sources',
    'BrowserVisionAgent': 'Uses a computer vision to browse websites',
    'GodelMachine': 'Advanced structured pipeline for code authoring, testing, and PR management',
};
exports.MODEL_GROUPS = {
    'standard': [
        'gpt-4o',
        'gemini-2.0-flash',
        'gemini-pro',
    ],
    'mini': [
        'gpt-4o-mini',
        'claude-3-5-haiku-latest',
        'gemini-2.0-flash-lite',
    ],
    'reasoning': [
        'o3-mini',
        'claude-3-7-sonnet-latest',
        'gemini-2.0-ultra',
        'grok-2-latest',
        'grok-2',
        'grok',
    ],
    'vision': [
        'computer-use-preview',
        'gemini-pro-vision',
        'gemini-2.0-pro-vision',
        'gemini-2.0-ultra-vision',
        'grok-1.5-vision',
        'grok-2-vision-1212',
    ],
    'search': [
        'gpt-4o-search-preview',
        'gpt-4o-mini-search-preview',
    ],
};
exports.COMMON_WARNINGS = `IMPORTANT WARNINGS:
1. Do not fabricate responses or guess when you can find the answer
2. If you encounter an error, try a different approach rather than giving up
3. Be precise and thorough in your work
4. Document what you're doing and why
5. Call a tool only once you have all the required parameters
6. Make sure to validate your results before reporting them`;
exports.DOCKER_ENV_TEXT = `DOCKER ENVIRONMENT INFO:
You are running in a secure Docker container with the following setup:
- Debian Bookworm with Python, Node.js and standard development tools
- Network access for web searches and API calls
- Read/write access to files within the container
- Access to shell commands for installing packages and running processes`;
exports.SELF_SUFFICIENCY_TEXT = `SELF-SUFFICIENCY PRINCIPLES:
Assume you have been given all the information necessary to complete the task.
1. Use your tools without requesting additional information
2. If at first you don't succeed, try diverse actions to try again from multiple angles
3. If in doubt, make an educated guess about the best possible approach
4. Return your final outcome and include any educated guesses you had to make`;
exports.FILE_TOOLS_TEXT = `FILE TOOLS:
- read_file: Read files from the file system (provide absolute path)
- write_file: Write content to files (provide absolute path and content)`;
exports.default = {
    AGENT_DESCRIPTIONS: exports.AGENT_DESCRIPTIONS,
    MODEL_GROUPS: exports.MODEL_GROUPS,
    COMMON_WARNINGS: exports.COMMON_WARNINGS,
    DOCKER_ENV_TEXT: exports.DOCKER_ENV_TEXT,
    SELF_SUFFICIENCY_TEXT: exports.SELF_SUFFICIENCY_TEXT,
    FILE_TOOLS_TEXT: exports.FILE_TOOLS_TEXT
};
//# sourceMappingURL=constants.js.map