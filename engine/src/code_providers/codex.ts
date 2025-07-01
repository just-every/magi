/**
 * Runs OpenAI Codex via its CLI streaming interface.
 */

import { v4 as uuidv4 } from 'uuid';
import {
    Agent,
    ResponseInput,
    ModelProvider,
    ProviderStreamEvent,
    MessageEvent,
} from '@just-every/ensemble';
import { log_llm_request } from '../utils/file_utils.js';
import { runPty } from '../utils/run_pty.js';

// Define interface for parsing Codex CLI JSON output
interface CodexContentPart {
    type: string;
    text?: string;
}

/**
 * Helper function to filter out known noise patterns from the interactive CLI output.
 *
 * **WARNING:** This function is highly dependent on the specific output format of the
 * current 'claude' CLI version. Changes to UI elements, status messages, prompts, etc.,
 * in future CLI versions may require this function to be updated.
 *
 * @param line - A single line of text (after ANSI stripping and trimming).
 * @param tokenCb - Optional callback to receive detected token counts from status lines
 * @returns True if the line is considered noise, false otherwise.
 */
function isNoiseLine(line: string, tokenCb?: (n: number) => void): boolean {
    if (!line) return true; // Skip empty lines

    // --- Filtering based on observed output ---
    // NOTE: These patterns might break with future CLI updates.

    // UI Borders/Elements
    if (line.startsWith('╭') || line.startsWith('│') || line.startsWith('╰'))
        return true;

    if (line.startsWith('ctrl+c to exit')) return true;

    // If none of the noise patterns matched, it's considered useful content
    return false;
}

/**
 * Checks if a line indicates the start of the actual processing/response phase,
 * after the initial prompt echo or setup messages.
 *
 * **WARNING:** This function relies on specific "start signals" observed in the
 * current 'claude' CLI output. If these signals change in future versions,
 * the logic for skipping the initial prompt echo might fail.
 *
 * @param line - A single line of text (after ANSI stripping and trimming).
 * @returns True if the line signals processing start, false otherwise.
 */
function isProcessingStartSignal(line: string): boolean {
    // NOTE: These patterns might break with future CLI updates.
    // Add patterns that reliably appear only *after* the initial prompt/setup output
    if (/^\s*\p{S}\s*\w+…/u.test(line)) return true;
    if (
        line.startsWith('● ') ||
        line.startsWith('╭') ||
        line.startsWith('│') ||
        line.startsWith('╰')
    )
        return true; // Lines starting with ● often indicate actions/tasks
    if (line.startsWith('Task(')) return true; // Task descriptions
    return false;
}

/**
 * CodexProvider uses run_pty to spawn the `codex` CLI,
 * processing JSON-like lines to extract output_text for the final result.
 */
export class CodexProvider implements ModelProvider {
    provider_id = 'codex';

    async *createResponseStream(
        messages: ResponseInput,
        model: string, // e.g., 'codex'
        agent: Agent
    ): AsyncGenerator<ProviderStreamEvent> {
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
                agent.cwd && agent.cwd.trim() ? agent.cwd : process.cwd();

            log_llm_request(agent.agent_id, 'openai', model, {
                prompt,
                working_directory: cwd,
            });

            console.log(
                `[CodexProvider] Executing Codex CLI for model '${model}' in dir '${cwd}'...`
            );

            // Run Codex CLI via run_pty
            console.log(
                `[CodexProvider] Setting up runPty with silenceTimeoutMs: 30000 for message ${messageId}`
            );
            const { stream, write } = runPty(
                'codex',
                [
                    '--full-auto',
                    '--dangerously-auto-approve-everything',
                    prompt,
                ],
                {
                    cwd,
                    messageId,
                    env: {
                        ...process.env,
                        CODEX_UNSAFE_ALLOW_NO_SANDBOX: '1',
                    },
                    noiseFilter: isNoiseLine,
                    silenceTimeoutMs: 30000, // Codex can be slower, give it more time
                    exitCommand: '/quit', // Exit command for Codex CLI
                    onLine: (line: string) => {
                        // Look for the warning prompt about running outside a git repo
                        if (line.includes('Do you want to continue?')) {
                            console.log(
                                '[CodexProvider] Detected warning prompt, auto-responding with "y"'
                            );
                            // Send "y" after delay - this was working before
                            setTimeout(() => write('y'), 2000);
                        }
                    },
                }
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
                    yield event as ProviderStreamEvent;
                } else {
                    // Pass through all other events unchanged
                    yield event as ProviderStreamEvent;
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
            } as ProviderStreamEvent;
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
