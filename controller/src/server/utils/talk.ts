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

export let communicationManager: CommunicationManager | null = null;

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

    // Set the format based on the provider
    const format =
        voiceConfig.provider === 'elevenlabs' ? 'pcm_22050' : 'pcm_16000';

    try {
        // Create agent definition for ensemble
        const agent = {
            model: voiceConfig.model,
            name: 'TTS Agent',
        };

        // Dynamically import ensembleVoice
        const { ensembleVoice } = await import('@just-every/ensemble');

        // Voice generation options
        const voiceOptions: any = {
            voice: voiceConfig.voice,
            response_format: format,
            speed:
                voiceConfig.speed ||
                (voiceConfig.provider === 'elevenlabs' ? 0.9 : 1.0),
            affect,
        };

        // Generate voice stream
        const stream = ensembleVoice(input, agent, voiceOptions);

        let chunkCount = 0;

        // Process stream events
        for await (const event of stream) {
            if (event.type === 'format_info') {
                // Forward format info to client
                communicationManager.broadcastProcessMessage(processId, {
                    processId,
                    event,
                });
                console.log(
                    `[Server] Sent format_info for ${processId}:`,
                    event.pcmParameters
                );
            } else if (event.type === 'audio_stream') {
                // Forward audio stream event
                communicationManager.broadcastProcessMessage(processId, {
                    processId,
                    event,
                });
                chunkCount++;
            } else if (event.type === 'cost_update') {
                // Forward the cost_update event directly
                communicationManager.handleModelUsage(
                    'controller',
                    event as CostUpdateEvent
                );
            }
        }

        // Send a complete event to signal end of stream
        communicationManager.broadcastProcessMessage(processId, {
            processId,
            event: {
                type: 'complete',
                timestamp: new Date().toISOString(),
            },
        });

        console.log(
            `[Server] Finished sending ${chunkCount} audio chunks for process ${processId} using ${voiceConfig.name}.`
        );
    } catch (error) {
        console.error(
            `[Server] Error during TTS generation or streaming for process ${processId}:`,
            error
        );
    }
}
