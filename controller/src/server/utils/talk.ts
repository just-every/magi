import { CommunicationManager } from '../managers/communication_manager';
import { sendTelegramMessage } from './telegram_bot';
import { CostUpdateEvent } from '../../types';
import { getVoiceById, DEFAULT_VOICE_ID } from './voice_config';

let audioEnabled = true;
let telegramEnabled = true;
let currentVoiceId = DEFAULT_VOICE_ID;

export function setAudioEnabled(enabled: boolean): void {
    audioEnabled = enabled;
}

export function setTelegramEnabled(enabled: boolean): void {
    telegramEnabled = enabled;
}

export function setCurrentVoice(voiceId: string): void {
    currentVoiceId = voiceId;
}

export function getCurrentVoice(): string {
    return currentVoiceId;
}

let communicationManager: CommunicationManager | null = null;

/**
 * Set the communication manager instance for audio streaming
 */
export function setCommunicationManager(manager: CommunicationManager): void {
    communicationManager = manager;
}

/**
 * Output text to speech using ensemble's unified voice API, streaming chunks to the client.
 * Also sends the message to Telegram if integration is enabled.
 */
export async function talk(
    input: string,
    affect: string,
    processId: string,
    voiceId?: string
): Promise<void> {
    // Send to Telegram in parallel (if enabled)
    if (telegramEnabled) {
        sendTelegramMessage(input, affect, processId).catch(error => {
            console.error(`[Telegram] Error sending message: ${error}`);
        });
    } else {
        console.log(
            '[Server] Telegram is disabled; skipping sendTelegramMessage'
        );
    }

    // Check audio state
    if (!audioEnabled) {
        console.log(
            `[Server] Audio is disabled; skipping TTS generation for process ${processId}`
        );
        return;
    }

    if (!communicationManager) {
        console.error('CommunicationManager not set.');
        return;
    }

    // Get voice configuration
    const selectedVoiceId = voiceId || currentVoiceId;
    const voiceConfig = getVoiceById(selectedVoiceId);

    if (!voiceConfig) {
        console.error(
            `Voice configuration not found for ID: ${selectedVoiceId}`
        );
        return;
    }

    // Check if the provider has an API key configured
    const hasApiKey =
        (voiceConfig.provider === 'openai' && process.env.OPENAI_API_KEY) ||
        (voiceConfig.provider === 'gemini' && process.env.GOOGLE_API_KEY) ||
        (voiceConfig.provider === 'elevenlabs' &&
            process.env.ELEVENLABS_API_KEY);

    if (!hasApiKey) {
        console.error(
            `No API key configured for voice provider: ${voiceConfig.provider}`
        );
        return;
    }

    const format = 'pcm'; // Use PCM format
    const CHUNK_SIZE = 8192; // Adjust if needed

    // Send this first to let the client know we're starting
    communicationManager.broadcastProcessMessage(processId, {
        processId,
        event: {
            type: 'audio_stream',
            timestamp: new Date().toISOString(),
            format: format,
            pcmParameters: {
                sampleRate: 24000,
                channels: 1, // Assuming Mono TTS output
                bitDepth: 16, // 16-bit signed, little-endian is implied by PCM format desc
            },
        },
    });

    try {
        // Prepare voice-specific instructions
        let instructions = '';
        if (voiceConfig.provider === 'openai') {
            instructions = `Pitch: Expressive variation. Show genuine curiosity and vulnerability with inflection.
Pacing: Slightly faster, conversational, fluidly adapt to emotion.
Articulation: Soft, clear, avoid sharpness. Smooth delivery.
Prosody: Highly expressive, nuanced, convey authentic emotion.
Delivery: A sincere, deeply personal feel. Mix genuine curiosity, vulnerability, and subtle warmth/engagement.

Core Affect: ${affect}`;
        }

        // Create agent definition for ensemble
        const agent = {
            model: voiceConfig.model,
            name: 'TTS Agent',
        };

        // Voice generation options
        const voiceOptions: any = {
            voice: voiceConfig.voice,
            response_format: format as any,
            speed: voiceConfig.provider === 'openai' ? 4 : 1, // OpenAI supports speed adjustment
            stream: true,
        };

        // Add provider-specific options
        if (voiceConfig.provider === 'elevenlabs') {
            voiceOptions.voice_settings = {
                stability: 0.5,
                similarity_boost: 0.75,
                style: 0.5,
                use_speaker_boost: true,
            };
        }

        // Dynamically import ensembleVoiceStream
        const { ensembleVoiceStream } = await import('@just-every/ensemble');

        // Generate voice stream
        const stream = ensembleVoiceStream(
            voiceConfig.provider === 'openai' && instructions
                ? `${instructions}\n\n${input}`
                : input,
            agent,
            voiceOptions
        );

        let totalBytes = 0;
        let chunkIndex = 0;
        let buffer = Buffer.alloc(0);

        // Process stream chunks
        for await (const chunk of stream) {
            if (chunk.type === 'chunk' && chunk.data) {
                // Accumulate chunks
                const chunkBuffer = Buffer.from(chunk.data);
                buffer = Buffer.concat([buffer, chunkBuffer]);

                // Send complete chunks of CHUNK_SIZE
                while (buffer.length >= CHUNK_SIZE) {
                    const toSend = buffer.slice(0, CHUNK_SIZE);
                    buffer = buffer.slice(CHUNK_SIZE);

                    const base64Chunk = toSend.toString('base64');

                    communicationManager.broadcastProcessMessage(processId, {
                        processId,
                        event: {
                            type: 'audio_stream',
                            chunkIndex: chunkIndex++,
                            isFinalChunk: false,
                            data: base64Chunk,
                            timestamp: new Date().toISOString(),
                        },
                    });

                    totalBytes += toSend.length;
                }
            } else if (chunk.type === 'usage' && chunk.usage) {
                // Track TTS cost based on provider
                let totalCost = 0;

                if (voiceConfig.provider === 'openai') {
                    // OpenAI: $0.60/1M input tokens and $12.00/1M output tokens
                    const input_tokens = chunk.usage.prompt_tokens || 0;
                    const output_tokens = chunk.usage.completion_tokens || 0;

                    const inputCost = (input_tokens / 1000000) * 0.6;
                    const outputCost = (output_tokens / 1000000) * 12.0;
                    totalCost = inputCost + outputCost;
                } else if (
                    voiceConfig.provider === 'elevenlabs' &&
                    chunk.usage.characters
                ) {
                    // ElevenLabs charges per character
                    // Approximate cost: $0.30 per 1000 characters for turbo model
                    totalCost = (chunk.usage.characters / 1000) * 0.3;
                } else if (voiceConfig.provider === 'gemini') {
                    // Gemini pricing (if available in usage data)
                    totalCost = chunk.usage.cost || 0;
                }

                if (totalCost > 0) {
                    const costEvent: CostUpdateEvent = {
                        type: 'cost_update',
                        usage: {
                            model: voiceConfig.model,
                            cost: totalCost,
                            input_tokens: chunk.usage.prompt_tokens || 0,
                            output_tokens: chunk.usage.completion_tokens || 0,
                            timestamp: new Date(),
                        },
                    };
                    communicationManager.handleModelUsage(processId, costEvent);
                }
            }
        }

        // Send any remaining data
        if (buffer.length > 0) {
            const base64Chunk = buffer.toString('base64');

            communicationManager.broadcastProcessMessage(processId, {
                processId,
                event: {
                    type: 'audio_stream',
                    chunkIndex: chunkIndex++,
                    isFinalChunk: true,
                    data: base64Chunk,
                    timestamp: new Date().toISOString(),
                },
            });

            totalBytes += buffer.length;
        } else if (chunkIndex > 0) {
            // Mark the last chunk as final if we've sent any chunks
            communicationManager.broadcastProcessMessage(processId, {
                processId,
                event: {
                    type: 'audio_stream',
                    chunkIndex: chunkIndex - 1,
                    isFinalChunk: true,
                    timestamp: new Date().toISOString(),
                },
            });
        }

        console.log(
            `[Server] Finished sending ${totalBytes} bytes in ${chunkIndex} chunks for process ${processId} using ${voiceConfig.name}.`
        );
    } catch (error) {
        console.error(
            `[Server] Error during TTS generation or streaming for process ${processId}:`,
            error
        );
    }
}
