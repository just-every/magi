import { openaiProvider } from '../model_providers/openai.js';
import { createToolFunction } from './tool_call.js';
import { ToolFunction } from '../types/shared-types.js';
import fs from 'fs';
import path from 'path';
import { get_output_dir, write_file } from './file_utils.js';

/**
 * Generate an image based on a text prompt and save it to a file
 *
 * @param prompt - The text description of the image to generate
 * @param aspect - Optional aspect ratio of the image
 * @param background - Optional background type of the image
 * @param source_image - Optional URL or base64 encoded string containing an image that should be edited or used as reference
 * @param output_path - Optional file path where the image should be saved. If not provided, the image will be saved to a default location.
 * @returns A promise that resolves to the path where the image was saved
 */
async function generate_image(
    prompt: string,
    aspect?: 'square' | 'landscape' | 'portrait' | 'auto',
    background?: 'transparent' | 'opaque' | 'auto',
    source_image?: string,
    output_path?: string
): Promise<string> {
    try {
        // Generate the image using OpenAI API
        const imageDataUrl = await openaiProvider.generateImage(
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

        // Extract the base64 data (remove the data URL prefix)
        const base64Data = imageDataUrl.replace(/^data:image\/png;base64,/, '');

        // Convert base64 to buffer
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // Determine the target file path
        let targetPath = output_path;
        if (!targetPath) {
            // Use the default location in the output directory
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            targetPath = path.join(
                '/magi_output/shared/generate_image',
                `image_${timestamp}.png`
            );
        }

        write_file(targetPath, imageBuffer.buffer);

        // Return the path where the image was saved
        return targetPath;
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
                source_image: {
                    description:
                        'A URL or base64 encoded string containing an image that should be edited or used as reference',
                    optional: true,
                },
                output_path: {
                    description:
                        'Destination file path for the generated PNG. If omitted, the file is saved to /magi_output/shared/generate_image/ with a timestamp.',
                    optional: true,
                },
            }
        ),
    ];
}
