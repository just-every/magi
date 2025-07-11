/**
 * Tool Runner Script
 *
 * This script serves as an intermediary runner for scripts generated by Claude CLI
 * that need access to the Magi tools. It uses the same shared executor as the internal
 * tool validation to ensure consistent behavior.
 *
 * Usage:
 *   test-custom-tool.sh <AGENT_ID> <TARGET_SCRIPT_PATH> ['<JSON_ENCODED_ARGS>']
 *
 * Example:
 *   test-custom-tool.sh abc123 ./my_generated_script.ts '{"param1":"value1","param2":123}'
 *
 * This runner also supports running TypeScript modules with exports:
 *   1. If the file has a default export function, that function will be called with args
 *   2. Otherwise the file is executed for its side effects only
 */

import path from 'path';
import fs from 'fs';
import { executeToolInSandbox } from './tool_executor.js';

async function main() {
    try {
        // Logging the starting environment
        console.log(
            `[tool_runner] START - Current working directory: ${process.cwd()}`
        );
        console.log(
            `[tool_runner] START - Process argv: ${JSON.stringify(process.argv)}`
        );
        console.log(`[tool_runner] START - Node version: ${process.version}`);
        console.log('[tool_runner] START - Environment vars:', {
            NODE_PATH: process.env.NODE_PATH,
            NODE_ENV: process.env.NODE_ENV,
            PATH: process.env.PATH,
            MAGI_TEST_FUNCTION_NAME: process.env.MAGI_TEST_FUNCTION_NAME
                ? 'set'
                : 'not set',
        });

        // Check if we're in custom tool test mode (environment variables are set)
        const isCustomToolTestMode = !!process.env.MAGI_TEST_FUNCTION_NAME;

        let agentId: string;
        let targetScriptPath: string;
        let parsedArgs: any = [];
        let functionNameToExecute: string | undefined;

        if (isCustomToolTestMode) {
            // Custom tool test mode: Get parameters from environment variables
            console.log(
                '[tool_runner] Running in CUSTOM TOOL TEST MODE using environment variables'
            );

            // Extract parameters from environment variables
            agentId = process.env.MAGI_TEST_AGENT_ID || '';
            targetScriptPath = process.env.MAGI_TEST_FILE_PATH || '';
            functionNameToExecute = process.env.MAGI_TEST_FUNCTION_NAME;

            // Validate required environment variables
            if (!agentId) {
                console.error(
                    'Error: MAGI_TEST_AGENT_ID environment variable is required'
                );
                process.exit(1);
            }

            if (!targetScriptPath) {
                console.error(
                    'Error: MAGI_TEST_FILE_PATH environment variable is required'
                );
                process.exit(1);
            }

            if (!functionNameToExecute) {
                console.error(
                    'Error: MAGI_TEST_FUNCTION_NAME environment variable is required'
                );
                process.exit(1);
            }

            // Parse args from JSON string
            try {
                const argsJsonString = process.env.MAGI_TEST_ARGS_JSON || '[]';
                parsedArgs = JSON.parse(argsJsonString);
                console.log(
                    '[tool_runner] Successfully parsed args from MAGI_TEST_ARGS_JSON:',
                    JSON.stringify(parsedArgs)
                );
            } catch (err) {
                console.error(
                    '[tool_runner] Error parsing MAGI_TEST_ARGS_JSON:',
                    err
                );
                console.log('[tool_runner] Using empty args array');
                parsedArgs = [];
            }

            console.log(`[tool_runner] Running custom tool test with parameters:
  - Agent ID: ${agentId}
  - Script Path: ${targetScriptPath}
  - Function Name: ${functionNameToExecute}
  - Args: ${JSON.stringify(parsedArgs)}`);
        } else {
            // Standard mode: Parse command line arguments
            const [, , cliAgentId, cliTargetScriptPath, ...scriptArgs] =
                process.argv;

            agentId = cliAgentId;
            targetScriptPath = cliTargetScriptPath;

            if (!agentId) {
                console.error('Error: Agent ID is required');
                console.error(
                    'Usage: test-custom-tool.sh <AGENT_ID> <TARGET_SCRIPT_PATH> [SCRIPT_ARGS...]'
                );
                process.exit(1);
            }

            if (!targetScriptPath) {
                console.error('Error: Target script path is required');
                console.error(
                    'Usage: test-custom-tool.sh <AGENT_ID> <TARGET_SCRIPT_PATH> [SCRIPT_ARGS...]'
                );
                process.exit(1);
            }

            console.log(
                `[tool_runner] Running script ${targetScriptPath} with agent ID ${agentId}`
            );

            // Process script arguments - parse JSON if provided
            if (scriptArgs.length > 0) {
                // Get JSON string (might be multiple args that got split)
                const argsStr = scriptArgs.join(' ');
                try {
                    // Attempt to parse as JSON
                    parsedArgs = JSON.parse(argsStr);
                    console.log(
                        '[tool_runner] Successfully parsed JSON args:',
                        JSON.stringify(parsedArgs)
                    );
                } catch {
                    // If not valid JSON, use as-is
                    console.log(
                        '[tool_runner] Args not valid JSON, using as raw strings:',
                        scriptArgs
                    );
                    parsedArgs = scriptArgs;
                }
            }
        }

        // Resolve the absolute path to the target script
        const resolvedScriptPath = path.resolve(targetScriptPath);
        console.log(
            `[tool_runner] Resolved script path: ${resolvedScriptPath}`
        );

        // Does the script file exist?
        try {
            const scriptStats = fs.statSync(resolvedScriptPath);
            console.log(
                `[tool_runner] Script file exists: ${scriptStats.isFile()}`
            );
            console.log(`[tool_runner] Script file size: ${scriptStats.size}`);
        } catch (err) {
            console.error(
                '[tool_runner] ERROR: Script file check failed:',
                err
            );
        }

        // Use the shared executor to run the script
        console.log('[tool_runner] Executing script using shared executor...');

        let result;
        try {
            result = await executeToolInSandbox({
                filePath: resolvedScriptPath,
                functionName: functionNameToExecute,
                agentId: agentId,
                args: Array.isArray(parsedArgs) ? parsedArgs : [parsedArgs],
            });
            console.log('[tool_runner] Tool execution sandbox call completed');

            // Check if the result indicates an error (string starting with "Error:" or object with success: false)
            if (typeof result === 'string' && result.startsWith('Error:')) {
                console.error(
                    '[tool_runner] Execution resulted in a string error:',
                    result
                );
                throw new Error(result); // Convert error string to actual Error
            } else if (
                typeof result === 'object' &&
                result !== null &&
                result.success === false
            ) {
                console.error(
                    '[tool_runner] Execution resulted in a failed status object:',
                    result
                );
                // Throw an error so the main catch block handles the non-zero exit
                throw new Error(
                    `Tool reported failure: ${result.error || 'No specific error message provided'}`
                );
            }

            console.log('[tool_runner] Tool execution completed successfully');
        } catch (execError) {
            console.error(
                '[tool_runner] Error during executeToolInSandbox or processing its result:',
                execError
            );
            throw execError; // Re-throw to be caught by the outer try-catch
        }

        // Display the result (if any)
        if (result !== undefined) {
            // Check for undefined, as null might be a valid tool return
            console.log('[tool_runner] Script execution result:', result);
        } else {
            console.log(
                '[tool_runner] Script execution completed with no return value'
            );
        }

        // Send a SIGINT signal to self to trigger browser cleanup from signal handlers
        // This will invoke the closeAllSessions() in browser_session.ts through the signal handler
        console.log(
            '[tool_runner] Sending SIGINT to self to ensure browser cleanup'
        );
        setTimeout(() => {
            process.kill(process.pid, 'SIGINT');
        }, 100); // Small delay to ensure console message is output
    } catch (error) {
        console.error(
            `[tool_runner] Error: ${error instanceof Error ? error.message : String(error)}`
        );
        if (error instanceof Error && error.stack) {
            console.error(error.stack);
        }
        process.exit(1); // Ensure non-zero exit code on error
    }
}

main();
