/**
 * Tool Executor
 *
 * A shared execution environment for TypeScript/JavaScript tools and scripts.
 * This module provides a unified sandbox for both:
 * 1. Internal VM-based execution of custom tools (from custom_tool_utils.ts)
 * 2. CLI-based execution of scripts via magi-run-tool (from tool_runner.ts)
 *
 * Both paths use the same esbuild transpilation and VM sandbox setup to ensure
 * consistent behavior regardless of how the code is executed.
 */

import * as fs from 'fs';
import * as vm from 'vm';
import { transformSync } from 'esbuild';
import { buildToolContext } from './tool_context.js';
import { hasCommunicationManager, getCommunicationManager } from './communication.js';

/**
 * Execute TypeScript code in a sandboxed environment with access to Magi tools
 *
 * @param options Configuration options for execution
 * @param options.filePath Optional path to a TypeScript file to execute
 * @param options.codeString Optional TypeScript code string to execute
 * @param options.functionName Optional name of a function to call in the code (for custom tools)
 * @param options.agentId Agent ID to use for tool context
 * @param options.args Arguments to pass to the function or script
 * @returns Promise resolving to the execution result
 */
export async function executeToolInSandbox({
    filePath,
    codeString,
    functionName,
    agentId,
    args,
}: {
    filePath?: string;
    codeString?: string;
    functionName?: string;
    agentId: string;
    args: any[];
}): Promise<string> {
    // Log execution parameters
    console.log('[tool_executor] START - Current working directory: ' + process.cwd());
    console.log('[tool_executor] Executing tool with parameters:');
    console.log('[tool_executor]   - filePath: ' + (filePath || 'not provided'));
    console.log('[tool_executor]   - codeString: ' + (codeString ? 'provided (length: ' + codeString.length + ')' : 'not provided'));
    console.log('[tool_executor]   - functionName: ' + (functionName || 'not provided'));
    console.log('[tool_executor]   - agentId: ' + agentId);
    console.log('[tool_executor]   - args: ' + JSON.stringify(args));

    if (!filePath && !codeString) {
        throw new Error('Either filePath or codeString must be provided');
    }

    // Get the TypeScript source
    let tsSource: string;
    try {
        tsSource = codeString ?? fs.readFileSync(filePath!, 'utf-8');
        console.log(`[tool_executor] Successfully loaded TypeScript source (length: ${tsSource.length})`);
        console.log(`[tool_executor] First 100 chars of source: ${tsSource.substring(0, 100)}...`);
    } catch (readError) {
        console.error(`[tool_executor] ERROR: Failed to read source file: ${readError}`);
        throw new Error(`Failed to read source file: ${readError instanceof Error ? readError.message : String(readError)}`);
    }

    // Create a mock communication manager for the sandbox environment
    const mockCommunicationManager = {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        send: (event: any) => {
            // In the sandbox, we might just log the event or do nothing
            // console.log('[Sandbox Comms] Event sent:', event);
        },
        // Add other methods if needed by tools, e.g., on, off, once
        on: () => {},
        off: () => {},
        once: () => {},
    };

    // Create the tool context with all helper functions, passing the mock communication manager
    console.log(`[tool_executor] Building tool context for agent ${agentId}...`);
    const toolsContext = buildToolContext(agentId, hasCommunicationManager() ? getCommunicationManager() : mockCommunicationManager);
    console.log(`[tool_executor] Tool categories available: ${Object.keys(toolsContext).join(', ')}`);

    // Create the sandbox context
    const sandbox: any = {
        console: console,
        Promise: Promise,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        Error: Error,
        process: {
            env: process.env, // Keep existing env exposure
            cwd: () => process.cwd(), // Expose the CWD of the tool_executor process
        },
        Buffer: Buffer,
        args: args,
        result: null,
        module: { exports: {} }, // Provide a mock module object for CommonJS
        exports: {},             // Provide exports directly as well
        tools: toolsContext,
        agentId: agentId,
    };

    console.log('[tool_executor] Transpiling TypeScript to JavaScript...');
    let jsCode: string;

    try {
        // Transpile TypeScript to JavaScript
        const result = transformSync(tsSource, {
            loader: 'ts',
            format: 'cjs', // CommonJS format for Node.js VM
            sourcemap: 'inline',
            target: 'es2020',
        });

        jsCode = result.code;
        console.log(`[tool_executor] TypeScript transpiled successfully (JS length: ${jsCode.length})`);
        console.log(`[tool_executor] First 100 chars of transpiled JS: ${jsCode.substring(0, 100)}...`);

        // Prepare the script to execute
        let scriptCode: string;

        if (functionName) {
            // Custom tool scenario: call a specific function
            scriptCode = `
                ${jsCode}
                try {
                    const promise = ${functionName}(...args);
                    if (promise instanceof Promise) {
                        promise.then(r => { result = r; }).catch(e => { result = 'Error: ' + e.message; });
                    } else {
                        result = promise;
                    }
                } catch (error) {
                    result = 'Error executing function: ' + error.message;
                }
            `;
        } else {
            // magi-run-tool scenario: Just execute the transpiled code
            // The CommonJS module will populate module.exports
            scriptCode = jsCode;
        }

        // Create and run the script in the sandbox context
        const script = new vm.Script(scriptCode);
        const context = vm.createContext(sandbox);
        script.runInContext(context);

        // Check if there's a default export function to call (for magi-run-tool scenario)
        if (!functionName && sandbox.result === null &&
            sandbox.module && sandbox.module.exports &&
            typeof sandbox.module.exports.default === 'function') {

            console.log('[tool_executor] Found default export function, calling it with args...');
            try {
                // Call the default export function with the provided args
                const defaultExportFn = sandbox.module.exports.default;
                const result = defaultExportFn(...args);

                // Handle promise or direct value
                if (result instanceof Promise) {
                    sandbox.result = await result;
                } else {
                    sandbox.result = result;
                }
                console.log('[tool_executor] Default export function executed successfully');
            } catch (defaultExportError) {
                console.error('[tool_executor] Error calling default export function:', defaultExportError);
                return `Error: Failed to call default export function: ${defaultExportError instanceof Error ? defaultExportError.message : String(defaultExportError)}`;
            }
        } else {
            // Wait for async operations to complete (for cases where script sets result itself)
            // This is a simple approach - for production, would use proper timeout handling
            for (let i = 0; i < 100; i++) {
                if (sandbox.result !== null) break;
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        // Return the result or a description of what happened
        if (sandbox.result !== null) {
            return sandbox.result;
        } else if (!functionName && sandbox.module && sandbox.module.exports && typeof sandbox.module.exports.default === 'function') {
            return 'Default export function returned undefined or null';
        } else {
            return `Execution completed without returning a value${functionName ? '' : ' (no default export function found or no result set)'}`;
        }
    } catch (error) {
        console.error(
            '[tool_executor] Error transpiling or executing code:',
            error
        );
        return `Error: Failed to transpile or execute: ${error instanceof Error ? error.message : String(error)}`;
    }
}
