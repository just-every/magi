import { AudioStreamPlayer } from '@just-every/ensemble/utils/audio_stream_player';

let audioPlayer: AudioStreamPlayer | null = null;
let isInitialized = false;

/**
 * Initialize the audio context. Must be called from a user gesture handler.
 */
export async function initAudioContext(): Promise<void> {
    if (isInitialized && audioPlayer) {
        console.log('AudioContext already initialized.');
        return;
    }

    try {
        audioPlayer = new AudioStreamPlayer({
            onFirstAudioPlay: () => {
                console.log('[Client] Audio started playing');
            },
        });

        await audioPlayer.initAudioContext();
        isInitialized = true;
        console.log('[Client] AudioStreamPlayer initialized successfully');
    } catch (error) {
        console.error(
            '[Client] Failed to initialize AudioStreamPlayer:',
            error
        );
        audioPlayer = null;
        isInitialized = false;
    }
}

/**
 * Handle incoming audio messages using the new event format
 */
export function handleAudioMessage(event: {
    event: {
        type: string;
        pcmParameters?: {
            sampleRate: number;
            channels: number;
            bitDepth: number;
        };
        format?: string;
        data?: string;
        chunkIndex?: number;
        isFinalChunk?: boolean;
    };
}): void {
    if (!audioPlayer) {
        console.warn(
            '[Client] AudioStreamPlayer not initialized. Call initAudioContext() first.'
        );
        return;
    }

    const audioEvent = event.event;

    switch (audioEvent.type) {
        case 'format_info':
            // Initialize the stream with format information
            if (audioEvent.pcmParameters && audioEvent.format) {
                audioPlayer.startStream(
                    audioEvent.pcmParameters,
                    audioEvent.format
                );
                console.log(
                    '[Client] Started audio stream with format:',
                    audioEvent.format,
                    'and parameters:',
                    audioEvent.pcmParameters
                );
            }
            break;

        case 'audio_stream':
            // Add audio chunk
            if (
                audioEvent.data !== undefined &&
                audioEvent.chunkIndex !== undefined &&
                audioEvent.isFinalChunk !== undefined
            ) {
                audioPlayer.addChunk(
                    audioEvent.data,
                    audioEvent.chunkIndex,
                    audioEvent.isFinalChunk
                );
            }
            break;

        default:
            console.warn('[Client] Unknown audio event type:', audioEvent.type);
    }
}

/**
 * Stop audio playback
 */
export function stopAudio(): void {
    if (audioPlayer) {
        audioPlayer.stopStream();
        console.log('[Client] Audio stream stopped');
    }
}

/**
 * Fade out and stop audio playback smoothly
 */
export function fadeOutAndStopAudio(fadeTimeMs: number = 150): void {
    if (audioPlayer) {
        audioPlayer.fadeOutAndStop(fadeTimeMs);
        console.log('[Client] Audio stream fading out');
    }
}

/**
 * Get the AudioStreamPlayer instance (for legacy compatibility)
 */
export function getAudioPlayer(): AudioStreamPlayer | null {
    return audioPlayer;
}

// Export a singleton-like interface for backward compatibility
export const AudioPlayer = {
    getInstance: () => ({
        initAudioContext,
        stopStream: stopAudio,
        resetState: stopAudio,
    }),
};
