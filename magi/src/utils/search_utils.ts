/**
 * Search utility functions for the MAGI system.
 *
 * This module provides tools for web searching and information gathering.
 */

import axios from 'axios';
import { ToolFunction } from '../types/shared-types.js';
import { createToolFunction } from './tool_call.js';
import { quick_llm_call } from './llm_call_utils.js';

const DEFAULT_RESULTS_COUNT = 5;

// Brave Search API configuration
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const BRAVE_SEARCH_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

// Placeholder for other API keys - you'll need to define these
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

/**
 * Search using the Brave Search API
 *
 * @param query - Search query
 * @param numResults - Number of results to return (default: 5)
 * @returns Search results from Brave API
 */
async function braveSearch(
    query: string | any,
    numResults: number = DEFAULT_RESULTS_COUNT
): Promise<string> {
    // Ensure query is a string
    if (typeof query !== 'string') {
        return `Error: Search query must be a string, received ${typeof query}: ${JSON.stringify(query)}`;
    }

    console.log(`Performing Brave API search for: ${query}`);

    if (!BRAVE_API_KEY) {
        // Return a specific error message or an empty result if the key is missing
        return 'Error: Brave Search API key is not configured. Cannot perform search.';
    }

    try {
        const response = await axios.get(BRAVE_SEARCH_ENDPOINT, {
            params: {
                q: query,
                count: numResults,
            },
            headers: {
                Accept: 'application/json',
                'X-Subscription-Token': BRAVE_API_KEY,
            },
        });

        if (response.data && response.data.web && response.data.web.results) {
            const results = response.data.web.results.map((result: any) => ({
                title: result.title,
                url: result.url,
                snippet: result.description,
            }));

            return JSON.stringify(results);
        }
        // It's better to return a structured error or an empty array than to throw an error for "invalid response"
        // unless the API contract guarantees a certain structure.
        console.error(
            'Invalid response structure from Brave Search API:',
            response.data
        );
        return 'Error: Received an invalid response structure from Brave Search API.';
    } catch (error) {
        console.error('Error during Brave API search:', error);
        return `Error performing Brave search: ${error instanceof Error ? error.message : String(error)}`;
    }
}

function signalToolFunction(name: string): ToolFunction {
    return {
        function: () => '',
        definition: {
            type: 'function',
            function: {
                name,
                description: '',
                parameters: {
                    type: 'object',
                    properties: {},
                    required: [],
                },
            },
        },
    };
}

/**
 * Perform a web search and get results
 *
 * @param engine - The search engine
 * @param query - The search query
 * @param numResults - Number of results to return (default: 5)
 * @returns Search results
 */
export async function web_search(
    inject_agent_id: string,
    engine: string,
    query: string,
    numResults: number = DEFAULT_RESULTS_COUNT
): Promise<string> {
    switch (engine) {
        // TODO: Implement search logic for other engines
        case 'brave':
            if (!BRAVE_API_KEY) return 'Error: Brave API key not configured.';
            return await braveSearch(query, numResults);
        case 'anthropic':
            if (!ANTHROPIC_API_KEY)
                return 'Error: Anthropic API key not configured.';
            return await quick_llm_call(
                query,
                null,
                {
                    model: 'claude-3-7-sonnet-latest',
                    name: 'ClaudeSearch',
                    description: 'Search the web',
                    instructions: 'Please search the web for this this query.',
                    modelSettings: {
                        max_tokens: 1024,
                    },
                    tools: [signalToolFunction('claude_web_search')],
                },
                inject_agent_id
            );
        case 'openai':
            if (!OPENAI_API_KEY) return 'Error: OpenAI API key not configured.';
            return await quick_llm_call(
                query,
                null,
                {
                    model: 'gpt-4.1',
                    name: 'OpenAISearch',
                    description: 'Search the web',
                    instructions: 'Please search the web for this this query.',
                    tools: [signalToolFunction('openai_web_search')],
                },
                inject_agent_id
            );
        case 'google':
            if (!GOOGLE_API_KEY) return 'Error: Google API key not configured.';
            return await quick_llm_call(
                query,
                null,
                {
                    model: 'gemini-2.5-flash-preview-04-17',
                    name: 'GoogleSearch',
                    description: 'Search the web',
                    instructions: 'Please answer this using search grounding.',
                    tools: [signalToolFunction('google_web_search')],
                },
                inject_agent_id
            );
        case 'sonar':
        case 'sonar-pro':
        case 'sonar-deep-research':
            if (!OPENROUTER_API_KEY)
                return 'Error: OpenRouter API key not configured.';
            return await quick_llm_call(
                query,
                null,
                {
                    model: `perplexity/${engine === 'sonar-deep-research' ? engine : engine === 'sonar-pro' ? 'sonar-reasoning-pro' : 'sonar-reasoning'}`,
                    name: `Perplexity${engine === 'sonar-deep-research' ? 'Research' : engine === 'sonar-pro' ? 'ProSearch' : 'Search'}`,
                    description: 'Search the web',
                    instructions:
                        'Please answer this using the latest information available.',
                },
                inject_agent_id
            );
    }
    return `Error: Invalid or unsupported search engine ${engine}`;
}

/**
 * Get all search tools as an array of tool definitions
 */
export function getSearchTools(): ToolFunction[] {
    const availableEngines: string[] = [];
    const engineDescriptions: string[] = [];

    if (ANTHROPIC_API_KEY) {
        availableEngines.push('anthropic');
        engineDescriptions.push(
            '- anthropic: deep multi-hop research, strong source citations'
        );
    }
    if (BRAVE_API_KEY) {
        availableEngines.push('brave');
        engineDescriptions.push(
            '- brave: privacy-first, independent index (good for niche/controversial)'
        );
    }
    if (OPENAI_API_KEY) {
        availableEngines.push('openai');
        engineDescriptions.push(
            '- openai: ChatGPT-grade contextual search, cited results'
        );
    }
    if (GOOGLE_API_KEY) {
        availableEngines.push('google');
        engineDescriptions.push(
            '- google: freshest breaking-news facts via Gemini grounding'
        );
    }
    if (OPENROUTER_API_KEY) {
        availableEngines.push('sonar');
        engineDescriptions.push(
            '- sonar: (perplexity) lightweight, cost-effective search model with grounding'
        );
        availableEngines.push('sonar-pro');
        engineDescriptions.push(
            '- sonar-pro: (perplexity) advanced search offering with grounding, supporting complex queries and follow-ups'
        );
        availableEngines.push('sonar-deep-research');
        engineDescriptions.push(
            '- sonar-deep-research: (perplexity) expert-level research model conducting exhaustive searches and generating comprehensive reports'
        );
    }

    if (availableEngines.length === 0) {
        // Optionally, don't offer the tool if no engines are configured
        return [];
    }

    return [
        createToolFunction(
            web_search,
            'Adaptive web search - pick the engines that best fit the query.',
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
    ];
}
