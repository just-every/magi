/**
 * Image utility functions for the MAGI system.
 *
 * This module provides tools for processing and optimizing images.
 */

// fs module is only used for type definition
import {Buffer} from 'buffer';
import sharp from 'sharp';

/**
 * Maximum height for images to prevent excessively large files
 */
const MAX_IMAGE_HEIGHT = 1200;

/**
 * Default image quality for JPEG compression
 */
const DEFAULT_QUALITY = 70;

/**
 * Create an image buffer from base64 data
 *
 * @param base64Data - Base64 encoded image data
 * @returns Buffer containing the image data
 */
export async function createImageFromBase64(base64Data: string): Promise<Buffer> {
	// Remove data URL prefix if present
	const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');

	// Convert base64 to buffer
	return Buffer.from(base64Image, 'base64');
}

/**
 * Process an image to optimize it for use
 *
 * @param imageBuffer - Buffer containing the image data
 * @param maxHeight - Maximum height of the image (default: 1200px)
 * @param quality - JPEG quality (default: 70)
 * @returns Buffer containing the processed image
 */
export async function processImage(
	imageBuffer: Buffer,
	maxHeight: number = MAX_IMAGE_HEIGHT,
	quality: number = DEFAULT_QUALITY
): Promise<Buffer> {

	try {
		// Create a sharp instance
		const image = sharp(imageBuffer);

		// Get image metadata
		const metadata = await image.metadata();

		// Skip processing if we can't get metadata
		if (!metadata.width || !metadata.height) {
			console.log('Unable to get image metadata, returning original image buffer');
			return imageBuffer;
		}

		// Check if image needs resizing
		if (metadata.height > maxHeight) {
			// Calculate new width to maintain aspect ratio
			const aspectRatio = metadata.width / metadata.height;
			const newWidth = Math.round(maxHeight * aspectRatio);

			console.log(`Resizing image from ${metadata.width}x${metadata.height} to ${newWidth}x${maxHeight}`);

			// Resize the image
			image.resize(newWidth, maxHeight);
		}

		// Convert to JPEG with specified quality
		return await image.jpeg({quality}).toBuffer();
	} catch (error) {
		console.error('Error processing image:', error);
		// Return original buffer if processing fails
		return imageBuffer;
	}
}
