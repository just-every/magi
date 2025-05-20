import { openaiProvider } from '../model_providers/openai.js';
import { createToolFunction } from './tool_call.js';
import { ToolFunction, ResponseInput } from '../types/shared-types.js';
import path from 'path';
import { write_file } from './file_utils.js';
import {
    smart_design_raw,
    createNumberedGrid,
    selectBestFromGrid,
} from './design_search.js';
import {
    DESIGN_ASSET_TYPES,
    DESIGN_ASSET_REFERENCE,
    DESIGN_ASSET_GUIDE,
    DesignAssetReferenceItem,
    DesignAssetGuideItem,
    DESIGN_SEARCH_ENGINES,
    DESIGN_SEARCH_DESCRIPTIONS,
    type DesignSpec,
} from './design/constants.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createBase64FromImage } from './image_utils.js';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { quick_llm_call } from './llm_call_utils.js';

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
async function generate_image_raw(
    prompt: string,
    aspect?: 'square' | 'landscape' | 'portrait' | 'auto',
    background?: 'transparent' | 'opaque' | 'auto',
    source_images?: string | string[],
    output_path?: string,
    number_of_images: number = 1,
    quality: 'low' | 'medium' | 'high' | 'auto' = 'medium'
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

        // Generate the images using OpenAI API
        const imageDataUrls = await openaiProvider.generateImage(
            prompt,
            'gpt-image-1',
            background || 'auto',
            quality,
            aspect === 'landscape'
                ? '1536x1024'
                : aspect === 'portrait'
                  ? '1024x1536'
                  : aspect === 'auto'
                    ? 'auto'
                    : '1024x1024',
            processedImages,
            number_of_images
        );

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
                        ? `image_${timestamp}.png`
                        : `image_${timestamp}_${i + 1}.png`;
                targetPath = path.join(
                    '/magi_output/shared/generate_image',
                    fileName
                );
            } else if (number_of_images > 1) {
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
 * Get all file tools as an array of tool definitions
 */
export function getImageGenerationTools(): ToolFunction[] {
    return [
        createToolFunction(
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
                        'Destination file path for the generated PNG. If omitted, the file is saved to /magi_output/shared/generate_image/ with a timestamp.',
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

/**
 * Get design specifications from the LLM based on the user prompt
 *
 * @param userPrompt - The original design prompt from the user
 * @returns A promise that resolves to design specifications
 */
async function get_design_spec(
    type: DESIGN_ASSET_TYPES,
    userPrompt: string,
    reference: DesignAssetReferenceItem,
    guide: DesignAssetGuideItem
): Promise<DesignSpec> {
    console.log(
        `[design_image] Getting design specification for: "${userPrompt}"`
    );

    const readableType = type.replace(/_/g, ' ');
    const readableName = reference.name.toLowerCase();

    const input: ResponseInput = [
        {
            type: 'message',
            role: 'system',
            content: `### RESEARCH

We have performed research on the best practices for designing a ${readableType}

SPECIFICATIONS:
- aspect ratio: ${reference.spec.aspect}
- background: ${reference.spec.background}

GENERAL GUIDELINES:
- ${guide.guide.join('\n- ')}

IDEAL CHARACTERISTICS:
- ${guide.ideal.join('\n- ')}

WARNINGS:
- ${guide.warnings.join('\n- ')}

INSPIRATION:
- ${guide.inspiration.join('\n- ')}

JUDGING CRITERIA:
- ${guide.criteria.join('\n- ')}`,
        },
        {
            type: 'message',
            role: 'user',
            content: 'DESIGN REQUEST: ' + userPrompt,
        },
    ];

    try {
        const raw = await quick_llm_call(input, 'reasoning', {
            name: 'DesignSpecAgent',
            description: 'Generate design spec parameters',
            instructions: `You are a design assistant that maps design request to optimal parameters. You are helping to design a **${readableName}** (${reference.description}). It will be used as part of a specialized design process for "${reference.usage_context}".

The design process involves;
1. Searching a number of design engines for inspiration/reference images related to the design request.
2. Narrowing down a large number of inspiration/reference images to a small set of the most relevant ones.
3. Using the selected images, along with a design_prompt, to generate many draft designs.
4. Selecting the best designs from the drafts and generating a final high-quality version.

### YOUR TASK:
1. Analyze the design request provided and understand the **INTENT** of the design request.
2. Work step by step through the JSON fields required and fill them in with the best possible values.
3. Use both your understanding of the intent of the design request and the research provided.
            `,
            modelSettings: {
                force_json: true,
                json_schema: {
                    name: 'design_specification',
                    type: 'json_schema',
                    schema: {
                        type: 'object',
                        properties: {
                            aspect: {
                                description: 'Aspect ratio of the design',
                                type: 'string',
                                enum: ['square', 'landscape', 'portrait'],
                            },
                            background: {
                                description:
                                    'Should the background be transparent or opaque?',
                                type: 'string',
                                enum: ['transparent', 'opaque'],
                            },
                            inspiration_search: {
                                type: 'array',
                                description:
                                    'Find inspiration images for the design. Create searches tailored to design request and design engine. Each query should be brief (think typed in the search bar on the site). Provide multiple queries for the same engine if very relevant, or leave out an engine if not. But try to balance to get a good variety of results. Aim for around 6-10 searches in total.',
                                items: {
                                    type: 'object',
                                    properties: {
                                        engine: {
                                            type: 'string',
                                            enum: DESIGN_SEARCH_ENGINES,
                                            description: `Design search engine to use:\n${DESIGN_SEARCH_DESCRIPTIONS.join('\n')}`,
                                        },
                                        query: {
                                            type: 'string',
                                            description:
                                                'Search query for this specific engine',
                                        },
                                    },
                                    additionalProperties: false,
                                    required: ['engine', 'query'],
                                },
                            },
                            judge_inspiration: {
                                description: 'What should we look for when narrowing down the inspiration images? Use the research provided and the design request to construct a guide for comparing multiple inspiration images as to which is the most relevant. This should be about a paragraph long.',
                                type: 'string',
                            },
                            design_prompt: {
                                description: 'This prompt is VITAL. Once we have collected a number of inspiration images, we will use this prompt to generate a new design based on them. It should be a detailed description of the design you want to create. Focus on providing guidance for the design process, not the final product. However include any specific details from in the original design request. This should be about a paragraph long.',
                                type: 'string',
                            },
                            judge_design: {
                                description: 'Finally how should we judge designed image drafts? We will create a number of design drafts before choosing the best one. The prompt should include what to look for, how to compare multiple designs and any warnings to avoid. This should be about a paragraph long.',
                                type: 'string',
                            },
                        },
                        additionalProperties: false,
                        required: [
                            'aspect',
                            'background',
                            'judge_inspiration',
                            'design_prompt',
                            'judge_design',
                        ],
                    },
                },
            },
        });

        return JSON.parse(raw);
    } catch (error) {
        console.error(`[design_image] Error getting design spec: ${error}`);

        throw error;
    }
}

/**
 * High level design search with iterative vision-based ranking to generate an enhanced image
 */
export async function design_image(
    type: DESIGN_ASSET_TYPES,
    prompt: string,
    with_inspiration: boolean = true
): Promise<string> {
    const sessionId = uuidv4().substring(0, 8);
    const allImagePaths: string[] = [];

    const reference = DESIGN_ASSET_REFERENCE[type];
    const guide = DESIGN_ASSET_GUIDE[type];

    // Step 0: Ask the LLM for design specification
    const spec = await get_design_spec(type, prompt, reference, guide);

    console.log(
        `[design_image] Design spec for "${prompt}":`,
        JSON.stringify(spec, null, 2)
    );

    // Set up parallel generation batches
    console.log(
        '[design_image] Starting parallel generation of multiple image batches'
    );
    const generationPromises = [];

    // Base prompt from the design spec
    const basePrompt = spec.design_prompt;

    // Batch 1: Generate 9 images without references
    console.log(
        '[design_image] Queueing batch 1/3: 9 images without reference images'
    );
    generationPromises.push(
        generate_image_raw(
            basePrompt,
            spec.aspect,
            spec.background,
            undefined, // No reference images
            undefined, // No output path
            9,
            'low' // Low quality for initial batch
        )
    );

    // Step 1: Find reference images if requested
    let referenceImages: string[] = [];
    if (with_inspiration) {
        console.log(
            '[design_image] Searching for reference designs with query:',
            spec.inspiration_search
        );
        const designs = await smart_design_raw(
            spec.inspiration_search,
            3, // @todo would like to increase this, but need to fix up the algorithm to reduce faster in earlier rounds, otherwise we get too many rounds
            type,
            spec.judge_inspiration
        );
        console.log(`[design_image] Found ${designs.length} reference designs`);

        // Extract image URLs to use as reference
        referenceImages = designs
            .filter(design => design.screenshotURL)
            .map(design => design.screenshotURL as string);

        // Step 2: Generate initial batch of 27 images with low quality
        console.log(
            '[design_image] Generating additional images with reference images'
        );

        // For batches with reference images, add the reference instruction to the prompt
        let refPrompt = basePrompt;
        if (referenceImages.length > 0) {
            refPrompt +=
                '\n\nPlease use the reference images provided as inspiration only. Do not copy them or use them directly in your design. You are creating a new design based on the style from these images.';
        }

        // If we have reference images, create two batches
        if (referenceImages.length > 0) {
            // Batch 2: First 3 reference images
            const firstThree = referenceImages.slice(
                0,
                Math.min(3, referenceImages.length)
            );

            console.log(
                '[design_image] Queueing batch 2/3: 9 images with first 3 reference images'
            );
            generationPromises.push(
                generate_image_raw(
                    refPrompt,
                    spec.aspect,
                    spec.background,
                    firstThree,
                    undefined,
                    9,
                    'low'
                )
            );

            // Batch 3: Use remaining reference images, or reuse first three if none remain
            const remainingOrReuse =
                referenceImages.length > 3
                    ? referenceImages.slice(3)
                    : firstThree;

            console.log(
                '[design_image] Queueing batch 3/3: 9 images with ' +
                    (referenceImages.length > 3
                        ? 'remaining'
                        : 'reused first 3') +
                    ' reference images'
            );
            generationPromises.push(
                generate_image_raw(
                    refPrompt,
                    spec.aspect,
                    spec.background,
                    remainingOrReuse,
                    undefined,
                    9,
                    'low'
                )
            );
        }
    } else {
        // If no reference images are requested, just generate the second batch with the base prompt
        generationPromises.push(
            generate_image_raw(
                basePrompt,
                spec.aspect,
                spec.background,
                undefined, // No reference images
                undefined, // No output path
                9,
                'low' // Low quality for initial batch
            )
        );
    }

    // Wait for all generation promises to complete in parallel
    console.log(
        `[design_image] Waiting for ${generationPromises.length} parallel batches to complete...`
    );
    const batchResults = await Promise.all(generationPromises);

    // Process all results and add to allImagePaths
    for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        if (Array.isArray(result)) {
            allImagePaths.push(...result);
            console.log(
                `[design_image] Batch ${i + 1}/${generationPromises.length} complete: ${result.length} images`
            );
        } else if (result) {
            // In case a single result is returned
            allImagePaths.push(result);
            console.log(
                `[design_image] Batch ${i + 1}/${generationPromises.length} complete: 1 image`
            );
        }
    }

    // Step 3: Use grid selection to narrow down candidates
    console.log(
        `[design_image] Generated ${allImagePaths.length} total variations, now selecting the best`
    );

    let candidates = allImagePaths;
    let bestImagePath: string | null = null;

    try {
        // Run iterative selection process until we have a single best image
        let round = 1;
        while (candidates.length > 1) {
            console.log(
                `[design_image] Selection round ${round}: Processing ${candidates.length} candidates`
            );

            // Split candidates into groups of 9 for processing
            const groups: string[][] = [];
            for (let i = 0; i < candidates.length; i += 9) {
                const group = candidates.slice(
                    i,
                    Math.min(i + 9, candidates.length)
                );
                if (group.length > 0) {
                    groups.push(group);
                }
            }

            console.log(
                `[design_image] Split into ${groups.length} groups of up to 9 images each`
            );

            // Process each group to get the best images
            const selectedCandidates: string[] = [];

            for (let i = 0; i < groups.length; i++) {
                const group = groups[i];

                // Create array of ImageSource objects for the grid
                const imageSources = group.map(path => ({
                    url: path,
                    title: prompt,
                }));

                // Generate a grid image of current group
                const grid = await createNumberedGrid(
                    imageSources,
                    `design_image_${sessionId}_round${round}_group${i+1}`
                );
                console.log(
                    `[design_image] Created grid of ${group.length} images for round ${round}, group ${i+1}`
                );

                // Determine how many images to select from this group
                // Select 3 when we have more than 9 images total, otherwise select only 1
                const numToSelect = candidates.length > 9 ? 3 : 1;

                // Select best images from this group
                const bestImageIndices = await selectBestFromGrid(
                    grid,
                    prompt,
                    group.length,
                    Math.min(numToSelect, group.length - 1), // Ensure we don't ask for more than available minus 1
                    false, // This is image generation, not design search
                    type,
                    spec.judge_design
                );

                console.log(
                    `[design_image] Round ${round}, Group ${i+1}: Selected ${bestImageIndices.length} best images: ${bestImageIndices.join(', ')}`
                );

                // If no images were selected from this group, take the first one
                if (bestImageIndices.length === 0) {
                    if (group.length > 0) {
                        selectedCandidates.push(group[0]);
                    }
                } else {
                    // Add selected images from this group to the overall selection
                    selectedCandidates.push(
                        ...bestImageIndices.map(idx => group[idx - 1])
                    );
                }
            }

            // If no images were selected at all, break
            if (selectedCandidates.length === 0) {
                if (candidates.length > 0) {
                    bestImagePath = candidates[0]; // Just take the first one if nothing was selected
                }
                break;
            }

            // Update candidates for next round
            candidates = selectedCandidates;
            round++;

            // If we're down to one image, we're done
            if (candidates.length === 1) {
                bestImagePath = candidates[0];
                break;
            }

            // Safety: if we've gone through too many rounds, just pick the first candidate
            if (round > 5) {
                console.log(
                    '[design_image] Reached maximum rounds (5), selecting the first remaining candidate'
                );
                bestImagePath = candidates[0];
                break;
            }
        }
        if (!bestImagePath) {
            throw new Error('No best image found after selection rounds');
        }

        console.log(
            `[design_image] Design spec for "${prompt}":`,
            JSON.stringify(spec, null, 2)
        );
        console.log(`[design_image] Final selection: ${bestImagePath}`);
        console.log(
            '[design_image] Generating high-quality version of the selected image'
        );

        const highQualityResult = await generate_image_raw(
            'Create a high quality version of this image',
            spec.aspect,
            spec.background,
            bestImagePath,
            undefined,
            1,
            'high' // High quality for final image
        );

        if (typeof highQualityResult === 'string') {
            console.log(
                `[design_image] Generated high-quality final image: ${highQualityResult}`
            );
            return highQualityResult;
        } else if (
            Array.isArray(highQualityResult) &&
            highQualityResult.length > 0
        ) {
            console.log(
                `[design_image] Generated high-quality final image: ${highQualityResult[0]}`
            );
            return highQualityResult[0];
        }

        throw new Error(
            '[design_image] High-quality generation returned no valid image'
        );
    } catch (error) {
        console.error(
            '[design_image] Error during image selection or generation:',
            error
        );

        throw error;
    }
}

export function getDesignImageTools() {
    return [
        createToolFunction(
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
            }
        ),
    ];
}
