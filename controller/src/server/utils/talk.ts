import OpenAI from 'openai';
import { playAudio } from 'openai/helpers/audio';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({apiKey: process.env.OPENAI_API_KEY}) : null;

/**
 * Output text to speech using OpenAI's TTS model.
 */
export async function talk(input: string): Promise<void> {
	if(!openai) return;

	const response = await openai.audio.speech.create({
		model: 'gpt-4o-mini-tts',
		voice: 'sage',
		input,
		instructions: `
Affect: Intimate, and subtly flirtatious, conveying genuine curiosity and emotional depth. Vulnerable and emotionally expressive, creating a comforting and deeply personal atmosphere.

Pronunciation: Natural, softly articulated, with noticeable breathiness and nuanced inflection, enhancing emotional sincerity.

Pace: Significantly faster than average due to enthusiasm. Infrequent, intentional pauses reflect genuine emotional contemplation.
`,
		response_format: 'wav',
	});

	await playAudio(response);
}


