import { Router, Request, Response } from 'express';
import {
    VOICE_OPTIONS,
    getVoiceById,
    VoiceOption,
} from '../utils/voice_config';
import { getCurrentVoice, setCurrentVoice } from '../utils/talk';

const router = Router();

// Helper function to filter voices based on available API keys
function getAvailableVoices(): VoiceOption[] {
    const availableProviders: Set<string> = new Set();

    // Check which providers have API keys
    if (process.env.ELEVENLABS_API_KEY) {
        availableProviders.add('elevenlabs');
    }
    if (process.env.GOOGLE_API_KEY) {
        availableProviders.add('gemini');
    }
    if (process.env.OPENAI_API_KEY) {
        availableProviders.add('openai');
    }

    // Filter voices based on available providers
    return VOICE_OPTIONS.filter(voice =>
        availableProviders.has(voice.provider)
    );
}

// Get all available voices
router.get('/api/voices', (req: Request, res: Response) => {
    try {
        const availableVoices = getAvailableVoices();
        const currentVoiceId = getCurrentVoice();

        // Check if current voice is still available, if not use the first available voice
        const currentVoiceAvailable = availableVoices.some(
            v => v.id === currentVoiceId
        );
        if (!currentVoiceAvailable && availableVoices.length > 0) {
            setCurrentVoice(availableVoices[0].id);
        }

        res.json({
            success: true,
            voices: availableVoices,
            currentVoice: currentVoiceAvailable
                ? currentVoiceId
                : availableVoices[0]?.id || null,
        });
    } catch (error) {
        console.error('Error getting voices:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get voices',
        });
    }
});

// Get current voice
router.get('/api/voices/current', (req: Request, res: Response) => {
    try {
        const currentVoiceId = getCurrentVoice();
        const currentVoice = getVoiceById(currentVoiceId);

        res.json({
            success: true,
            currentVoiceId,
            currentVoice,
        });
    } catch (error) {
        console.error('Error getting current voice:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get current voice',
        });
    }
});

// Set current voice
router.post('/api/voices/current', (req: Request, res: Response) => {
    try {
        const { voiceId } = req.body;

        if (!voiceId) {
            return res.status(400).json({
                success: false,
                error: 'Voice ID is required',
            });
        }

        const voice = getVoiceById(voiceId);
        if (!voice) {
            return res.status(404).json({
                success: false,
                error: 'Voice not found',
            });
        }

        // Check if the voice's provider has an API key
        const availableVoices = getAvailableVoices();
        const isVoiceAvailable = availableVoices.some(v => v.id === voiceId);

        if (!isVoiceAvailable) {
            return res.status(400).json({
                success: false,
                error: `Voice provider ${voice.provider} is not configured with an API key`,
            });
        }

        setCurrentVoice(voiceId);

        res.json({
            success: true,
            currentVoiceId: voiceId,
            currentVoice: voice,
        });
    } catch (error) {
        console.error('Error setting current voice:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to set current voice',
        });
    }
});

// Preview a voice
router.post('/api/voices/preview', async (req: Request, res: Response) => {
    try {
        const { voiceId } = req.body;

        if (!voiceId) {
            return res.status(400).json({
                success: false,
                error: 'Voice ID is required',
            });
        }

        const voice = getVoiceById(voiceId);
        if (!voice) {
            return res.status(404).json({
                success: false,
                error: 'Voice not found',
            });
        }

        // Check if the voice's provider has an API key
        const availableVoices = getAvailableVoices();
        const isVoiceAvailable = availableVoices.some(v => v.id === voiceId);

        if (!isVoiceAvailable) {
            return res.status(400).json({
                success: false,
                error: `Voice provider ${voice.provider} is not configured with an API key`,
            });
        }

        // Get the user's name from environment or use a default
        const userName = process.env.YOUR_NAME || 'there';
        const previewText = `Hi ${userName}! How do I sound?`;

        // Import talk function
        const { talk } = await import('../utils/talk.js');

        // Create a preview process ID
        const previewProcessId = `voice-preview-${Date.now()}`;

        // Generate the preview audio
        await talk(previewText, 'friendly and warm', previewProcessId, voiceId);

        res.json({
            success: true,
            message: 'Voice preview sent',
            processId: previewProcessId,
        });
    } catch (error) {
        console.error('Error previewing voice:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to preview voice',
        });
    }
});

export default router;
