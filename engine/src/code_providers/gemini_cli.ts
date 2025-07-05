import {
    Agent,
    ResponseInput,
    ModelProvider,
    ProviderStreamEvent,
    MessageEvent,
} from '@just-every/ensemble';
import { log_llm_request } from '../utils/file_utils.js';
import { runPty, type PtyRunOptions } from '../utils/run_pty.js';
import { v4 as uuidv4 } from 'uuid';
import { GeminiOutputProcessor } from './gemini_cli_processor.js';

// Helper function to filter out noise from Gemini CLI output
function isNoiseLine(line: string): boolean {
    if (!line) return true; // Skip empty lines

    // Filter UI elements and status messages
    if (line.includes('Waiting for auth...')) return true;

    // Only filter the GEMINI ASCII art banner, not box drawing for content
    if (line.includes('███            █████████')) return true;
    if (line.includes('░░░███         ███░░░░░███')) return true;
    if (line.includes('░░░███      ███     ░░░')) return true;
    if (line.includes('░░░███   ░███')) return true;
    if (line.includes('███░    ░███    █████')) return true;
    if (line.includes('███░      ░░███  ░░███')) return true;
    if (line.includes('███░         ░░█████████')) return true;
    if (line.includes('░░░            ░░░░░░░░░')) return true;

    // Filter initial tips but not actual content
    if (line === 'Tips for getting started:') return true;
    if (line.match(/^\d+\. Ask questions, edit files, or run commands\.$/))
        return true;
    if (line.match(/^\d+\. Be specific for the best results\.$/)) return true;
    if (
        line.match(
            /^\d+\. Create GEMINI\.md files to customize your interactions with Gemini\.$/
        )
    )
        return true;
    if (line.match(/^\d+\. \/help for more information\.$/)) return true;

    // Filter status bar elements
    if (line.includes('YOLO mode (ctrl + y to toggle)')) return true;
    if (line.includes('(see   gemini-')) return true;
    if (line.includes('/docs)') && line.includes('context left)')) return true;
    if (line.includes('no sandbox (see')) return true;

    // Filter input prompt area
    if (line === 'Type your message or @path/to/file (esc to cancel)')
        return true;
    if (line.trim() === '>' || line.trim() === '> ') return true;
    if (line.includes('> Type your message')) return true;
    if (line.includes('> /quit')) return true;

    // Filter task ID lines that appear at the bottom
    if (line.match(/^\(task-[A-Za-z0-9-]+\*?\)$/)) return true;

    // Filter project path status lines that appear in status bar
    if (line.match(/^\/app\/projects\/\S+\s+no sandbox/)) return true;

    // Filter spinner animations and progress messages
    const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const trimmedLine = line.trim();

    // Filter lines that start with a spinner character
    if (trimmedLine.length > 0 && spinnerChars.includes(trimmedLine[0]))
        return true;

    // Filter progress messages with "(esc to cancel"
    if (line.includes('(esc to cancel')) return true;

    // Filter lines that are just the task ID and status info
    if (
        line.includes('(task-') &&
        line.includes('/docs)') &&
        line.includes('left)')
    )
        return true;

    // Filter informational messages that start with ℹ
    if (line.trim().startsWith('ℹ Request cancelled')) return true;

    // Filter lines that contain only UI box elements with no meaningful content
    if (line.match(/^[│╰╭─v╮╯┴═⊶o✔\s]+$/)) return true;

    // Filter standalone tool status indicators
    if (trimmedLine === '⊶' || trimmedLine === 'o' || trimmedLine === '✔')
        return true;

    // Filter lines that start with these symbols followed by tool names (but keep the actual tool results)
    // This matches any capitalized word or words separated by spaces (tool names)
    if (line.match(/^[⊶o]\s+[A-Z][a-zA-Z]+/)) return true;

    // Also filter lines that are just tool names without results
    if (line.match(/^(WriteFile|ReadFile|Shell|RunCommand):\s+/)) return true;

    // Also filter standalone ✦ symbols (but not when followed by content like [complete])
    if (trimmedLine === '✦') return true;

    // Filter the "Type your message" prompt that appears throughout
    if (line.includes('Type your message or @path/to/file')) return true;

    // Don't filter actual content - keep tool calls with results, box drawing for content, etc.

    return false;
}

/**
 * GeminiCliProvider uses run_pty to spawn the `gemini` CLI,
 * processing its output to extract responses.
 */
export class GeminiCliProvider implements ModelProvider {
    provider_id = 'gemini-cli';

    async *createResponseStream(
        messages: ResponseInput,
        model: string, // e.g., 'gemini-cli'
        agent: Agent
    ): AsyncGenerator<ProviderStreamEvent> {
        const messageId = uuidv4();

        try {
            // Construct prompt from messages
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
                throw new Error('GeminiCliProvider: Prompt is empty.');
            }

            // Log the request
            const cwd =
                agent.cwd && agent.cwd.trim() ? agent.cwd : process.cwd();

            log_llm_request(agent.agent_id, 'google', model, {
                prompt,
                working_directory: cwd,
            });

            console.log(
                `[GeminiCliProvider] Executing Gemini CLI for model '${model}' in dir '${cwd}'...`
            );

            // Run Gemini CLI via run_pty
            console.log(
                `[GeminiCliProvider] Setting up runPty for message ${messageId}`
            );

            const { GOOGLE_API_KEY, ...envWithoutGoogleKey } = process.env;

            const ptyOpts: PtyRunOptions = {
                prompt,
                cwd,
                messageId,
                env: {
                    ...envWithoutGoogleKey,
                },
                noiseFilter: isNoiseLine,
                silenceTimeoutMs: 30000,
                exitCommand: '/quit', // Exit command for Gemini CLI
                newlineDelay: 500,
                //startImmediately: true, // Don't start immediately to allow proper filtering
                readySignal: (line: string) => {
                    // Start processing after we see a clean prompt
                    return (
                        line.includes('YOLO mode') ||
                        (line.includes('Type your message') &&
                            !line.includes('Waiting for auth'))
                    );
                },
            };

            const { stream } = runPty('gemini', ['--yolo'], ptyOpts);

            // Create output processor
            const processor = new GeminiOutputProcessor();

            // Process stream
            let deltaPosition = 0;
            let finalContent = ''; // Accumulate output for message_complete
            let lineBuffer = ''; // Buffer for incomplete lines

            for await (const event of stream) {
                // For message_delta events, process line by line
                if (event.type === 'message_delta' && 'content' in event) {
                    // Add to line buffer
                    lineBuffer += event.content;

                    // Process complete lines
                    const lines = lineBuffer.split('\n');
                    lineBuffer = lines.pop() || ''; // Keep last incomplete line

                    let processedContent = '';
                    for (const line of lines) {
                        const processed = processor.processLine(line);
                        if (processed !== null) {
                            processedContent += processed + '\n';
                        }
                    }

                    // If we have processed content, yield it
                    if (processedContent) {
                        finalContent += processedContent;
                        yield {
                            type: 'message_delta',
                            content: processedContent,
                            message_id: messageId,
                            order: deltaPosition++,
                        } as MessageEvent;
                    }
                } else {
                    // Pass through non-delta events
                    yield event as ProviderStreamEvent;
                }
            }

            // Process any remaining content in the buffer
            if (lineBuffer) {
                const processed = processor.processLine(lineBuffer);
                if (processed !== null) {
                    finalContent += processed;
                    yield {
                        type: 'message_delta',
                        content: processed,
                        message_id: messageId,
                        order: deltaPosition++,
                    } as MessageEvent;
                }
            }

            // Stream finished, emit message_complete
            console.log(
                `[GeminiCliProvider] Stream completed for message ${messageId}, emitting message_complete`
            );

            yield {
                type: 'message_complete',
                message_id: messageId,
                content: finalContent,
                order: deltaPosition + 1,
            } as MessageEvent;
        } catch (error: unknown) {
            console.error(
                '[GeminiCliProvider] Error during Gemini CLI streaming execution:',
                error
            );
            const errorMessage = String(error);

            yield {
                type: 'error',
                error: `Gemini CLI provider stream error: ${errorMessage}`,
            } as ProviderStreamEvent;
        } finally {
            console.log(
                `[GeminiCliProvider] Finalizing Gemini CLI provider for message ${messageId}`
            );
        }
    }
}

// Export an instance of the provider
export const geminiCliProvider = new GeminiCliProvider();
