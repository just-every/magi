/**
 * Tool definitions for the Manager Agent
 */

import { createToolFunction, type ToolFunction } from '@just-every/ensemble';
import { web_search, createNumberedGrid, selectBestFromGrid, type ImageSource } from '../manager-search.js';
import { generate_image_raw } from '../manager-image.js';
// Constants removed - unused in this file

/**
 * Get all tools for the manager agent
 */
export function getManagerAgentTools(): ToolFunction[] {
    // Build available engines and descriptions based on environment variables
    const availableEngines: string[] = [];
    const engineDescriptions: string[] = [];

    if (process.env.ANTHROPIC_API_KEY) {
        availableEngines.push('anthropic');
        engineDescriptions.push('- anthropic: deep multi-hop research, strong source citations');
    }
    if (process.env.OPENAI_API_KEY) {
        availableEngines.push('openai');
        engineDescriptions.push('- openai: ChatGPT-grade contextual search, cited results');
    }
    if (process.env.GOOGLE_API_KEY) {
        availableEngines.push('google');
        engineDescriptions.push('- google: freshest breaking-news facts via Gemini grounding');
    }
    if (process.env.OPENROUTER_API_KEY) {
        availableEngines.push('sonar');
        engineDescriptions.push('- sonar: (perplexity) lightweight, cost-effective search model with grounding');
        availableEngines.push('sonar-pro');
        engineDescriptions.push('- sonar-pro: (perplexity) advanced search offering with grounding');
    }
    if (process.env.XAI_API_KEY) {
        availableEngines.push('xai');
        engineDescriptions.push('- xai: real-time web search via Grok');
    }

    return [
        createToolFunction(
            web_search,
            'Comprehensive web search - pick the engines that best fit the query.',
            {
                engine: {
                    type: 'string',
                    description: `Engine to use:\n${engineDescriptions.join('\n')}`,
                    enum: availableEngines,
                },
                query: {
                    type: 'string',
                    description:
                        'Plain-language search query. Each engine has AI interpretation, so you can leave it up to the engine to decide how to search.',
                },
                numResults: {
                    type: 'number',
                    description: 'Max results to return (default = 5).',
                    optional: true, // Assuming numResults is optional
                },
            }
        ),


        // Generate image tool
        createToolFunction(
            generate_image_raw,
            'Generate images using AI with optional source image for variations',
            {
                prompt: {
                    type: 'string',
                    description: 'Detailed prompt describing the desired image',
                },
                aspect: {
                    type: 'string',
                    enum: ['square', 'landscape', 'portrait', 'auto'],
                    description: 'Aspect ratio of the image (default: square)',
                    optional: true,
                },
                background: {
                    type: 'string',
                    enum: ['transparent', 'opaque', 'auto'],
                    description: 'Background type (default: auto)',
                    optional: true,
                },
                sourceImages: {
                    type: 'string',
                    description: 'Path to source image(s) for generating variations',
                    optional: true,
                },
                outputPath: {
                    type: 'string',
                    description: 'Output directory path',
                    optional: true,
                },
                numberOfImages: {
                    type: 'number',
                    description: 'Number of images to generate (default: 1)',
                    optional: true,
                },
                quality: {
                    type: 'string',
                    enum: ['low', 'medium', 'high', 'auto'],
                    description: 'Image quality level (default: medium)',
                    optional: true,
                },
                prefix: {
                    type: 'string',
                    description: 'Prefix for generated filenames (default: generate)',
                    optional: true,
                },
            },
            'Returns array of generated image paths',
            'generate_image'
        ),

        // Create numbered grid tool
        createToolFunction(
            async (args: { images: string[]; columns?: number; prefixLabel?: string }) => {
                // Convert string paths to ImageSource objects
                const imageSources: ImageSource[] = args.images.map(path => ({ url: path }));
                return await createNumberedGrid(imageSources, args.prefixLabel || 'grid', 'square');
            },
            'Create a numbered grid from multiple images for easy selection',
            {
                images: {
                    type: 'array',
                    description: 'Array of image paths to arrange in grid',
                    items: {
                        type: 'string',
                    },
                },
                columns: {
                    type: 'number',
                    description: 'Number of columns in grid (default: 3)',
                    optional: true,
                },
                prefixLabel: {
                    type: 'string',
                    description: 'Prefix for the grid filename',
                    optional: true,
                },
            },
            'Returns path to the generated grid image',
            'create_numbered_grid'
        ),

        // Select best from grid tool
        createToolFunction(
            async (args: { gridImagePath: string; count?: number; selectionPrompt?: string }) => {
                return await selectBestFromGrid(
                    args.gridImagePath,
                    args.selectionPrompt || 'Select the best images',
                    args.count || 1,
                    9, // limit
                    true // isManagerSearch
                );
            },
            'Use vision AI to select the best images from a numbered grid',
            {
                gridImagePath: {
                    type: 'string',
                    description: 'Path to the numbered grid image',
                },
                count: {
                    type: 'number',
                    description: 'Number of images to select (default: 1)',
                    optional: true,
                },
                selectionPrompt: {
                    type: 'string',
                    description: 'Custom instructions for selection criteria',
                    optional: true,
                },
            },
            'Returns array of selected image IDs',
            'select_best_from_grid'
        ),

        /*
        // Get manager specifications tool
        createToolFunction(
            (args: { assetType: string }) => {
                const assetType = args.assetType as MANAGER_ASSET_TYPES;
                const reference = MANAGER_ASSET_REFERENCE[assetType];
                const guide = MANAGER_ASSET_GUIDE[assetType];

                if (!reference) {
                    return {
                        error: `Unknown asset type: ${assetType}`,
                        availableTypes: Object.keys(MANAGER_ASSET_REFERENCE),
                    };
                }

                return {
                    reference,
                    guide,
                    summary: {
                        name: reference.name,
                        description: reference.description,
                        usage: reference.usage_context,
                        dimensions: reference.spec,
                    },
                };
            },
            'Get manager specifications and guidelines for a specific asset type',
            {
                assetType: {
                    type: 'string',
                    enum: Object.keys(MANAGER_ASSET_REFERENCE),
                    description: 'Type of manager asset to get specifications for',
                },
            },
            'Returns specifications and guidelines for the asset type',
            'get_manager_specifications'
        ),

        // Extract image paths from search results tool
        createToolFunction(
            (args: { results: Array<{ selectedImages?: string[]; images?: string[] }> }) => {
                const paths: string[] = [];

                for (const result of args.results) {
                    if (result.selectedImages) {
                        paths.push(...result.selectedImages);
                    } else if (result.images) {
                        paths.push(...result.images);
                    }
                }

                return {
                    count: paths.length,
                    paths: paths,
                };
            },
            'Extract image paths from search results',
            {
                results: {
                    type: 'array',
                    description: 'Array of search results to extract paths from',
                },
            },
            'Returns object with count and paths array',
            'extract_image_paths'
        ),
        */
    ];
}