/**
 * Runs OpenAI Codex via its CLI streaming interface.
 */

import { spawn } from 'child_process';
import * as readline from 'readline';
import { v4 as uuidv4 } from 'uuid';
import {
    ModelProvider,
    ResponseInput,
    StreamingEvent,
} from '../types/shared-types.js';
import { get_working_dir, log_llm_request } from '../utils/file_utils.js';

// Define interfaces for parsing Codex CLI JSON output
interface CodexContentPart {
    type: string;
    text?: string;
}
interface CodexJsonLine {
    type: string;
    role?: string;
    content?: CodexContentPart[];
    [key: string]: any;
}

/**
 * CodexProvider spawns the `codex` CLI to stream JSON-like lines,
 * yielding them as message_delta events, then a final message_complete.
 */
export class CodexProvider implements ModelProvider {
    async *createResponseStream(
        model: string, // e.g., 'codex'
        messages: ResponseInput
    ): AsyncGenerator<StreamingEvent> {
        const messageId = uuidv4();
        let order = 0;

        // Emit start event
        yield {
            type: 'message_start',
            content: '',
            message_id: messageId,
            order: order++,
        };

        // Construct prompt from history
        const promptParts: string[] = [];
        for (const msg of messages) {
            if ('content' in msg) {
                if (typeof msg.content === 'string') {
                    promptParts.push(msg.content);
                } else if (Array.isArray(msg.content)) {
                    for (const part of msg.content) {
                        if (
                            (part as any).type === 'input_text' &&
                            'text' in part
                        ) {
                            promptParts.push((part as any).text);
                        }
                    }
                }
            }
        }
        const prompt = promptParts.join('\n\n');
        if (!prompt) {
            throw new Error('CodexProvider: Prompt is empty.');
        }

        // Log the request
        const cwd = get_working_dir() || process.cwd();
        log_llm_request('openai', model, { prompt, working_directory: cwd });

        // Spawn the codex CLI process
        const child = spawn('codex', ['-q', prompt], {
            cwd,
            env: process.env,
        });

        // Read stdout line by line
        const rl = readline.createInterface({ input: child.stdout });
        let finalOutputText = '';

        for await (const rawLine of rl) {
            const line = rawLine.toString();
            const trimmed = line.trim();
            if (!trimmed) {
                continue;
            }
            const contentLine = trimmed + '\n';

            // Attempt to parse JSON for extracting output_text
            let parsed: CodexJsonLine | null = null;
            try {
                parsed = JSON.parse(trimmed);
            } catch {
                // ignore non-JSON lines
            }
            if (
                parsed &&
                parsed.type === 'message' &&
                parsed.role === 'assistant' &&
                Array.isArray(parsed.content)
            ) {
                for (const part of parsed.content) {
                    if (
                        part.type === 'output_text' &&
                        typeof part.text === 'string'
                    ) {
                        finalOutputText += part.text;
                    }
                }
            }

            yield {
                type: 'message_delta',
                content: contentLine,
                message_id: messageId,
                order: order++,
            };
        }

        // Await process exit and handle errors
        try {
            await new Promise<void>((resolve, reject) => {
                child.on('exit', code => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(
                            new Error(`codex process exited with code ${code}`)
                        );
                    }
                });
                child.on('error', err => reject(err));
            });
            // Emit completion with only extracted output_text
            yield {
                type: 'message_complete',
                message_id: messageId,
                content: finalOutputText,
            };
        } catch (err: any) {
            yield {
                type: 'error',
                error: err.message,
            };
        }
    }
}

// Export an instance of the provider
export const codexProvider = new CodexProvider();
