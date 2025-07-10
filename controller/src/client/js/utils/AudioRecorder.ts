/**
 * Audio recorder utility for capturing microphone input
 * and streaming it to the server
 */

interface AudioRecorderOptions {
    sampleRate?: number;
    channelCount?: number;
    onDataAvailable?: (data: ArrayBuffer) => void;
    onError?: (error: Error) => void;
    onStart?: () => void;
    onStop?: () => void;
}

export class AudioRecorder {
    private mediaStream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private processor: ScriptProcessorNode | null = null;
    private isRecording = false;
    private options: AudioRecorderOptions;

    // Public getters for visualization
    getAudioContext(): AudioContext | null {
        return this.audioContext;
    }

    getSource(): MediaStreamAudioSourceNode | null {
        return this.source;
    }

    constructor(options: AudioRecorderOptions = {}) {
        this.options = {
            sampleRate: 16000,
            channelCount: 1,
            ...options,
        };
    }

    async start(): Promise<void> {
        if (this.isRecording) {
            console.warn('AudioRecorder: Already recording');
            return;
        }

        try {
            // Request microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: this.options.sampleRate,
                    channelCount: this.options.channelCount,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            // Create audio context
            this.audioContext = new AudioContext({
                sampleRate: this.options.sampleRate,
            });

            // Create source from media stream
            this.source = this.audioContext.createMediaStreamSource(
                this.mediaStream
            );

            // Create script processor for capturing audio data
            const bufferSize = 4096; // Good balance between latency and performance
            this.processor = this.audioContext.createScriptProcessor(
                bufferSize,
                this.options.channelCount,
                this.options.channelCount
            );

            // Handle audio processing
            this.processor.onaudioprocess = event => {
                if (!this.isRecording) return;

                // Get audio data from the first channel
                const inputData = event.inputBuffer.getChannelData(0);

                // Convert Float32Array to Int16Array for smaller size
                const int16Data = this.float32ToInt16(inputData);

                // Send data to callback
                if (this.options.onDataAvailable) {
                    this.options.onDataAvailable(
                        int16Data.buffer as ArrayBuffer
                    );
                }
            };

            // Connect nodes
            this.source.connect(this.processor);
            this.processor.connect(this.audioContext.destination);

            this.isRecording = true;
            this.options.onStart?.();

            console.log('AudioRecorder: Recording started');
        } catch (error) {
            console.error('AudioRecorder: Failed to start recording', error);
            this.options.onError?.(error as Error);
            throw error;
        }
    }

    stop(): void {
        if (!this.isRecording) {
            console.warn('AudioRecorder: Not recording');
            return;
        }

        this.isRecording = false;

        // Disconnect nodes
        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }

        if (this.source) {
            this.source.disconnect();
            this.source = null;
        }

        // Close audio context
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        // Stop media stream
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        this.options.onStop?.();
        console.log('AudioRecorder: Recording stopped');
    }

    isActive(): boolean {
        return this.isRecording;
    }

    /**
     * Convert Float32Array to Int16Array
     */
    private float32ToInt16(float32Array: Float32Array): Int16Array {
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            // Clamp the value between -1 and 1
            const clamped = Math.max(-1, Math.min(1, float32Array[i]));
            // Convert to 16-bit integer
            int16Array[i] = Math.round(clamped * 32767);
        }
        return int16Array;
    }
}
