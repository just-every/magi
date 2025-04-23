/**
 * Image utility functions for the MAGI system.
 *
 * This module provides tools for processing and optimizing images.
 */

// fs module is only used for type definition
import { Buffer } from 'buffer';
import sharp from 'sharp';
import { findModel } from '../model_providers/model_data.js';
import { claudeProvider } from '../model_providers/claude.js';
import { randomUUID } from 'node:crypto';

// Cache for image descriptions
interface ImageDescriptionCache {
    [imageHash: string]: string;
}

// In-memory cache for image descriptions
const imageDescriptionCache: ImageDescriptionCache = {};

/**
 * Maximum height for images to prevent excessively large files
 */
const MAX_IMAGE_HEIGHT = 2000;

/**
 * Default image quality for JPEG compression
 */
const DEFAULT_QUALITY = 80;

/**
 * Result type for extractBase64Image function
 */
export interface ExtractBase64ImageResult {
    found: boolean; // Whether at least one image was found
    originalContent: string; // Original content unchanged
    replaceContent: string; // Content with images replaced by placeholders
    image_id: string | null; // ID of the first image found (for backwards compatibility)
    images: Record<string, string>; // Map of image IDs to their base64 data
}

/**
 * Extract base64 images from a string, preserving non-image content
 * Replaces images with placeholder text [image <id>] and returns mapping
 *
 * @param content - String that may contain base64 encoded images
 * @returns Object with extraction results including image mapping
 */
export function extractBase64Image(content: string): ExtractBase64ImageResult {
    // Default result
    const result: ExtractBase64ImageResult = {
        found: false,
        originalContent: content,
        replaceContent: content,
        image_id: null,
        images: {},
    };

    if (typeof content !== 'string') return result;

    // Quick check if there's any image data
    if (!content.includes('data:image/')) return result;

    // Find all image data using regex
    // This pattern matches data URIs for images, allowing whitespace in base64 data
    const imgRegex = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/g;

    // Replace all instances and build a map of image_id -> image_data
    const images: Record<string, string> = {};

    // Replace all images with placeholders and collect them in the images map
    const replaceContent = content.replace(imgRegex, match => {
        const id = randomUUID();
        // Remove any whitespace from the base64 data for clean storage
        images[id] = match.replace(/\s+/g, '');
        return `[image ${id}]`;
    });

    // If no images were found, return original content
    if (Object.keys(images).length === 0) {
        return result;
    }

    // Get the first image ID for backward compatibility
    const firstImageId = Object.keys(images)[0];

    return {
        found: true,
        originalContent: content,
        replaceContent: replaceContent,
        image_id: firstImageId,
        images: images,
    };
}

/**
 * Create an image buffer from base64 data
 *
 * @param base64Data - Base64 encoded image data
 * @returns Buffer containing the image data
 */
export async function createImageFromBase64(
    base64Data: string
): Promise<Buffer> {
    // Remove data URL prefix if present
    const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');

    // Convert base64 to buffer
    return Buffer.from(base64Image, 'base64');
}

/**
 * Convert an image buffer to base64 data URL format
 *
 * @param imageBuffer - Buffer containing the image data
 * @returns Base64 encoded data URL string in the format 'data:image/png;base64,...'
 */
export function createBase64FromImage(imageBuffer: Buffer): string {
    // Convert buffer to base64
    const base64Image = imageBuffer.toString('base64');

    // Return with data URL prefix
    return `data:image/png;base64,${base64Image}`;
}

/**
 * Process an image to optimize it for use
 *
 * @param imageBuffer - Buffer containing the image data
 * @param shortSide - Target size for the short side of the image (default: 768px)
 * @param longSideMax - Maximum size for the long side of the image (default: 2000px)
 * @param quality - JPEG quality (default: 80)
 * @returns Buffer containing the processed image
 */

/**
 * Generate a hash for an image to use as a cache key
 *
 * @param imageData - Base64 encoded image data
 * @returns A string hash that can be used as a cache key
 */
function generateImageHash(imageData: string): string {
    // Simple hash function for cache key - using first 100 chars + length should be sufficient
    // for our needs while being much faster than a full hash
    const sample = imageData.substring(0, 100);
    const length = imageData.length;
    return `${sample}_${length}`;
}

/**
 * Converts an image to a text description if the model doesn't support image input
 * Uses a mini vision model and caches the results
 *
 * @param imageData - Base64 encoded image data
 * @param modelId - ID of the model being used
 * @returns The image description or original image data if model supports images
 */
export async function convertImageToTextIfNeeded(
    imageData: string,
    modelId: string
): Promise<string> {
    // Skip if not an image
    if (!imageData.startsWith('data:image/')) {
        return imageData;
    }

    // Check if model supports image input
    const model = findModel(modelId);
    if (model?.features?.input_modality?.includes('image')) {
        // Model supports images, return original
        return imageData;
    }

    console.log(
        `Model ${modelId} doesn't support images, converting to text description`
    );

    // Generate hash for caching
    const imageHash = generateImageHash(imageData);

    // Check cache
    if (imageDescriptionCache[imageHash]) {
        console.log(`Using cached image description for ${modelId}`);
        return imageDescriptionCache[imageHash];
    }

    // Use Claude to describe the image
    try {
        // Use a simplified approach to directly ask Claude to describe the image
        const prompt =
            'Please describe this image in a few sentences. Focus on the main visual elements and key details that someone would need to understand what is shown in the image.';

        // Create a simple set of messages compatible with our Claude provider
        const messages = [
            {
                role: 'user',
                content: prompt + '\n\n' + imageData,
            },
        ];

        // Use claude-3-5-haiku-latest as our image-to-text model
        const stream = claudeProvider.createResponseStream(
            'claude-3-5-haiku-latest',
            messages as any
        );

        let description = '';
        for await (const chunk of stream) {
            if (chunk.type === 'message_delta' && chunk.content) {
                description += chunk.content;
            }
        }

        // Format the result
        const formattedDescription = `[Image description: ${description.trim()}]`;

        // Cache the result
        imageDescriptionCache[imageHash] = formattedDescription;

        console.log('Generated new image description and cached it');
        return formattedDescription;
    } catch (error) {
        console.error('Error generating image description:', error);
        return '[Image could not be processed]';
    }
}
export async function processImage(
    imageBuffer: Buffer,
    shortSide: number = 768,
    longSideMax: number = MAX_IMAGE_HEIGHT,
    quality: number = DEFAULT_QUALITY
): Promise<Buffer> {
    try {
        // Create a sharp instance
        const image = sharp(imageBuffer);

        // Get image metadata
        const metadata = await image.metadata();

        // Skip processing if we can't get metadata
        if (!metadata.width || !metadata.height) {
            console.log(
                'Unable to get image metadata, returning original image buffer'
            );
            return imageBuffer;
        }

        // Determine if image is portrait or landscape
        const isPortrait = metadata.height > metadata.width;
        const aspectRatio = metadata.width / metadata.height;

        // Calculate new dimensions based on orientation
        let newWidth: number;
        let newHeight: number;

        if (isPortrait) {
            // For portrait: width is the short side
            newWidth = shortSide;
            newHeight = Math.round(shortSide / aspectRatio);

            // Ensure height doesn't exceed max
            if (newHeight > longSideMax) {
                newHeight = longSideMax;
                newWidth = Math.round(longSideMax * aspectRatio);
            }
        } else {
            // For landscape: height is the short side
            newHeight = shortSide;
            newWidth = Math.round(shortSide * aspectRatio);

            // Ensure width doesn't exceed max
            if (newWidth > longSideMax) {
                newWidth = longSideMax;
                newHeight = Math.round(longSideMax / aspectRatio);
            }
        }

        console.log(
            `Resizing image from ${metadata.width}x${metadata.height} to ${newWidth}x${newHeight}`
        );

        // Resize the image
        image.resize(newWidth, newHeight);

        // Convert to JPEG with specified quality
        return await image.jpeg({ quality }).toBuffer();
    } catch (error) {
        console.error('Error processing image:', error);
        // Return original buffer if processing fails
        return imageBuffer;
    }
}
