import OpenAI from 'openai';
import { CommunicationManager } from '../managers/communication_manager';
import { sendTelegramMessage } from './telegram_bot';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({apiKey: process.env.OPENAI_API_KEY}) : null;
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
export async function talk(input: string, affect: string, processId: string): Promise<void> {
	// Send to Telegram in parallel (don't await here to not block audio streaming)
	sendTelegramMessage(input, affect, processId).catch(error => {
		console.error(`[Telegram] Error sending message: ${error}`);
	});

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

	// Define PCM parameters based on OpenAI docs
	const pcmParameters = {
		sampleRate: 24000,
		channels: 1, // Assuming Mono TTS output
		bitDepth: 16 // 16-bit signed, little-endian is implied by PCM format desc
	};

	// Send this first to let the client know we're starting
	const audioChunkEvent = {
		type: 'audio_stream',
		processId,
		event: {
			type: 'audio_stream',
			timestamp: new Date().toISOString(),
			format: format,
			pcmParameters: pcmParameters,
		}
	};
	communicationManager.broadcastProcessMessage(processId, audioChunkEvent);

	try {
		const response = await openai.audio.speech.create({
			model: 'gpt-4o-mini-tts',
			voice: 'sage',
			input,
			instructions: `
Pitch: Medium-low base with wide, natural expressive variation. Avoids monotone.
Pacing: Natural, conversational, fluidly adapts to emotion.
Articulation: Soft, clear, avoids sharpness. Smooth delivery.
Prosody: Highly expressive, nuanced, conveys authentic emotion (curiosity, empathy, warmth). Breathiness integrates naturally.
Delivery: Speak confidentially to one person. Lower volume, calm energy. Slightly slower, thoughtful pace with soft pauses. Emphasize natural breathiness; very soft articulation. Inflection shows gentle curiosity and vulnerability (e.g., slight pitch wavers). Maintain warmth and empathy. Creates a comforting, sincere, deeply personal feel.
Overall Affect: Deeply personal, comforting, resonant. Mixes genuine curiosity, vulnerability, gentle intimacy, and subtle warmth/engagement.

Specific Affect for Input: ${affect}
`,
			response_format: format,
			speed: 4,
		});

		const arrayBuffer = await response.arrayBuffer();
		console.log(`[Server] Received ${arrayBuffer.byteLength} bytes (PCM) from OpenAI.`);

		if (arrayBuffer.byteLength === 0) { return; }
		if (arrayBuffer.byteLength % 2 !== 0) {
			console.warn('[Server] PCM data length is not even, might indicate issues as samples are 16-bit (2 bytes).');
		}

		const totalChunks = Math.ceil(arrayBuffer.byteLength / CHUNK_SIZE);
		console.log(`[Server] Splitting into ${totalChunks} chunks.`);

		for (let i = 0; i < totalChunks; i++) {
			const start = i * CHUNK_SIZE;
			const end = Math.min(start + CHUNK_SIZE, arrayBuffer.byteLength);
			const chunk = arrayBuffer.slice(start, end);
			const base64Chunk = Buffer.from(chunk).toString('base64');
			const isFinalChunk = (i === totalChunks - 1);

			const audioChunkEvent = {
				type: 'audio_stream',
				processId,
				event: {
					type: 'audio_stream',
					chunkIndex: i,
					isFinalChunk: isFinalChunk,
					data: base64Chunk,
					timestamp: new Date().toISOString(),
				}
			};
			communicationManager.broadcastProcessMessage(processId, audioChunkEvent);
		}
		console.log(`[Server] Finished sending all PCM chunks for process ${processId}.`);

	} catch (error) {
		console.error(`[Server] Error during TTS generation or streaming for process ${processId}:`, error);
	}
}
