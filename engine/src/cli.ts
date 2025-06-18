/**
 * CLI argument parsing for the MAGI system.
 */

import { parseArgs } from 'node:util';

export interface CLIOptions {
    loop: boolean;
    model?: string;
    noCheckKeys: boolean;
}

/**
 * Parse command line arguments for the MAGI system.
 * @returns Parsed CLI options
 */
export function parseCLIArgs(): CLIOptions {
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            // --loop: Run the agent in a continuous loop
            loop: {
                type: 'boolean',
                short: 'l',
                default: false,
            },
            // --model: Specify the model to use (e.g., 'anthropic/claude-3-opus-20240229')
            model: {
                type: 'string',
                short: 'm',
            },
            // --no-check-keys: Skip API key checks for local development
            'no-check-keys': {
                type: 'boolean',
                default: false,
            },
        },
        allowPositionals: true,
    });

    return {
        loop: values.loop as boolean,
        model: values.model as string | undefined,
        noCheckKeys: values['no-check-keys'] as boolean,
    };
}