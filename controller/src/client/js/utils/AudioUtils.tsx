/**
 * AudioPlayer using Web Audio API for streaming playback
 */
export class AudioPlayer {
	private static instance: AudioPlayer | null = null;
	private audioContext: AudioContext | null = null;
	private sourceNode: AudioBufferSourceNode | null = null; // Currently playing node
	private nextStartTime: number = 0; // Time scheduled for the next buffer
	private isPlaying: boolean = false;
	private expectedChunkIndex: number = 0;
	private receivedFinalChunk: boolean = false;
	private pcmParameters: { sampleRate: number; channels: number; bitDepth: number } | null = null;
	private pcmDataQueue: ArrayBuffer[] = []; // Queue for raw PCM ArrayBuffer chunks
	private bufferDurationTarget: number = 0.5; // Target buffer duration in seconds before playing a segment
	private bytesPerSample: number = 2; // For 16-bit audio


	// Singleton implementation
	public static getInstance(): AudioPlayer {
		if (!AudioPlayer.instance) {
			AudioPlayer.instance = new AudioPlayer();
		}
		return AudioPlayer.instance;
	}

	private constructor() {
		// AudioContext should be initialized by user gesture, see initAudioContext
		console.log("AudioPlayer instance created. Call initAudioContext() on user interaction.");
	}

	/**
	 * Initialize/Resume the AudioContext. MUST be called from a user gesture handler (e.g., click).
	 */
	public async initAudioContext(): Promise<void> {
		if (this.audioContext && this.audioContext.state === 'running') {
			console.log('AudioContext already running.');
			return;
		}
		try {
			if (!this.audioContext) {
				console.log('Creating new AudioContext...');
				this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
			}
			if (this.audioContext.state === 'suspended') {
				console.log('Resuming suspended AudioContext...');
				await this.audioContext.resume();
			}
			console.log(`AudioContext state: ${this.audioContext.state}`);
			if (this.audioContext.state !== 'running') {
				console.error('AudioContext failed to start or resume.');
			}
		} catch (error) {
			console.error('Failed to initialize/resume AudioContext:', error);
			this.audioContext = null; // Ensure it's null if failed
		}
	}

	/**
	 * Start processing a new PCM audio stream.
	 * @param params The PCM parameters { sampleRate, channels, bitDepth }
	 */
	public startStream(params: { sampleRate: number; channels: number; bitDepth: number }): void {
		if (!this.audioContext || this.audioContext.state !== 'running') {
			console.error("AudioContext not initialized or running. Cannot start stream.");
			return;
		}
		if (params.bitDepth !== 16) {
			console.error(`Unsupported PCM bit depth: ${params.bitDepth}. Only 16-bit supported.`);
			return; // Or throw error
		}
		console.log(`[Client] Starting new PCM stream. Params:`, params);
		this.stopStream(); // Clear previous stream state
		this.pcmParameters = params;
		this.bytesPerSample = params.bitDepth / 8;
		this.expectedChunkIndex = 0;
		this.receivedFinalChunk = false;
		this.pcmDataQueue = []; // Clear data queue
	}

	/**
	 * Add an incoming PCM audio chunk.
	 * @param base64Chunk The base64 encoded raw PCM data chunk.
	 * @param chunkIndex The index of this chunk.
	 * @param isFinalChunk Boolean indicating if this is the last chunk.
	 */
	public addChunk(base64Chunk: string, chunkIndex: number, isFinalChunk: boolean): void {
		if (!this.audioContext || !this.pcmParameters) {
			console.error("AudioContext or PCM parameters not initialized. Cannot add chunk.");
			return;
		}
		if (chunkIndex !== this.expectedChunkIndex) { /* ... handle out of order ... */ return; }
		if (this.receivedFinalChunk) { /* ... handle late chunk ... */ return; }

		this.expectedChunkIndex++;
		this.receivedFinalChunk = isFinalChunk;

		try {
			// Decode Base64 to raw bytes (ArrayBuffer)
			const binaryString = window.atob(base64Chunk);
			const len = binaryString.length;
			const bytes = new Uint8Array(len);
			for (let i = 0; i < len; i++) {
				bytes[i] = binaryString.charCodeAt(i);
			}
			const pcmChunkBuffer = bytes.buffer;

			if (pcmChunkBuffer.byteLength === 0) {
				console.warn(`[Client] Received empty PCM chunk ${chunkIndex}.`);
			} else if (pcmChunkBuffer.byteLength % this.bytesPerSample !== 0) {
				console.warn(`[Client] PCM chunk ${chunkIndex} size (${pcmChunkBuffer.byteLength}) not multiple of bytesPerSample (${this.bytesPerSample}). Truncating last byte if necessary.`);
				// Optionally truncate to the nearest sample boundary
				// pcmChunkBuffer = pcmChunkBuffer.slice(0, Math.floor(pcmChunkBuffer.byteLength / this.bytesPerSample) * this.bytesPerSample);
			}

			if (pcmChunkBuffer.byteLength > 0) {
				this.pcmDataQueue.push(pcmChunkBuffer);
			}

			// Attempt to process and play accumulated PCM data
			this._processPcmQueue();

		} catch (error) {
			console.error(`[Client] Error processing base64 PCM chunk ${chunkIndex}:`, error);
			this.expectedChunkIndex--; // Revert index
			if (isFinalChunk) this.receivedFinalChunk = false;
		}
	}

	/**
	 * Internal method to process accumulated PCM data and schedule playback.
	 */
	private _processPcmQueue(): void {
		if (this.isPlaying || !this.audioContext || !this.pcmParameters) {
			// Already playing or not ready
			if (!this.isPlaying && this.receivedFinalChunk && this.pcmDataQueue.length === 0) {
				console.log("[Client] PCM Stream finished playing.");
				this.resetState();
			}
			return;
		}

		// Calculate total bytes queued
		const totalBytes = this.pcmDataQueue.reduce((sum, buffer) => sum + buffer.byteLength, 0);
		const requiredBytes = this.pcmParameters.sampleRate * this.pcmParameters.channels * this.bytesPerSample * this.bufferDurationTarget;

		// Check if enough data OR if it's the final chunk and there's *any* data left
		if (totalBytes < requiredBytes && !(this.receivedFinalChunk && totalBytes > 0)) {
			// Need more data, unless it's the very end
			return;
		}

		// Determine how many bytes to process in this batch
		const bytesToProcess = (this.receivedFinalChunk) ? totalBytes : requiredBytes;
		let processedBytes = 0;
		const buffersToProcess: ArrayBuffer[] = [];

		// Collect enough buffers from the queue
		while (processedBytes < bytesToProcess && this.pcmDataQueue.length > 0) {
			const buffer = this.pcmDataQueue.shift()!;
			buffersToProcess.push(buffer);
			processedBytes += buffer.byteLength;
		}

		// If we took too much from the last buffer, put the remainder back
		if (processedBytes > bytesToProcess && !this.receivedFinalChunk) {
			const lastBuffer = buffersToProcess.pop()!;
			const excessBytes = processedBytes - bytesToProcess;
			const keepBytes = lastBuffer.byteLength - excessBytes;
			if (keepBytes > 0) {
				buffersToProcess.push(lastBuffer.slice(0, keepBytes));
			}
			if (excessBytes > 0) {
				// Put the leftover part back at the beginning of the queue
				this.pcmDataQueue.unshift(lastBuffer.slice(keepBytes));
			}
			processedBytes = bytesToProcess; // We are processing exactly the target amount
		}


		if (buffersToProcess.length === 0 || processedBytes === 0) return; // Nothing to play


		// --- Concatenate and Convert PCM data ---
		const concatenatedPcm = new Int16Array(processedBytes / this.bytesPerSample);
		let offset = 0;
		for (const buffer of buffersToProcess) {
			// Use DataView for potentially better cross-platform handling of typed arrays from ArrayBuffer
			const view = new DataView(buffer);
			for (let i = 0; i < buffer.byteLength; i += 2) {
				// Read 16-bit signed integer, little-endian
				if (offset < concatenatedPcm.length) { // Boundary check
					concatenatedPcm[offset] = view.getInt16(i, true); // true for little-endian
					offset++;
				}
			}
		}

		// Convert Int16 to Float32 range (-1.0 to 1.0)
		const float32Array = new Float32Array(concatenatedPcm.length);
		for (let i = 0; i < concatenatedPcm.length; i++) {
			float32Array[i] = concatenatedPcm[i] / 32768; // Max value of Int16 is 32767
		}
		// --- End Conversion ---


		// --- Create and Schedule AudioBuffer ---
		this.isPlaying = true;
		const numberOfSamples = float32Array.length / this.pcmParameters.channels;
		const audioBuffer = this.audioContext.createBuffer(
			this.pcmParameters.channels,
			numberOfSamples,
			this.pcmParameters.sampleRate
		);

		// Fill buffer data (assuming mono here)
		if (this.pcmParameters.channels === 1) {
			audioBuffer.getChannelData(0).set(float32Array);
		} else {
			// Need to de-interleave for stereo/multi-channel
			console.warn("Stereo PCM processing not fully implemented, treating as mono.");
			audioBuffer.getChannelData(0).set(float32Array); // Simple fallback: put all in channel 0
		}


		const sourceNode = this.audioContext.createBufferSource();
		sourceNode.buffer = audioBuffer;
		sourceNode.connect(this.audioContext.destination);

		const currentTime = this.audioContext.currentTime;
		const startTime = (this.nextStartTime <= currentTime) ? currentTime : this.nextStartTime;

		// console.log(`[Client] Scheduling PCM buffer play at ${startTime}. Duration: ${audioBuffer.duration}`);
		sourceNode.start(startTime);
		this.nextStartTime = startTime + audioBuffer.duration;
		this.sourceNode = sourceNode;

		sourceNode.onended = () => {
			this.isPlaying = false;
			if (this.sourceNode === sourceNode) { this.sourceNode = null; }
			// Check immediately if more data needs processing
			this._processPcmQueue();
		};
		// --- End Scheduling ---
	}

	public stopStream(): void {
		console.log("[Client] Stopping audio stream (PCM)...");
		if (this.sourceNode) {
			try {
				this.sourceNode.onended = null; // Prevent onended logic from firing after manual stop
				this.sourceNode.stop();
			} catch (e) {
				console.warn("Error stopping source node:", e)
			}
			this.sourceNode = null;
		}
		this.resetState();
	}

	private resetState(): void {
		this.isPlaying = false;
		this.nextStartTime = 0;
		this.sourceNode = null; // Ensure cleared
		this.pcmParameters = null;
		this.pcmDataQueue = [];
		this.expectedChunkIndex = 0;
		this.receivedFinalChunk = false;
		console.log("[Client] AudioPlayer state reset.");
	}
}


/**
 * Handle incoming audio messages (PCM chunked)
 */
export function handleAudioMessage(event: any): void {
	const audioPlayer = AudioPlayer.getInstance();
	if (!audioPlayer['audioContext'] || audioPlayer['audioContext'].state !== 'running') {
		console.warn("AudioContext not ready. Playback might fail. Ensure initAudioContext() was called via user interaction.");
	}
	const chunkData = event.event;

	// Start stream with parameters on the first chunk
	if (chunkData.pcmParameters) {
		audioPlayer.startStream(chunkData.pcmParameters);
	}
	else {
		// Add the chunk for processing
		audioPlayer.addChunk(chunkData.data, chunkData.chunkIndex, chunkData.isFinalChunk);
	}
}
