import { openaiProvider } from '../model_providers/openai.js';
import { createToolFunction } from './tool_call.js';
import { ToolFunction } from '../types/shared-types.js';

/**
 * Generate an image based on a text prompt
 *
 * @param prompt - The text description of the image to generate
 * @param urls - Optional URL reference images to consider when generating the image
 * @returns A promise that resolves to the base64 encoded image data
 */
async function generate_image(
    prompt: string,
    aspect?: 'square' | 'landscape' | 'portrait' | 'auto',
    background?: 'transparent' | 'opaque' | 'auto',
    source_image?: string
): Promise<string> {
    try {
        return await openaiProvider.generateImage(
            prompt,
            'gpt-image-1',
            background || 'auto',
            'medium',
            aspect === 'landscape'
                ? '1536x1024'
                : aspect === 'portrait'
                  ? '1024x1536'
                  : aspect === 'auto'
                    ? 'auto'
                    : '1024x1024',
            source_image
        );
    } catch (error) {
        console.error('[ImageAgent] Error generating image:', error);
        throw error;
    }
}
/**
 * Get all file tools as an array of tool definitions
 */
export function getImageGenerationTools(): ToolFunction[] {
    return [
        createToolFunction(
            generate_image,
            'Generate or edit an image based on a textual description. Uses high-quality image generation models. Please note that image generation may take several minutes.',
            {
                prompt: 'A text description of the desired image',
                aspect: {
                    description: 'The aspect ratio of the image',
                    type: 'string',
                    enum: ['square', 'landscape', 'portrait', 'auto'],
                    default: 'auto',
                },
                background: {
                    description: 'The background type of the image',
                    type: 'string',
                    enum: ['transparent', 'opaque', 'auto'],
                    default: 'auto',
                },
                source_image:
                    'A URL or base64 encoded string containing an image that should be edited or used as reference',
            }
        ),
    ];
}
