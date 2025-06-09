/**
 * Utility functions for image processing
 */

/**
 * Create a base64 data URL from an image buffer
 * 
 * @param buffer - Image buffer
 * @param mimeType - MIME type (optional, defaults to 'image/png')
 * @returns Base64 data URL
 */
export function createBase64FromImage(
    buffer: Buffer, 
    mimeType: string = 'image/png'
): string {
    const base64 = buffer.toString('base64');
    return `data:${mimeType};base64,${base64}`;
}