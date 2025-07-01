export interface VoiceOption {
    id: string;
    name: string;
    provider: 'openai' | 'elevenlabs' | 'gemini';
    model: string;
    voice: string;
    description?: string;
}

export const VOICE_OPTIONS: VoiceOption[] = [
    // ElevenLabs Voices
    {
        id: 'elevenlabs-rachel',
        name: 'Rachel',
        provider: 'elevenlabs',
        model: 'eleven_multilingual_v2',
        voice: 'rachel',
        description: 'Natural female voice',
    },
    {
        id: 'elevenlabs-bella',
        name: 'Bella',
        provider: 'elevenlabs',
        model: 'eleven_multilingual_v2',
        voice: 'bella',
        description: 'Youthful female voice',
    },
    {
        id: 'elevenlabs-antoni',
        name: 'Antoni',
        provider: 'elevenlabs',
        model: 'eleven_multilingual_v2',
        voice: 'antoni',
        description: 'Professional male voice',
    },
    {
        id: 'elevenlabs-josh',
        name: 'Josh',
        provider: 'elevenlabs',
        model: 'eleven_multilingual_v2',
        voice: 'josh',
        description: 'Deep male voice',
    },
    {
        id: 'elevenlabs-adam',
        name: 'Adam',
        provider: 'elevenlabs',
        model: 'eleven_multilingual_v2',
        voice: 'adam',
        description: 'Narrative male voice',
    },
    {
        id: 'elevenlabs-sam',
        name: 'Sam',
        provider: 'elevenlabs',
        model: 'eleven_multilingual_v2',
        voice: 'sam',
        description: 'Energetic male voice',
    },

    // Gemini Voices
    {
        id: 'gemini-kore',
        name: 'Kore',
        provider: 'gemini',
        model: 'gemini-2.5-flash-preview-tts',
        voice: 'Kore',
        description: 'Natural speaking voice',
    },
    {
        id: 'gemini-puck',
        name: 'Puck',
        provider: 'gemini',
        model: 'gemini-2.5-flash-preview-tts',
        voice: 'Puck',
        description: 'Playful voice',
    },
    {
        id: 'gemini-charon',
        name: 'Charon',
        provider: 'gemini',
        model: 'gemini-2.5-flash-preview-tts',
        voice: 'Charon',
        description: 'Deep and mysterious',
    },
    {
        id: 'gemini-fenrir',
        name: 'Fenrir',
        provider: 'gemini',
        model: 'gemini-2.5-flash-preview-tts',
        voice: 'Fenrir',
        description: 'Strong and commanding',
    },
    {
        id: 'gemini-aoede',
        name: 'Aoede',
        provider: 'gemini',
        model: 'gemini-2.5-flash-preview-tts',
        voice: 'Aoede',
        description: 'Musical and melodic',
    },

    // OpenAI Voices
    {
        id: 'openai-alloy',
        name: 'Alloy',
        provider: 'openai',
        model: 'gpt-4o-mini-tts',
        voice: 'alloy',
        description: 'Neutral and balanced',
    },
    {
        id: 'openai-echo',
        name: 'Echo',
        provider: 'openai',
        model: 'gpt-4o-mini-tts',
        voice: 'echo',
        description: 'Warm and conversational',
    },
    {
        id: 'openai-fable',
        name: 'Fable',
        provider: 'openai',
        model: 'gpt-4o-mini-tts',
        voice: 'fable',
        description: 'Expressive and dynamic',
    },
    {
        id: 'openai-onyx',
        name: 'Onyx',
        provider: 'openai',
        model: 'gpt-4o-mini-tts',
        voice: 'onyx',
        description: 'Deep and authoritative',
    },
    {
        id: 'openai-nova',
        name: 'Nova',
        provider: 'openai',
        model: 'gpt-4o-mini-tts',
        voice: 'nova',
        description: 'Friendly and upbeat',
    },
    {
        id: 'openai-shimmer',
        name: 'Shimmer',
        provider: 'openai',
        model: 'gpt-4o-mini-tts',
        voice: 'shimmer',
        description: 'Gentle and soothing',
    },
];

// Default voice
export const DEFAULT_VOICE_ID = 'elevenlabs-rachel';

export function getVoiceById(id: string): VoiceOption | undefined {
    return VOICE_OPTIONS.find(voice => voice.id === id);
}
