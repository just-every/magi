import OpenAI from 'openai';
import { CommunicationManager } from '../managers/communication_manager';
import { sendTelegramMessage } from './telegram_bot';
import { CostUpdateEvent } from '../../types';

let audioEnabled = true;
let telegramEnabled = true;

export function setAudioEnabled(enabled: boolean): void {
    audioEnabled = enabled;
}

export function setTelegramEnabled(enabled: boolean): void {
    telegramEnabled = enabled;
}

const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;
let communicationManager: CommunicationManager | null = null;

/**
 * Set the communication manager instance for audio streaming
 */
export function setCommunicationManager(manager: CommunicationManager): void {
    communicationManager = manager;
}

/**
 * Output text to speech using OpenAI's TTS model, streaming chunks to the client.
 * Also sends the message to Telegram if integration is enabled.
 */
export async function talk(
    input: string,
    affect: string,
    processId: string
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

    if (!openai) {
        console.error('OpenAI API key not configured.');
        return;
    }
    if (!communicationManager) {
        console.error('CommunicationManager not set.');
        return;
    }

    const format = 'pcm'; // *** USE PCM ***
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
        const instructions = `Pitch: Expressive variation. Show genuine curiosity and vulnerability with inflection.
Pacing: Slightly faster, conversational, fluidly adapt to emotion.
Articulation: Soft, clear, avoid sharpness. Smooth delivery.
Prosody: Highly expressive, nuanced, convey authentic emotion.
Delivery: A sincere, deeply personal feel. Mix genuine curiosity, vulnerability, and subtle warmth/engagement.

Core Affect: ${affect}`;

        const response = await openai.audio.speech.create({
            model: 'gpt-4o-mini-tts',
            voice: 'sage',
            input,
            instructions,
            response_format: format,
            speed: 4,
        });

        // Track TTS cost - $0.60/1M input tokens and $12.00/1M output tokens
        // Input is estimated as instructions + input text, output is the spoken text (input)
        const input_tokens = Math.ceil(
            (instructions.length + input.length) / 4
        );
        const output_tokens = Math.ceil(input.length / 4);

        const inputCost = (input_tokens / 1000000) * 0.6;
        const outputCost = (output_tokens / 1000000) * 12.0;
        const totalCost = inputCost + outputCost;

        const costEvent: CostUpdateEvent = {
            type: 'cost_update',
            usage: {
                model: 'gpt-4o-mini-tts',
                cost: totalCost,
                input_tokens,
                output_tokens,
                timestamp: new Date().toISOString(),
            },
        };
        communicationManager.handleModelUsage(processId, costEvent);

        const arrayBuffer = await response.arrayBuffer();
        console.log(
            `[Server] Received ${arrayBuffer.byteLength} bytes (PCM) from OpenAI.`
        );

        if (arrayBuffer.byteLength === 0) {
            return;
        }
        if (arrayBuffer.byteLength % 2 !== 0) {
            console.warn(
                '[Server] PCM data length is not even, might indicate issues as samples are 16-bit (2 bytes).'
            );
        }

        const totalChunks = Math.ceil(arrayBuffer.byteLength / CHUNK_SIZE);
        console.log(`[Server] Splitting into ${totalChunks} chunks.`);

        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, arrayBuffer.byteLength);
            const chunk = arrayBuffer.slice(start, end);
            const base64Chunk = Buffer.from(chunk).toString('base64');
            const isFinalChunk = i === totalChunks - 1;

            communicationManager.broadcastProcessMessage(processId, {
                processId,
                event: {
                    type: 'audio_stream',
                    chunkIndex: i,
                    isFinalChunk: isFinalChunk,
                    data: base64Chunk,
                    timestamp: new Date().toISOString(),
                },
            });
        }
        console.log(
            `[Server] Finished sending all PCM chunks for process ${processId}.`
        );
    } catch (error) {
        console.error(
            `[Server] Error during TTS generation or streaming for process ${processId}:`,
            error
        );
    }
}
