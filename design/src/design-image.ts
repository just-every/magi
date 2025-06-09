import { ensembleImage, createToolFunction } from '@just-every/ensemble';
import type { ResponseInput, ToolFunction } from '@just-every/ensemble';
import path from 'path';
import fs from 'fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createBase64FromImage } from './utils/image-utils.js';
import sharp from 'sharp';
import {
    DESIGN_ASSET_TYPES,
} from './constants.js';

// Extended ToolFunction with handler for local use
export interface ExtendedToolFunction extends ToolFunction {
    handler: (args: any) => Promise<any>;
}

// Base directory for storing images - configurable via environment
const DEFAULT_OUTPUT_DIR = process.env.DESIGN_OUTPUT_DIR || path.join(process.cwd(), '.output');

/**
 * Ensure output directory exists
 */
function ensureOutputDir(dir: string) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/**
 * Write file utility - standalone version
 */
function write_file(filePath: string, data: ArrayBuffer | Buffer) {
    const dir = path.dirname(filePath);
    ensureOutputDir(dir);

    if (data instanceof ArrayBuffer) {
        fs.writeFileSync(filePath, Buffer.from(data));
    } else {
        fs.writeFileSync(filePath, data);
    }
}

/**
 * Create an extended tool function wrapper
 */
function createExtendedToolFunction<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    description: string,
    parameters: Record<string, any>
): ExtendedToolFunction {
    const baseToolFunction = createToolFunction(
        fn as any,
        description,
        parameters
    );

    return {
        ...baseToolFunction,
        handler: async (args: any) => {
            const argArray = Object.keys(parameters).map(key => args[key]);
            return await fn(...argArray as T);
        }
    };
}

/**
 * Communication manager stub - logs to console instead of sending to UI
 */
const communicationManager = {
    send: (data: any) => {
        console.log(`[DesignImage] ${data.type}:`, {
            timestamp: data.timestamp,
            prompt: data.prompt,
            data: data.data ? `[${typeof data.data}]` : undefined
        });
    }
};

/**
 * Resize an image to a maximum width of 1536px while maintaining aspect ratio
 * Only resizes if the image is larger than the target width
 *
 * @param base64Image - Base64 encoded image data with data URL prefix
 * @returns Resized base64 image data with data URL prefix
 */
async function resizeImageIfNeeded(base64Image: string): Promise<string> {
    const MAX_WIDTH = 1536;

    // Extract image format and base64 data
    const matches = base64Image.match(
        /^data:image\/([a-zA-Z0-9]+);base64,(.+)$/
    );
    if (!matches) {
        console.warn('Invalid base64 image format');
        return base64Image;
    }

    const imageFormat = matches[1];
    const base64Data = matches[2];

    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Get image dimensions
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width || 0;

    // If image width is already <= MAX_WIDTH, return original
    if (width <= MAX_WIDTH) {
        return base64Image;
    }

    // Resize the image preserving aspect ratio
    const resizedBuffer = await sharp(buffer)
        .resize({ width: MAX_WIDTH })
        .toFormat(imageFormat as keyof sharp.FormatEnum)
        .toBuffer();

    // Convert back to base64
    const resizedBase64 = resizedBuffer.toString('base64');

    // Return with data URL prefix
    return `data:image/${imageFormat};base64,${resizedBase64}`;
}

/**
 * Generate an image based on a text prompt and save it to a file
 *
 * @param prompt - The text description of the image to generate
 * @param aspect - Optional aspect ratio of the image
 * @param background - Optional background type of the image
 * @param source_images - Optional array of URLs or base64 encoded strings containing images that should be edited or used as reference
 * @param output_path - Optional file path where the image should be saved. If not provided, the image will be saved to a default location.
 * @param number_of_images - Optional number of images to generate (default: 1)
 * @returns A promise that resolves to the path where the image was saved, or an array of paths if multiple images were generated
 */
export async function generate_image_raw(
    prompt: string,
    aspect?: 'square' | 'landscape' | 'portrait' | 'auto',
    background?: 'transparent' | 'opaque' | 'auto',
    source_images?: string | string[],
    output_path?: string,
    number_of_images: number = 1,
    quality: 'low' | 'medium' | 'high' | 'auto' = 'medium',
    prefix: string = 'generate'
): Promise<string | string[]> {
    try {
        // Process source images if provided
        let processedImages: string[] | undefined;
        if (source_images && source_images.length > 0) {
            // Convert single image to array for consistent processing
            const imageArray = Array.isArray(source_images)
                ? source_images
                : [source_images];
            processedImages = await Promise.all(
                imageArray.map(async image => {
                    // If it's not a base64 image, convert it
                    if (
                        image.startsWith('http://') ||
                        image.startsWith('https://')
                    ) {
                        // It's a URL, fetch and convert to base64
                        try {
                            const response = await fetch(image);
                            const imageBuffer = Buffer.from(
                                await response.arrayBuffer()
                            );
                            const base64Image =
                                createBase64FromImage(imageBuffer);
                            return await resizeImageIfNeeded(base64Image);
                        } catch (error) {
                            console.error(
                                `Error processing URL image: ${error}`
                            );
                            return image; // Return original URL if processing fails
                        }
                    } else if (image.startsWith('/')) {
                        // It's a local file path, load and convert to base64
                        try {
                            const imageData = await loadImage(image);
                            const canvas = createCanvas(
                                imageData.width,
                                imageData.height
                            );
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(imageData, 0, 0);
                            const base64Image = canvas.toDataURL('image/png');
                            return await resizeImageIfNeeded(base64Image);
                        } catch (error) {
                            console.error(
                                `Error processing local image: ${error}`
                            );
                            return image; // Return original path if processing fails
                        }
                    } else if (image.startsWith('data:image/')) {
                        // It's already a base64 image, just resize if needed
                        return await resizeImageIfNeeded(image);
                    } else {
                        console.warn(
                            `Unrecognized image format: ${image.substring(0, 20)}...`
                        );
                        return image; // Return as-is if format not recognized
                    }
                })
            );
        }

        // Generate the images using OpenAI API with retry logic
        let imageDataUrls;
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
            try {
                // Break down the message to avoid ESLint string quote issues
                const retryPrefix =
                    retryCount > 0
                        ? `Retry ${retryCount}/${maxRetries - 1}: `
                        : '';
                console.log(
                    `[ImageAgent] ${retryPrefix}Generating ${number_of_images} image(s) (${quality})`
                );

                // Map aspect to size for ensemble
                let size: '1024x1024' | '1792x1024' | '1024x1792' = '1024x1024';
                if (aspect === 'landscape') {
                    size = '1792x1024';
                } else if (aspect === 'portrait') {
                    size = '1024x1792';
                }

                // Add background instructions to prompt if needed
                let fullPrompt = prompt;
                if (background === 'transparent') {
                    fullPrompt += ' with transparent or white background, clean minimal style suitable for cutting out';
                } else if (background === 'opaque') {
                    fullPrompt += ' with solid background, complete scene';
                }

                // Generate images using ensemble's image function
                imageDataUrls = await ensembleImage(
                    fullPrompt,
                    { model: 'gpt-image-1' },
                    {
                        n: number_of_images,
                        size,
                        quality: quality === 'high' ? 'hd' : 'standard',
                        response_format: 'b64_json',
                        source_images: processedImages
                    }
                );

                // If we reach here, generation was successful
                if (retryCount > 0) {
                    console.log(
                        `[ImageAgent] Successfully generated images after ${retryCount} retry/retries`
                    );
                }
                break;
            } catch (generationError) {
                retryCount++;

                if (retryCount >= maxRetries) {
                    console.error(
                        `[ImageAgent] Failed to generate images after ${maxRetries} attempts:`,
                        generationError
                    );
                    throw new Error(
                        `Failed to generate images after ${maxRetries} attempts: ${generationError instanceof Error ? generationError.message : String(generationError)}`
                    );
                }

                // Log the error and retry
                console.warn(
                    `[ImageAgent] Error during image generation (attempt ${retryCount}/${maxRetries}):`,
                    generationError
                );
                console.log('[ImageAgent] Retrying in 2 seconds...');

                // Wait for 2 seconds before retrying
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        // If we got here without imageDataUrls, something went wrong
        if (!imageDataUrls) {
            throw new Error(
                '[ImageAgent] Failed to generate images - no data URLs returned'
            );
        }

        // Get timestamp once for all images
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filePaths: string[] = [];

        // Process each image data URL
        for (let i = 0; i < imageDataUrls.length; i++) {
            const imageDataUrl = imageDataUrls[i];

            // Extract the base64 data (remove the data URL prefix)
            const base64Data = imageDataUrl.replace(
                /^data:image\/png;base64,/,
                ''
            );

            // Convert base64 to buffer
            const imageBuffer = Buffer.from(base64Data, 'base64');

            // Determine the target file path for this image
            let targetPath = output_path;
            if (!targetPath) {
                // Use the default location in the output directory
                const fileName =
                    number_of_images === 1
                        ? `${prefix}_image_${timestamp}.png`
                        : `${prefix}_image_${timestamp}_${i + 1}.png`;
                targetPath = path.join(
                    DEFAULT_OUTPUT_DIR,
                    'generate_image',
                    fileName
                );
            } else if (number_of_images > 1 && output_path) {
                // If output_path was provided, append index for multiple images
                const pathParts = output_path.split('.');
                if (pathParts.length > 1) {
                    // Insert index before file extension
                    pathParts[pathParts.length - 2] += `_${i + 1}`;
                    targetPath = pathParts.join('.');
                } else {
                    // No extension, just append index
                    targetPath += `_${i + 1}`;
                }
            }

            write_file(targetPath, imageBuffer.buffer);
            filePaths.push(targetPath);

            communicationManager.send({
                type: 'design',
                data: imageDataUrl,
                timestamp: new Date().toISOString(),
                prompt,
            });
        }

        // Return a single path or array of paths based on number_of_images
        return number_of_images === 1 ? filePaths[0] : filePaths;
    } catch (error) {
        console.error('[ImageAgent] Error generating image:', error);
        throw error;
    }
}

/**
 * Wrapper for generate_image that ensures a string return type for tool compatibility
 */
async function generate_image(
    prompt: string,
    aspect?: 'square' | 'landscape' | 'portrait' | 'auto',
    background?: 'transparent' | 'opaque' | 'auto',
    source_images?: string | string[],
    output_path?: string,
    number_of_images?: number
): Promise<string> {
    const result = await generate_image_raw(
        prompt,
        aspect,
        background,
        source_images,
        output_path,
        number_of_images
    );

    // If we got an array of paths, join them with commas for the tool output
    if (Array.isArray(result)) {
        return result.join(', ');
    }

    return result;
}

/**
 * High level design search with iterative vision-based ranking to generate an enhanced image
 * This now uses the agent-based approach with MECH
 */
export async function design_image(
    type: DESIGN_ASSET_TYPES,
    prompt: string,
    with_inspiration: boolean = true,
    brand_assets: string[] = []
): Promise<string> {
    // Temporarily use the simple approach to avoid the mech/ensemble compatibility issue
    const { simpleDesignImage } = await import('./simple-design.js');
    
    return await simpleDesignImage(type, prompt, with_inspiration, brand_assets);
}

export function getImageGenerationTools(): ExtendedToolFunction[] {
    return [
        createExtendedToolFunction(
            generate_image, // Use the wrapper function that always returns a string
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
                source_images: {
                    description:
                        'A URL or base64 encoded string or array of images that should be edited or used as references',
                    optional: true,
                },
                output_path: {
                    description:
                        'Destination file path for the generated PNG. If omitted, the file is saved to the default output directory with a timestamp.',
                    optional: true,
                },
                number_of_images: {
                    description:
                        'Number of images to generate (default: 1). Returns a comma-separated list of file paths if > 1.',
                    type: 'number',
                    default: 1,
                    optional: true,
                },
            }
        ),
    ];
}

export function getDesignImageTools(): ExtendedToolFunction[] {
    return [
        createExtendedToolFunction(
            design_image,
            'An intelligent process that searches the web for reference images, then runs multiple passes to generate aesthetically pleasing designs. Can be used to design logos, websites, and other visual content.',
            {
                type: {
                    description: 'What type of design to create',
                    type: 'string',
                    enum: ['color_pallet', 'primary_logo', 'homepage_mockup'],
                    default: 'primary_logo',
                },
                prompt: 'A text description of the desired design',
                with_inspiration: {
                    description:
                        'The design process will look at reference images from the web to help inspire the design. This will take longer, but the results are usually significantly better.',
                    type: 'boolean',
                    default: 'true',
                },
                brand_assets: {
                    description:
                        'Optional array of existing brand asset file paths to maintain style consistency',
                    type: 'array',
                    optional: true,
                },
            }
        ),
    ];
}