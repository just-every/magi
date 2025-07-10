import type { CostUpdateEvent } from '@shared-types';
import { Socket } from 'socket.io';
import { Readable } from 'stream';
import { communicationManager } from './talk';

// We'll load ensemble dynamically since it's ESM
let ensembleModule: any = null;

async function getEnsemble() {
    if (!ensembleModule) {
        ensembleModule = await import('@just-every/ensemble');
    }
    return ensembleModule;
}

interface AudioStreamSession {
    isActive: boolean;
    audioStream: Readable;
    sampleRate: number;
    startTime: number;
    transcriptionTask?: Promise<void>;
}

// Store active audio sessions by socket ID
const audioSessions = new Map<string, AudioStreamSession>();

/**
 * Handle audio stream start
 */
export async function handleAudioStreamStart(
    socket: Socket,
    data: {
        sampleRate?: number;
        model?: string;
        language?: string;
    }
) {
    const sessionId = socket.id;
    console.log(`[AudioStream] Starting audio stream for client ${sessionId}`);

    // Create a Node.js Readable stream for audio data
    const audioStream = new Readable({
        read() {}, // No-op
    });

    // Initialize session
    const session: AudioStreamSession = {
        isActive: true,
        audioStream,
        sampleRate: data.sampleRate || 16000,
        startTime: Date.now(),
    };

    audioSessions.set(sessionId, session);

    try {
        const { ensembleListen } = await getEnsemble();

        // Create agent definition according to new API
        const agent = {
            model: data.model || 'gemini-live-2.5-flash-preview',
        };

        // Create transcription options according to new API
        const options = {
            audioFormat: {
                sampleRate: data.sampleRate || 16000,
                channels: 1,
                encoding: 'pcm' as const,
            },
            bufferConfig: {
                chunkSize: 8192, // 8KB chunks for optimal performance
                maxBufferSize: 32768,
            },
        };

        // Send acknowledgment
        socket.emit('audio:stream_started', { sessionId });

        // Start transcription task
        session.transcriptionTask = (async () => {
            try {
                for await (const event of ensembleListen(
                    audioStream,
                    agent,
                    options
                )) {
                    if (
                        !session.isActive &&
                        event.type !== 'transcription_turn_complete'
                    ) {
                        // Skip non-final events if session is no longer active
                        continue;
                    }

                    // Send event to client
                    socket.emit('audio:transcription_event', {
                        type: 'transcription_event',
                        event: event,
                    });

                    // Handle specific event types
                    switch (event.type) {
                        case 'transcription_start':
                            console.log('[AudioStream] Transcription started');
                            break;

                        case 'transcription_turn_delta':
                            console.log('[AudioStream] Delta:', event.delta);
                            break;

                        case 'transcription_turn_complete':
                            console.log(
                                '[AudioStream] Turn complete:',
                                event.text
                            );
                            break;

                        case 'cost_update':
                            // Forward the cost_update event directly
                            communicationManager.handleModelUsage(
                                'controller',
                                event as CostUpdateEvent
                            );
                            break;

                        case 'error':
                            console.error('[AudioStream] Error:', event.error);
                            socket.emit('audio:error', {
                                error: 'Transcription error',
                                details: event.error,
                            });
                            break;
                    }
                }
            } catch (error) {
                console.error(
                    '[AudioStream] Error in transcription stream:',
                    error
                );
                socket.emit('audio:error', {
                    error: 'Failed to process audio stream',
                    details:
                        error instanceof Error ? error.message : String(error),
                });
            }
        })();
    } catch (error) {
        console.error('[AudioStream] Error starting audio stream:', error);
        socket.emit('audio:error', {
            error: 'Failed to start audio stream',
            details: error instanceof Error ? error.message : String(error),
        });
        audioSessions.delete(sessionId);
    }
}

/**
 * Handle incoming audio data chunks
 */
export function handleAudioStreamData(
    socket: Socket,
    data: { audio: ArrayBuffer | string }
) {
    const sessionId = socket.id;
    const session = audioSessions.get(sessionId);

    if (!session || !session.isActive) {
        console.warn(`[AudioStream] No active session for client ${sessionId}`);
        return;
    }

    // Convert incoming audio data to Buffer
    let audioBuffer: Buffer;
    if (typeof data.audio === 'string') {
        // Base64 encoded audio
        audioBuffer = Buffer.from(data.audio, 'base64');
    } else {
        // ArrayBuffer
        audioBuffer = Buffer.from(data.audio);
    }

    // Push to the readable stream
    session.audioStream.push(audioBuffer);
}

/**
 * Handle audio stream stop
 */
export async function handleAudioStreamStop(socket: Socket) {
    const sessionId = socket.id;
    const session = audioSessions.get(sessionId);

    if (!session) {
        console.warn(`[AudioStream] No session found for client ${sessionId}`);
        return;
    }

    console.log(`[AudioStream] Stopping audio stream for client ${sessionId}`);
    session.isActive = false;

    // Close the readable stream
    session.audioStream.push(null); // Signal end of stream

    // Wait for transcription to complete
    if (session.transcriptionTask) {
        try {
            await session.transcriptionTask;
        } catch (error) {
            console.error(
                '[AudioStream] Error waiting for transcription to complete:',
                error
            );
        }
    }

    // Clean up session
    audioSessions.delete(sessionId);

    // Send acknowledgment
    socket.emit('audio:stream_stopped', { sessionId });
}

/**
 * Clean up audio session when socket disconnects
 */
export function cleanupAudioSession(socketId: string) {
    const session = audioSessions.get(socketId);
    if (session) {
        console.log(
            `[AudioStream] Cleaning up session for disconnected client ${socketId}`
        );
        session.isActive = false;

        // Close the readable stream
        session.audioStream.push(null);

        audioSessions.delete(socketId);
    }
}
