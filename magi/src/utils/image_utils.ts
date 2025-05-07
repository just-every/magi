/**
 * Image utility functions for the MAGI system.
 *
 * This module provides tools for processing and optimizing images.
 */

// fs module is only used for type definition
import { Buffer } from 'buffer';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';

// Constants for image processing
export const MAX_IMAGE_HEIGHT = 2000;
export const DEFAULT_QUALITY = 80;
export const OPENAI_MAX_WIDTH = 1024;
export const OPENAI_MAX_HEIGHT = 768;
export const CLAUDE_MAX_WIDTH = 1024;
export const CLAUDE_MAX_HEIGHT = 1120;
export const GEMINI_MAX_WIDTH = 1024;
export const GEMINI_MAX_HEIGHT = 1536;

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
        return `[image #${id}]`;
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
 * Options for grid overlay
 */
export interface GridOptions {
    spacing?: number; // spacing between grid lines in CSS pixels
    majorSpacing?: number; // spacing between major grid lines in CSS pixels (null for no major lines)
    color?: string; // line color (RGBA)
    labelColor?: string; // label color (RGBA)
    lineWidth?: number; // width of minor grid lines
    majorLineWidth?: number; // width of major grid lines
    labelAxes?: boolean; // draw axis labels at edges
    dashWidth?: number; // width of minor grid dashes
    majorDashWidth?: number; // width of major grid dashes
}

export async function addGrid(
    base64ImageData: string,
    dpr: number = 1,
    options: GridOptions = {}
): Promise<string> {
    const {
        spacing = 100,
        majorSpacing = 200,
        color = 'rgba(128,128,128,0.3)',
        labelColor = 'rgba(128,128,128,1)',
        lineWidth = 1,
        majorLineWidth = 1,
        labelAxes = true,
        dashWidth = 5,
        majorDashWidth = 0,
    } = options;

    // 1) strip data-url & re-build for loadImage
    const m = base64ImageData.match(/^data:image\/([^;]+);base64,(.+)$/);
    if (!m) throw new Error('Invalid data-URL');
    const [, format, base64] = m;
    const dataUrl = `data:image/${format};base64,${base64}`;

    // 2) load and get true pixel size
    const img = await loadImage(dataUrl);
    const widthPx = img.width;
    const heightPx = img.height;

    // 3) make canvas at *pixel* size
    const canvas = createCanvas(widthPx, heightPx);
    const ctx = canvas.getContext('2d');

    // 4) draw the image
    ctx.drawImage(img, 0, 0);

    // 5) prepare for grid
    ctx.strokeStyle = color;

    // compute pixel-spacing
    const pxStep = spacing * dpr;
    const pxMajorStep = majorSpacing !== null ? majorSpacing * dpr : null;

    // 6) vertical lines
    for (let x = 0; x <= widthPx; x += pxStep) {
        const isMajor =
            pxMajorStep !== null && Math.abs(x % pxMajorStep) < 0.001;
        ctx.lineWidth = (isMajor ? majorLineWidth : lineWidth) * dpr;
        const xi = Math.round(x) + 0.5;
        const thisDashWidth = isMajor ? majorDashWidth : dashWidth;
        ctx.setLineDash(
            thisDashWidth ? [thisDashWidth * dpr, thisDashWidth * dpr * 2] : []
        );
        ctx.beginPath();
        ctx.moveTo(xi, 0);
        ctx.lineTo(xi, heightPx);
        if (x > 0) {
            ctx.stroke();
        }
    }

    // 7) horizontal lines
    for (let y = 0; y <= heightPx; y += pxStep) {
        const isMajor =
            pxMajorStep !== null && Math.abs(y % pxMajorStep) < 0.001;
        ctx.lineWidth = (isMajor ? majorLineWidth : lineWidth) * dpr;
        const thisDashWidth = isMajor ? majorDashWidth : dashWidth;
        ctx.setLineDash(
            thisDashWidth ? [thisDashWidth * dpr, thisDashWidth * dpr * 2] : []
        );
        const yi = Math.round(y) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, yi);
        ctx.lineTo(widthPx, yi);
        if (y > 0) {
            ctx.stroke();
        }
    }

    // 8) optional labels
    if (labelAxes) {
        ctx.setLineDash([]);
        ctx.fillStyle = labelColor;
        ctx.textBaseline = 'top';

        // X labels
        for (let x = 0; x <= widthPx; x += pxStep) {
            const xi = Math.round(x);
            const isMajor =
                pxMajorStep !== null && Math.abs(x % pxMajorStep) < 0.001;
            ctx.font = `${isMajor ? 'bold ' : ''}${11 * dpr}px sans-serif`;
            ctx.fillText(`${(x / dpr) | 0}`, xi + 2 * dpr, 2 * dpr);
        }

        // Y labels
        ctx.textAlign = 'right';
        for (let y = pxStep; y <= heightPx; y += pxStep) {
            const yi = Math.round(y);
            const isMajor =
                pxMajorStep !== null && Math.abs(y % pxMajorStep) < 0.001;
            ctx.font = `${isMajor ? 'bold ' : ''}${11 * dpr}px sans-serif`;
            ctx.fillText(`${(y / dpr) | 0}`, widthPx - 2 * dpr, yi + 2 * dpr);
        }
    }

    // 9) export
    const outBuf = canvas.toBuffer('image/png');
    return `data:image/png;base64,${outBuf.toString('base64')}`;
}

/**
 * Add crosshairs to the center of key elements in the screenshot.
 * Enhances the visual identification of interaction targets with their coordinates.
 *
 * Note: The coordinates in the elements array are expected to be in CSS pixels
 * and already adjusted for scroll position by buildElementArray (viewport-relative).
 *
 * @param base64ImageData - Base64 encoded image data (with data URL prefix)
 * @param elements - Array of elements with viewport-relative coordinates (output from buildElementArray)
 * @param dpr - Device pixel ratio
 * @param count - Number of top elements to mark with crosshairs (default: 10)
 * @returns Base64 encoded data URL string with crosshairs added
 */
export async function addCrosshairs(
    base64ImageData: string,
    elements: Array<{
        x: number;
        y: number;
        w: number;
        h: number;
        cx?: number;
        cy?: number;
    }>,
    dpr: number = 1,
    count: number = 10
): Promise<string> {
    // Define a set of distinct, high-contrast darker colors for the crosshairs
    // Avoiding bright yellow and other hard-to-see colors
    const COLORS = [
        '#D32F2F', // dark red
        '#388E3C', // dark green
        '#1976D2', // dark blue
        '#7B1FA2', // dark purple
        '#C2185B', // dark pink
        '#0097A7', // dark cyan
        '#E64A19', // dark orange
        '#5D4037', // dark brown
        '#455A64', // dark blue-grey
        '#616161', // dark grey
    ];

    // 1) Parse the data URL
    const m = base64ImageData.match(/^data:image\/([^;]+);base64,(.+)$/);
    if (!m) throw new Error('Invalid data-URL');
    const [, format, base64] = m;
    const dataUrl = `data:image/${format};base64,${base64}`;

    // 2) Load the image and get its dimensions
    const img = await loadImage(dataUrl);
    const widthPx = img.width;
    const heightPx = img.height;

    // 3) Create a canvas at the same size
    const canvas = createCanvas(widthPx, heightPx);
    const ctx = canvas.getContext('2d');

    // 4) Draw the original image
    ctx.drawImage(img, 0, 0);

    // 5) Draw crosshairs for top elements
    const actualCount = Math.min(count, elements.length);

    for (let i = 0; i < actualCount; i++) {
        const el = elements[i];

        // Skip elements that may be offscreen (negative coordinates)
        if (
            el.x + el.w < 0 ||
            el.y + el.h < 0 ||
            el.x > widthPx / dpr ||
            el.y > heightPx / dpr
        ) {
            continue;
        }

        // Get the center point - use cx/cy if available, otherwise calculate
        // These coordinates are already adjusted for scroll by buildElementArray
        const centerX =
            el.cx !== undefined ? el.cx : Math.round(el.x + el.w / 2);
        const centerY =
            el.cy !== undefined ? el.cy : Math.round(el.y + el.h / 2);

        // Convert CSS coordinates to physical pixels (directly use these for crosshairs)
        const centerXPx = centerX * dpr;
        const centerYPx = centerY * dpr;
        const crosshairExtension = 5 * dpr; // How far crosshairs extend beyond element (reduced from 10)

        // Get element boundaries in physical pixels (already scroll-adjusted)
        const leftPx = el.x * dpr;
        const rightPx = (el.x + el.w) * dpr;
        const topPx = el.y * dpr;
        const bottomPx = (el.y + el.h) * dpr;

        // Skip if any part would be drawn outside the image
        if (
            centerXPx < 0 ||
            centerXPx > widthPx ||
            centerYPx < 0 ||
            centerYPx > heightPx
        ) {
            continue;
        }

        // Set style for this element
        const color = COLORS[i % COLORS.length];
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = Math.max(1, Math.floor(dpr)); // At least 1px, but scale with DPR
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.font = `bold ${Math.max(10, Math.round(10 * dpr))}px monospace`;

        // Calculate adaptive crosshair extension based on element size
        const minDimension = Math.min(el.w, el.h);
        // Limit extension to 1/3 of the smallest dimension, but at least 3px and no more than original 5px * dpr
        const adaptiveCrosshairExtension = Math.min(
            Math.max(3, Math.floor(minDimension / 3)),
            crosshairExtension
        );

        // Draw crosshair
        ctx.beginPath();
        // Vertical line
        ctx.moveTo(centerXPx, topPx - adaptiveCrosshairExtension);
        ctx.lineTo(centerXPx, bottomPx + adaptiveCrosshairExtension);
        // Horizontal line
        ctx.moveTo(leftPx - adaptiveCrosshairExtension, centerYPx);
        ctx.lineTo(rightPx + adaptiveCrosshairExtension, centerYPx);
        ctx.stroke();

        // Add coordinate labels with improved boundary checking

        // For X coordinate (top label)
        const xLabelY = topPx - adaptiveCrosshairExtension - 5;
        // Check if the label would go off the top of the image
        if (xLabelY < 15) {
            // Allow room for the text
            // Place below the element instead
            ctx.textBaseline = 'top';
            ctx.fillText(
                `${centerX}`, // X coordinate
                centerXPx,
                bottomPx + adaptiveCrosshairExtension + 5 // Position below the bottom of vertical line
            );
        } else {
            ctx.fillText(
                `${centerX}`, // X coordinate
                centerXPx,
                xLabelY // Position above the top of vertical line
            );
        }

        // For Y coordinate (right label)
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const yLabelX = rightPx + adaptiveCrosshairExtension + 5;
        // Check if the label would go off the right of the image
        if (yLabelX + 40 > widthPx) {
            // Allow room for the text (40px is approximate max width)
            // Place to the left of the element instead
            ctx.textAlign = 'right';
            ctx.fillText(
                `${centerY}`, // Y coordinate
                leftPx - adaptiveCrosshairExtension - 5, // Position to left of horizontal line
                centerYPx
            );
        } else {
            ctx.fillText(
                `${centerY}`, // Y coordinate
                yLabelX, // Position to right of horizontal line
                centerYPx
            );
        }
    }

    // 6) Export as PNG
    const outBuf = canvas.toBuffer('image/png');
    return `data:image/png;base64,${outBuf.toString('base64')}`;
}

/**
 * Resizes and splits an image to meet OpenAI's size requirements:
 * - Maximum width of 1024px
 * - Maximum height of 768px per segment
 *
 * @param imageData - Base64 encoded image data (with data URL prefix)
 * @returns Array of base64 image strings, split into sections if needed
 */
export async function resizeAndSplitForOpenAI(
    imageData: string
): Promise<string[]> {
    const MAX_WIDTH = 1024;
    const MAX_HEIGHT = 768;

    // Strip the data-URL prefix and grab format
    const base64Image = imageData.replace(/^data:image\/\w+;base64,/, '');
    const imageFormat = imageData.match(/data:image\/(\w+);/)?.[1] || 'png';

    // Convert to a Buffer
    const imageBuffer = Buffer.from(base64Image, 'base64');

    // Quick-exit if already small enough
    const { width: origW = 0, height: origH = 0 } =
        await sharp(imageBuffer).metadata();
    if (origW <= MAX_WIDTH && origH <= MAX_HEIGHT) {
        return [imageData];
    }

    // 1) Resize *with* flatten so no transparency becomes grey
    const newWidth = Math.min(origW, MAX_WIDTH);
    const resizedBuffer = await sharp(imageBuffer)
        .resize({ width: newWidth })
        .flatten({ background: '#fff' }) // white background
        .toFormat(imageFormat as keyof sharp.FormatEnum)
        .toBuffer();

    // 2) Read the real resized height
    const { height: resizedH = 0 } = await sharp(resizedBuffer).metadata();

    const result: string[] = [];

    // 3) If still too tall, slice it
    if (resizedH > MAX_HEIGHT) {
        const segments = Math.ceil(resizedH / MAX_HEIGHT);
        for (let i = 0; i < segments; i++) {
            const top = i * MAX_HEIGHT;
            const height = Math.min(MAX_HEIGHT, resizedH - top);
            if (height <= 0) continue;

            const segmentBuf = await sharp(resizedBuffer)
                .extract({ left: 0, top, width: newWidth, height })
                .toFormat(imageFormat as keyof sharp.FormatEnum)
                .toBuffer();

            const segmentDataUrl = `data:image/${imageFormat};base64,${segmentBuf.toString('base64')}`;
            result.push(segmentDataUrl);
        }
    } else {
        // single slice fits
        const singleUrl = `data:image/${imageFormat};base64,${resizedBuffer.toString('base64')}`;
        result.push(singleUrl);
    }

    return result;
}

// Utility to strip and re-prefix data-URLs
function stripDataUrl(dataUrl: string) {
    const match = dataUrl.match(/^data:image\/([^;]+);base64,(.+)$/);
    if (!match) throw new Error('Invalid data-URL');
    return { format: match[1], base64: match[2] };
}

async function processAndTruncate(
    imageBuffer: Buffer,
    format: string,
    maxW: number,
    maxH: number
): Promise<Buffer> {
    // 1) Auto-orient, resize to max width, flatten transparency
    const resized = await sharp(imageBuffer)
        .rotate()
        .resize({ width: maxW, withoutEnlargement: true })
        .flatten({ background: '#fff' })
        .toFormat(format as keyof sharp.FormatEnum)
        .toBuffer();

    // 2) Pull actual size
    const { width, height } = await sharp(resized).metadata();

    // 3) If too tall, crop bottom off
    if (height! > maxH) {
        return await sharp(resized)
            .extract({ left: 0, top: 0, width: width!, height: maxH })
            .toFormat(format as keyof sharp.FormatEnum)
            .toBuffer();
    }

    return resized;
}

/**
 * Claude: resize to ≤1024px wide, then truncate at 1120px tall.
 */
export async function resizeAndTruncateForClaude(
    imageData: string
): Promise<string> {
    const { format, base64 } = stripDataUrl(imageData);
    const buf = Buffer.from(base64, 'base64');

    // early-exit if already fits
    const meta = await sharp(buf).metadata();
    if (meta.width! <= CLAUDE_MAX_WIDTH && meta.height! <= CLAUDE_MAX_HEIGHT) {
        return imageData;
    }

    const outBuf = await processAndTruncate(
        buf,
        format,
        CLAUDE_MAX_WIDTH,
        CLAUDE_MAX_HEIGHT
    );
    return `data:image/${format};base64,${outBuf.toString('base64')}`;
}

/**
 * Gemini: resize to ≤1024px wide, then truncate at 1536px tall.
 */
export async function resizeAndTruncateForGemini(
    imageData: string
): Promise<string> {
    const { format, base64 } = stripDataUrl(imageData);
    const buf = Buffer.from(base64, 'base64');

    // early-exit if already fits
    const meta = await sharp(buf).metadata();
    if (meta.width! <= GEMINI_MAX_WIDTH && meta.height! <= GEMINI_MAX_HEIGHT) {
        return imageData;
    }

    const outBuf = await processAndTruncate(
        buf,
        format,
        GEMINI_MAX_WIDTH,
        GEMINI_MAX_HEIGHT
    );
    return `data:image/${format};base64,${outBuf.toString('base64')}`;
}
