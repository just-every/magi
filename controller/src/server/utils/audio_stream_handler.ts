import { Socket } from 'socket.io';

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
    audioChunks: Buffer[];
    sampleRate: number;
    startTime: number;
    transcriptionStream?: AsyncGenerator<any> | null;
}

// Store active audio sessions by socket ID
const audioSessions = new Map<string, AudioStreamSession>();

/**
 * Handle audio stream start
 */
export async function handleAudioStreamStart(socket: Socket, data: { 
    sampleRate?: number;
    model?: string;
    language?: string;
}) {
    const sessionId = socket.id;
    console.log(`[AudioStream] Starting audio stream for client ${sessionId}`);
    
    // Initialize session
    const session: AudioStreamSession = {
        isActive: true,
        audioChunks: [],
        sampleRate: data.sampleRate || 16000,
        startTime: Date.now(),
    };
    
    audioSessions.set(sessionId, session);
    
    try {
        const { ensembleListen } = await getEnsemble();
        
        // Create agent definition
        const agent = {
            model: data.model || 'whisper-1',
        };
        
        // Create transcription options
        const options = {
            stream: true,
            language: data.language || 'en',
            vad: {
                enabled: true,
                mode: 'server_vad' as const,
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 500,
            },
            audio_format: {
                sampleRate: data.sampleRate || 16000,
                channels: 1,
                bitDepth: 16,
                encoding: 'pcm' as const,
            },
        };
        
        // Create a readable stream that will be fed by incoming audio chunks
        const audioStream = new ReadableStream<Uint8Array>({
            async start(controller) {
                // Wait for audio data
                while (session.isActive || session.audioChunks.length > 0) {
                    if (session.audioChunks.length > 0) {
                        const chunk = session.audioChunks.shift()!;
                        controller.enqueue(new Uint8Array(chunk));
                    } else {
                        // Wait for more data
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
                controller.close();
            }
        });
        
        // Start transcription
        session.transcriptionStream = ensembleListen(audioStream, agent, options);
        
        // Process transcription events
        for await (const event of session.transcriptionStream) {
            if (!session.isActive && event.type !== 'transcription_complete') {
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
                    
                case 'transcription_delta':
                    console.log('[AudioStream] Delta:', event.delta);
                    break;
                    
                case 'transcription_complete':
                    console.log('[AudioStream] Complete:', event.text);
                    break;
                    
                case 'vad_speech_start':
                    console.log('[AudioStream] Speech detected');
                    break;
                    
                case 'vad_speech_end':
                    console.log('[AudioStream] Speech ended');
                    break;
                    
                case 'error':
                    console.error('[AudioStream] Error:', event.error);
                    break;
            }
        }
    } catch (error) {
        console.error('[AudioStream] Error processing audio stream:', error);
        socket.emit('audio:error', { 
            error: 'Failed to process audio stream',
            details: error instanceof Error ? error.message : String(error)
        });
    }
    
    // Send acknowledgment
    socket.emit('audio:stream_started', { sessionId });
}

/**
 * Handle incoming audio data chunks
 */
export function handleAudioStreamData(socket: Socket, data: { audio: ArrayBuffer | string }) {
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
    
    // Add to session buffer
    session.audioChunks.push(audioBuffer);
}

/**
 * Handle audio stream stop
 */
export function handleAudioStreamStop(socket: Socket) {
    const sessionId = socket.id;
    const session = audioSessions.get(sessionId);
    
    if (!session) {
        console.warn(`[AudioStream] No session found for client ${sessionId}`);
        return;
    }
    
    console.log(`[AudioStream] Stopping audio stream for client ${sessionId}`);
    session.isActive = false;
    
    // Clean up session after a delay to allow final processing
    setTimeout(() => {
        audioSessions.delete(sessionId);
    }, 5000);
    
    // Send acknowledgment
    socket.emit('audio:stream_stopped', { sessionId });
}

/**
 * Clean up audio session when socket disconnects
 */
export function cleanupAudioSession(socketId: string) {
    const session = audioSessions.get(socketId);
    if (session) {
        console.log(`[AudioStream] Cleaning up session for disconnected client ${socketId}`);
        session.isActive = false;
        audioSessions.delete(socketId);
    }
}