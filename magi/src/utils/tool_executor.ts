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
import * as path from 'path';
import { createRequire } from 'module';
import { transformSync } from 'esbuild';
import { buildToolContext } from './tool_context.js';
// Node.js built-in modules that might be imported by tools
const BUILTIN_MODULES = [
    'fs',
    'path',
    'os',
    'crypto',
    'util',
    'events',
    'stream',
    'buffer',
    'string_decoder',
    'url',
    'querystring',
    'http',
    'https',
    'zlib',
    'assert',
    'tty',
    'dgram',
    'dns',
    'net',
    'tls',
    'child_process',
    'cluster',
    'repl',
    'readline',
    'v8',
    'vm',
    'async_hooks',
    'perf_hooks',
    'worker_threads',
    'inspector',
];
import {
    hasCommunicationManager,
    getCommunicationManager,
} from './communication.js';

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
    console.log(
        '[tool_executor] START - Current working directory: ' + process.cwd()
    );
    console.log('[tool_executor] Executing tool with parameters:');
    console.log(
        '[tool_executor]   - filePath: ' + (filePath || 'not provided')
    );
    console.log(
        '[tool_executor]   - codeString: ' +
            (codeString
                ? 'provided (length: ' + codeString.length + ')'
                : 'not provided')
    );
    console.log(
        '[tool_executor]   - functionName: ' + (functionName || 'not provided')
    );
    console.log('[tool_executor]   - agentId: ' + agentId);
    console.log('[tool_executor]   - args: ' + JSON.stringify(args));

    if (!filePath && !codeString) {
        throw new Error('Either filePath or codeString must be provided');
    }

    // Get the TypeScript source
    let tsSource: string;
    try {
        tsSource = codeString ?? fs.readFileSync(filePath!, 'utf-8');
        console.log(
            `[tool_executor] Successfully loaded TypeScript source (length: ${tsSource.length})`
        );
        console.log(
            `[tool_executor] First 100 chars of source: ${tsSource.substring(0, 100)}...`
        );
    } catch (readError) {
        console.error(
            `[tool_executor] ERROR: Failed to read source file: ${readError}`
        );
        throw new Error(
            `Failed to read source file: ${readError instanceof Error ? readError.message : String(readError)}`
        );
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
    console.log(
        `[tool_executor] Building tool context for agent ${agentId}...`
    );
    const toolsContext = buildToolContext(
        agentId,
        hasCommunicationManager()
            ? getCommunicationManager()
            : mockCommunicationManager
    );
    console.log(
        `[tool_executor] Tool categories available: ${Object.keys(toolsContext).join(', ')}`
    );

    // Create the sandbox context - spreading toolsContext directly into global scope
    const sandbox: any = {
        console: console, // Expose the host console
        Promise: Promise,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        Error: Error,
        process: {
            env: process.env,
            cwd: () => process.cwd(),
        },
        Buffer: Buffer,
        args: args, // Arguments for the function or script
        // result will be populated by the executed code or its promise
        // No 'module' or 'exports' needed for ESM with vm.SourceTextModule
        agentId: agentId,
        agent_id: agentId,
        tools: toolsContext, // Keep for backward compatibility if tools expect `tools.someFunc()`
        fs,                      // allow global fs.*
        path,                    // handy for path.join etc.
        require: createRequire(import.meta.url), // enable require('fs')
        __dirname: process.cwd(),
        __filename: filePath ?? 'tool.ts',
        ...toolsContext, // Spread helper functions directly into the sandbox global scope
    };

    console.log(
        '[tool_executor] Transpiling TypeScript to JavaScript (ESM)...'
    );
    let jsCode: string;

    try {
        const esbuildResult = transformSync(tsSource, {
            loader: 'ts',
            format: 'esm', // Output ES Module format
            sourcemap: 'inline',
            target: 'es2020', // Ensure compatibility with Node.js versions supporting ESM
        });
        jsCode = esbuildResult.code;
        console.log(
            `[tool_executor] TypeScript transpiled successfully (JS length: ${jsCode.length})`
        );
        console.log(
            `[tool_executor] First 100 chars of transpiled JS: ${jsCode.substring(0, 100)}...`
        );

        const context = vm.createContext(sandbox);
        const esModule = new vm.SourceTextModule(jsCode, {
            identifier: filePath || 'vm:tool-code',
            context: context,
            importModuleDynamically: async (
                specifier: string,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                _script: vm.Script,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                _importAssertions: any
            ) => {
                // This handles dynamic import() calls within the tool code itself
                console.log(
                    `[tool_executor] Dynamic import attempt: ${specifier}`
                );
                if (BUILTIN_MODULES.includes(specifier)) {
                    const targetModule = await import(specifier);
                    const exportNames = Object.keys(targetModule);
                    const syntheticModule = new vm.SyntheticModule(
                        exportNames,
                        function () {
                            exportNames.forEach(key =>
                                this.setExport(key, targetModule[key])
                            );
                        },
                        { context }
                    );
                    return syntheticModule;
                }
                throw new Error(
                    `Dynamic import of '${specifier}' is not allowed or not found.`
                );
            },
        });

        const linker = async (
            specifier: string,
            referencingModule: vm.Module
        ) => {
            console.log(
                `[tool_executor] Linker called for specifier: '${specifier}'`
            );
            if (BUILTIN_MODULES.includes(specifier)) {
                try {
                    const targetModule = await import(specifier); // Dynamically import the built-in on the host
                    const exportNames = Object.keys(targetModule);
                    // console.log(`[tool_executor] Linking built-in module '${specifier}' with exports: ${exportNames.join(', ')}`);
                    const syntheticModule = new vm.SyntheticModule(
                        exportNames,
                        function () {
                            exportNames.forEach(key =>
                                this.setExport(key, targetModule[key])
                            );
                        },
                        { context: referencingModule.context }
                    ); // Use the referencing module's context
                    return syntheticModule;
                } catch (e) {
                    console.error(
                        `[tool_executor] Linker error importing built-in '${specifier}':`,
                        e
                    );
                    throw e;
                }
            }
            // Potentially handle other custom specifiers if tools import from 'magi-tools' etc.
            // For now, Magi tools like read_file are global in the sandbox, so direct imports aren't needed for them.
            console.error(
                `[tool_executor] Linker unable to resolve import: ${specifier}`
            );
            throw new Error(
                `[tool_executor] Unable to resolve import: ${specifier}`
            );
        };

        await esModule.link(linker);
        console.log('[tool_executor] Module linked successfully.');

        await esModule.evaluate();
        console.log('[tool_executor] Module evaluated successfully.');

        if (esModule.status === 'errored') {
            console.error(
                '[tool_executor] Error during module evaluation:',
                esModule.error
            );
            throw esModule.error;
        }

        let executionResult: any = null;

        if (functionName) {
            // Custom tool scenario: call a specific named export function
            const namespace = esModule.namespace as Record<string, unknown>;
            const exportedFunction = namespace[functionName];
            if (typeof exportedFunction === 'function') {
                console.log(
                    `[tool_executor] Calling named export function '${functionName}'...`
                );
                const callResult = exportedFunction(...args);
                executionResult =
                    callResult instanceof Promise
                        ? await callResult
                        : callResult;
                console.log(
                    `[tool_executor] Named export function '${functionName}' executed.`
                );
            } else {
                throw new Error(
                    `Function '${functionName}' not found or not a function in module exports.`
                );
            }
        } else {
            // magi-run-tool scenario: look for a default export function
            const namespace = esModule.namespace as Record<string, unknown>;
            if (namespace.default && typeof namespace.default === 'function') {
                console.log(
                    '[tool_executor] Found default export function, calling it with args...'
                );
                const defaultExportFn = namespace.default as (
                    ...args: any[]
                ) => any | Promise<any>;
                const callResult = defaultExportFn(...args);
                executionResult =
                    callResult instanceof Promise
                        ? await callResult
                        : callResult;
                console.log(
                    '[tool_executor] Default export function executed successfully.'
                );
            } else {
                // If no default export, the script might have done its work via side effects
                // or by setting a global 'result' (though less common with ESM).
                // Or it might be a script that doesn't export anything and is run for its side-effects.
                // We check if the sandbox.result was set by any chance (legacy pattern)
                if (context.result !== undefined && context.result !== null) {
                    executionResult = context.result;
                    console.log(
                        '[tool_executor] Execution result found in sandbox.result (legacy pattern).'
                    );
                } else {
                    console.log(
                        '[tool_executor] No default export function found and no sandbox.result set. Execution completed.'
                    );
                    executionResult =
                        'Execution completed (no default export function found or no result explicitly set/returned).';
                }
            }
        }
        return executionResult;
    } catch (error) {
        console.error(
            '[tool_executor] Error transpiling or executing code:',
            error
        );
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        // Include stack trace if available and it's an Error object
        const stack =
            error instanceof Error && error.stack
                ? `\nStack: ${error.stack}`
                : '';
        return `Error: Failed to transpile or execute: ${errorMessage}${stack}`;
    }
}
