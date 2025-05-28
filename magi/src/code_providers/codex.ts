/**
 * Runs OpenAI Codex via its CLI streaming interface.
 */

import { v4 as uuidv4 } from 'uuid';
import {
    ResponseInput,
} from '@magi-system/ensemble';
import {
    ModelProvider,
    StreamingEvent,
    MessageEvent,
} from '../types/shared-types.js';
import { get_working_dir, log_llm_request } from '../utils/file_utils.js';
import type { Agent } from '../utils/agent.js';
import { runPty, PtyRunOptions } from '../utils/run_pty.js';

// Define interface for parsing Codex CLI JSON output
interface CodexContentPart {
    type: string;
    text?: string;
}

/**
 * CodexProvider uses run_pty to spawn the `codex` CLI,
 * processing JSON-like lines to extract output_text for the final result.
 */
export class CodexProvider implements ModelProvider {
    async *createResponseStream(
        model: string, // e.g., 'codex'
        messages: ResponseInput,
        agent: Agent
    ): AsyncGenerator<StreamingEvent> {
        const messageId = uuidv4();
        let finalOutputText = ''; // Accumulate output_text for message_complete

        try {
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
            const cwd =
                agent.cwd && agent.cwd.trim()
                    ? agent.cwd
                    : get_working_dir() || process.cwd();

            log_llm_request(agent.agent_id, 'openai', model, {
                prompt,
                working_directory: cwd,
            });

            console.log(
                `[CodexProvider] Executing Codex CLI for model '${model}' in dir '${cwd}'...`
            );

            // Define runPty options
            const ptyOpts: PtyRunOptions = {
                cwd,
                messageId,
                silenceTimeoutMs: 30000, // Codex can be slower, give it more time
                emitComplete: false, // We'll emit our own message_complete
                exitCommand: 'q', // Exit command for Codex CLI
            };

            // Run Codex CLI via run_pty
            const { stream } = runPty(
                'codex',
                [
                    '--full-auto',
                    '--dangerously-auto-approve-everything',
                    prompt,
                ],
                ptyOpts
            );

            // Process stream, looking for JSON with output_text
            let deltaPosition = 0; // Track the highest order value
            for await (const event of stream) {
                // Track order for sequencing the final complete message
                if (
                    'order' in event &&
                    typeof event.order === 'number' &&
                    event.order > deltaPosition
                ) {
                    deltaPosition = event.order;
                }

                // For message_delta events, try to extract output_text from JSON
                if (event.type === 'message_delta' && 'content' in event) {
                    const lines = event.content.split('\n');

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;

                        try {
                            const parsed = JSON.parse(trimmed);

                            if (
                                parsed &&
                                parsed.type === 'message' &&
                                parsed.role === 'assistant' &&
                                Array.isArray(parsed.content)
                            ) {
                                for (const part of parsed.content as CodexContentPart[]) {
                                    if (
                                        part.type === 'output_text' &&
                                        typeof part.text === 'string'
                                    ) {
                                        finalOutputText += part.text;
                                    }
                                }
                            }
                        } catch {
                            // Ignore non-JSON lines
                        }
                    }

                    // Pass through the message_delta event unmodified
                    yield event;
                } else {
                    // Pass through all other events unchanged
                    yield event;
                }
            }

            // Stream finished, emit our own message_complete with the parsed content
            console.log(
                `[CodexProvider] Stream completed for message ${messageId}, emitting message_complete`
            );

            // Use the next sequential order number after the last message delta
            yield {
                type: 'message_complete',
                message_id: messageId,
                content: finalOutputText,
                order: deltaPosition + 1, // Use sequential order number
            } as MessageEvent;
        } catch (error: unknown) {
            console.error(
                '[CodexProvider] Error during Codex streaming execution:',
                error
            );
            const errorMessage = String(error);

            yield {
                type: 'error',
                error: `Codex provider stream error: ${errorMessage}`,
                agent: undefined,
            };
        } finally {
            // Ensure proper cleanup on both success and error paths
            console.log(
                `[CodexProvider] Finalizing Codex provider for message ${messageId}`
            );
        }
    }
}

// Export an instance of the provider
export const codexProvider = new CodexProvider();
