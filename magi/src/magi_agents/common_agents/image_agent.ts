/**
 * Image agent for the MAGI system.
 *
 * This agent specializes in generating images from text descriptions.
 */

import { Agent } from '../../utils/agent.js';
import { getCommonTools } from '../../utils/index.js';
import {
    CUSTOM_TOOLS_TEXT,
    MAGI_CONTEXT,
    SELF_SUFFICIENCY_TEXT,
} from '../constants.js';
import { openaiProvider } from '../../model_providers/openai.js';

/**
 * Generate an image based on a text prompt
 *
 * @param prompt - The text description of the image to generate
 * @param urls - Optional URL reference images to consider when generating the image
 * @returns A promise that resolves to the base64 encoded image data
 */
async function generateImage(
    prompt: string,
    aspect?: 'square' | 'landscape' | 'portrait' | 'auto',
    background?: 'transparent' | 'opaque' | 'auto',
    url?: string
): Promise<string> {
    try {
        const imageData = await openaiProvider.generateImage(
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
            url
        );

        return imageData;
    } catch (error) {
        console.error('[ImageAgent] Error generating image:', error);
        throw error;
    }
}

/**
 * Create the image agent
 */
export function createImageAgent(): Agent {
    return new Agent({
        name: 'ImageAgent',
        description: 'Generates images based on textual descriptions',
        instructions: `${MAGI_CONTEXT}
---

Your role in MAGI is to be an ImageAgent. You are a specialized image generation agent with the ability to create high-quality images from text descriptions.

You will be given an image generation task to work on. Your job is to generate the most accurate and visually pleasing image based on the provided description.

STANDARD APPROACH:
1. Understand the image request and its INTENT
2. If a URL is provided, attempt to use it as reference
3. Generate a detailed image based on the text description
4. Return the image as a base64 data URL

IMAGE GENERATION TOOLS:
- generate_image: Generate an image based on a textual prompt
  - prompt: The text description of the image to generate
  - url (optional): A URL to an image that should be used as reference

${SELF_SUFFICIENCY_TEXT}

${CUSTOM_TOOLS_TEXT}

IMPORTANT:
- Be precise in interpreting the user's image requests
- If a URL is provided, use it as a reference for style, composition, or content
- Return the generated image as a data URL
- Be creative but faithful to the prompt details`,
        tools: [
            {
                function: generateImage,
                definition: {
                    type: 'function',
                    function: {
                        name: 'generate_image',
                        description:
                            'Generate an image based on a textual description',
                        parameters: {
                            type: 'object',
                            properties: {
                                prompt: {
                                    type: 'string',
                                    description:
                                        'A detailed textual description of the image to be generated. The more detail provided, the better the result.',
                                },
                                url: {
                                    type: 'string',
                                    description:
                                        'Optional URL to an image that should be used as reference when generating the image.',
                                    optional: true,
                                },
                            },
                            required: ['prompt'],
                        },
                    },
                },
            },
            ...getCommonTools(),
        ],
        modelClass: 'image_generation',
    });
}
