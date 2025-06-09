/**
 * Design Agent - Orchestrates the entire design generation process using MECH
 */

import { runMECH, runMECHStreaming, type Agent as MechAgent } from '../interfaces/mech.js';
import { createToolFunction, type ResponseInput, Agent, type AgentDefinition, type ProviderStreamEvent } from '@just-every/ensemble';
// getDesignAgentTools removed - not used in this file
import {
    DESIGN_ASSET_TYPES,
    DESIGN_ASSET_REFERENCE,
    DESIGN_ASSET_GUIDE,
    DesignAssetGuideItem,
    DESIGN_SEARCH_ENGINES,
    type DesignSearchEngine,
    type DesignSearchResult,
} from '../constants.js';
// path removed - not used in this file
import { v4 as uuidv4 } from 'uuid';
import { smart_design_raw } from '../design-search.js';

/**
 * Design progress tracker interface
 */
interface DesignProgress {
    phase: string;
    totalPhases: number;
    currentPhase: number;
    tasks: {
        id: string;
        description: string;
        status: 'pending' | 'in_progress' | 'completed';
    }[];
    startTime: Date;
}

/**
 * Create the design agent configuration
 */
export function createDesignAgent(
    userPrompt: string,
    assetType?: DESIGN_ASSET_TYPES,
    withInspiration: boolean = true,
): Agent {

/*
Task List:

1. Pick design type
2. Background research
- web search
- system knowledge for design type
3. Inspiration research
- run design search and narrow results
4. Drafts
- Create a lot of low quality ideas and narrow down
5. Upscale
- Upscale a few of the best and choose winner
    */

    const designId = `design_${uuidv4().substring(0, 6)}`;
    let designType: DESIGN_ASSET_TYPES | undefined = assetType;
    let researchReport: string | undefined;
    let designInspiration: DesignSearchResult[] | undefined;
    let draftDesigns: string | undefined;

    const set_design_type = (design_type: DESIGN_ASSET_TYPES): string => {
        designType = design_type;
        return 'Successfully updated design state';
    };
    const write_research_report = (guide: string, ideal: string, warnings: string, inspiration: string, criteria: string): string => {
        researchReport = `GENERAL GUIDELINES:
${guide}

IDEAL CHARACTERISTICS:
${ideal}

WARNINGS:
${warnings}

INSPIRATION:
${inspiration}

JUDGING CRITERIA:
${criteria}`;
        return 'Successfully updated research report';
    };

    const statusPrompt = (): string => {
        return `=== Design Status ===
Design Request:
${userPrompt}

Design ID: ${designId}
Design Type: ${designType ?? 'Not Set'}

=== Research Report ===
${researchReport ?? 'None Yet'}

=== Design Inspiration ===
${designInspiration ?? 'None Yet'}

=== Draft Designs ===
${draftDesigns ?? 'None Yet'}
`;
    };

    const typePrompt = (): string => {
        const list = Object.entries(DESIGN_ASSET_REFERENCE)
            .map(([k, v]) => `- ${k}: ${v.description}`)
            .join('\n');

        return `**Design Type is missing**
Please set it first with \`set_design_type(design_type)\`

Possible values for design_type:
${list}`;
    };

    const researchPrompt = (): string => {
        const guide = DESIGN_ASSET_GUIDE[designType as DESIGN_ASSET_TYPES] as DesignAssetGuideItem;
        return `**Research Report is missing**

Please use \`write_research_report(guide, ideal, warnings, inspiration, criteria)\` next.

Here's some general research we've performed previously on ${designType}. You can also use \`web_search()\` to gather additional research to if you would like clarification on any area before writing your report. Please make sure your report is relevant to the original **Design Request**.

GUIDE:
- ${guide.guide.join('\n- ')}

IDEAL:
- ${guide.ideal.join('\n- ')}

WARNINGS:
- ${guide.warnings.join('\n- ')}

INSPIRATION:
- ${guide.inspiration.join('\n- ')}

CRITERIA:
- ${guide.criteria.join('\n- ')}`;
    };

    const inspirationPrompt = (): string => {
        return `**Design Inspiration is missing**

Please call design_search() to find appropriate reference images.

Design search can call search many design sources at once, then use use a visual judge to select the best reference images for our task. Ideally we want 2-5 really good reference images to use as inspiration for the actual draft phases.
`;
    };

    const draftPrompt = (): string => {
        return `**No Draft Designs**

Please call design_search() to find appropriate reference images.

Design search can call search many design sources at once, then use use a visual judge to select the best reference images for our task. Ideally we want 2-5 really good reference images to use as inspiration for the actual draft phases.
`;
    };

    const addOperatorStatus = async(messages: ResponseInput): Promise<ResponseInput> => {
        // Add the system status to the messages
        messages.push({
            type: 'message',
            role: 'developer',
            content: statusPrompt(),
        });

        if(!designType) {
            messages.push({
                type: 'message',
                role: 'developer',
                content: typePrompt(),
            });
        }
        else if(!researchReport) {
            messages.push({
                type: 'message',
                role: 'developer',
                content: researchPrompt(),
            });
        }
        else if(!designInspiration) {
            messages.push({
                type: 'message',
                role: 'developer',
                content: inspirationPrompt(),
            });
        }
        else if(!draftDesigns) {
            messages.push({
                type: 'message',
                role: 'developer',
                content: draftPrompt(),
            });
        }

        return messages;
    };

    const design_search = async (
        context: string,
        searchConfigs: {
            engine: DesignSearchEngine;
            query: string;
            limit?: number;
        }[],
        judge_criteria: string,
        count?: number
    ): Promise<DesignSearchResult[]> => {
        if(!designType) {
            throw new Error('Design type is not set');
        }
        return smart_design_raw(context, searchConfigs, count, designType, judge_criteria);
    }

    // Create the Agent instance with all required properties
    const agentConfig = {
        name: 'DesignAgent',
        agent_id: designId,
        modelClass: 'reasoning' as const, // Use reasoning modelClass for complex design tasks
        tools: [
            createToolFunction(
                set_design_type,
                'Set the overall design type',
                {
                    design_type: {
                        type: 'string',
                        description: `Based on the request which type are we most likely designing?`,
                        enum: Object.keys(DESIGN_ASSET_REFERENCE),
                    },
                }
            ),
            createToolFunction(
                write_research_report,
                'Sets the direction for the design based',
                {
                    guide: {
                        type: 'string',
                        description: 'General guidelines on what to focus on',
                    },
                    ideal: {
                        type: 'string',
                        description: 'What\'s ideal characteristics for this design?',
                    },
                    warnings: {
                        type: 'string',
                        description: 'Anything we should avoid?',
                    },
                    inspiration: {
                        type: 'string',
                        description: 'What type of inspiration/reference images should we look for?',
                    },
                    criteria: {
                        type: 'string',
                        description: 'How do we compare the designs we create? Why would one win over the other?',
                    },
                }
            ),
            createToolFunction(
                design_search,
                'Search multiple design platforms in parallel and select the best results using vision-based ranking',
                {
                    context: {
                        type: 'string',
                        description: 'What context about the request needs to be provided to the search engines and judges? They do not have access to any other conversation history or context, so you need to provide all relevant information. This will be included with the search query and the judge criteria so the LLMs using them know what they are doing.',
                    },
                    searches: {
                        type: 'array',
                        description: 'Array of search configurations',
                        items: {
                            type: 'object',
                            properties: {
                                engine: {
                                    type: 'string',
                                    description: 'Design search engine',
                                    enum: DESIGN_SEARCH_ENGINES,
                                },
                                query: {
                                    type: 'string',
                                    description: 'Search query',
                                },
                                limit: {
                                    type: 'number',
                                    description: 'Max results',
                                    optional: true,
                                },
                            },
                            required: ['engine', 'query'],
                        },
                    },
                    judge_criteria: {
                        type: 'string',
                        description: 'What criteria should the searches use to pick the best reference images - i.e. what are they looking for? 1 - 2 sentences.',
                    },
                    count: {
                        type: 'number',
                        description: 'How many final results should be returned from this set of searches? Default: 3',
                        optional: true,
                    }
                },
            ),
        ],
        instructions: `You are one of the best AI designer in the world. You have an eye for aesthetically pleasing designs that push the boundaries of modern interfaces.


        You are given a design task and a series of steps to work through to complete a world class design for any given prompt. While the series of steps are important, you are free to use you best judgement if a step needs to be repeated or skipped to return the best result.

DESIGN SPECIFICATIONS:
${assetType ? `- Asset Type: ${assetType} (${DESIGN_ASSET_REFERENCE[assetType].description})
- Usage Context: ${DESIGN_ASSET_REFERENCE[assetType].usage_context}
- Aspect Ratio: ${DESIGN_ASSET_REFERENCE[assetType].spec.aspect}
- Background: ${DESIGN_ASSET_REFERENCE[assetType].spec.background}` : '- Asset Type: To be determined based on user request'}

YOUR PROCESS:
1. **Research Phase** ${withInspiration ? '(ENABLED)' : '(SKIPPED)'}:
   ${withInspiration ? `- Use smart_design_search to find 3-6 inspiration images
   - Search multiple platforms with queries tailored to the user's request
   - Focus on finding diverse, high-quality references that match the brief` : '- Skipping inspiration search as requested'}

2. **Draft Generation Phase**:
   - Generate 9-12 draft variations using different creative approaches
   - Use reference images (if available) to inform style but create original designs
   - Generate in batches of 3 with varied prompts exploring different concepts

3. **Draft Selection Phase**:
   - Create a grid of all draft images
   - Select the best 3 drafts based on concept strength and brief alignment
   - Minor imperfections are acceptable at this stage

4. **Medium Quality Phase**:
   - Generate 3 medium-quality versions of each selected draft (9 total)
   - Fix any text/spelling errors, improve details, maintain layout
   - Each should refine the concept while preserving what made it successful

5. **Medium Selection Phase**:
   - Create a grid of all medium images
   - Select the single best medium image
   - Look for clean execution and adherence to specifications

6. **High Quality Phase**:
   - Generate a high-quality version of the best medium image
   - Achieve pixel-perfect quality with exact colors and alignment
   - If it doesn't meet criteria, generate up to 2 more attempts

7. **Final Output**:
   - Return the path to the final high-quality image

IMPORTANT:
- When creating

Begin with ${withInspiration ? 'the research phase' : 'draft generation'}.`,
        onRequest: async (agent: AgentDefinition, messages: ResponseInput): Promise<[AgentDefinition, ResponseInput]> => {
            messages = await addOperatorStatus(messages);
            return [agent, messages];
        },
    };

    // Create an Agent instance to ensure compatibility with ensemble
    const agent = new Agent(agentConfig);
    
    // Return the agent instance
    return agent;
}

/**
 * Run the complete design generation process using MECH
 */
export async function runDesignAgent(
    assetType: DESIGN_ASSET_TYPES,
    userPrompt: string,
    withInspiration: boolean = true,
    brandAssets: string[] = [] // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<string> {
    const startTime = new Date();

    // Initialize design progress tracker
    // Design progress tracking (future enhancement)
    const designProgress: DesignProgress = { // eslint-disable-line @typescript-eslint/no-unused-vars
        phase: 'Initialization',
        totalPhases: withInspiration ? 7 : 6,
        currentPhase: 0,
        tasks: withInspiration ? [
            { id: '1', description: 'Research and find inspiration images', status: 'pending' },
            { id: '2', description: 'Generate draft variations (9-12 images)', status: 'pending' },
            { id: '3', description: 'Select best 3 draft concepts', status: 'pending' },
            { id: '4', description: 'Generate medium quality versions (9 total)', status: 'pending' },
            { id: '5', description: 'Select best medium quality image', status: 'pending' },
            { id: '6', description: 'Generate high quality final image', status: 'pending' },
            { id: '7', description: 'Finalize and return result', status: 'pending' }
        ] : [
            { id: '1', description: 'Generate draft variations (9-12 images)', status: 'pending' },
            { id: '2', description: 'Select best 3 draft concepts', status: 'pending' },
            { id: '3', description: 'Generate medium quality versions (9 total)', status: 'pending' },
            { id: '4', description: 'Select best medium quality image', status: 'pending' },
            { id: '5', description: 'Generate high quality final image', status: 'pending' },
            { id: '6', description: 'Finalize and return result', status: 'pending' }
        ],
        startTime
    };

    // Create agent with progress tracking
    const agent = createDesignAgent(userPrompt, assetType, withInspiration);

    // Create the task description
    const task = `Generate a ${assetType} design based on: "${userPrompt}"`;

    // Run the agent using MECH
    const result = await runMECH(agent, task);

    // The result contains status, history, and other metadata
    if (result.status === 'complete' && result.history.length > 0) {
        // Get the last assistant message from history
        const lastMessage = result.history[result.history.length - 1];

        // Check if it's a message type with content
        if (lastMessage && 'type' in lastMessage && lastMessage.type === 'message' &&
            'role' in lastMessage && lastMessage.role === 'assistant' &&
            'content' in lastMessage && typeof lastMessage.content === 'string') {
            // Try to extract a file path from the final message
            const pathMatch = lastMessage.content.match(/\/[^\s]+\.png/);
            if (pathMatch) {
                return pathMatch[0];
            }
        }
    }

    throw new Error('Design agent did not produce a final image path');
}

/**
 * Run the complete design generation process using MECH with streaming
 * @returns AsyncGenerator that yields ProviderStreamEvent objects
 */
export async function* runDesignAgentStreaming(
    assetType: DESIGN_ASSET_TYPES,
    userPrompt: string,
    withInspiration: boolean = true,
    brandAssets: string[] = [] // eslint-disable-line @typescript-eslint/no-unused-vars
): AsyncGenerator<ProviderStreamEvent, string, unknown> {
    const startTime = new Date();

    // Initialize design progress tracker
    const designProgress: DesignProgress = { // eslint-disable-line @typescript-eslint/no-unused-vars
        phase: 'Initialization',
        totalPhases: withInspiration ? 7 : 6,
        currentPhase: 0,
        tasks: withInspiration ? [
            { id: '1', description: 'Research and find inspiration images', status: 'pending' },
            { id: '2', description: 'Generate draft variations (9-12 images)', status: 'pending' },
            { id: '3', description: 'Select best 3 draft concepts', status: 'pending' },
            { id: '4', description: 'Generate medium quality versions (9 total)', status: 'pending' },
            { id: '5', description: 'Select best medium quality image', status: 'pending' },
            { id: '6', description: 'Generate high quality final image', status: 'pending' },
            { id: '7', description: 'Finalize and return result', status: 'pending' }
        ] : [
            { id: '1', description: 'Generate draft variations (9-12 images)', status: 'pending' },
            { id: '2', description: 'Select best 3 draft concepts', status: 'pending' },
            { id: '3', description: 'Generate medium quality versions (9 total)', status: 'pending' },
            { id: '4', description: 'Select best medium quality image', status: 'pending' },
            { id: '5', description: 'Generate high quality final image', status: 'pending' },
            { id: '6', description: 'Finalize and return result', status: 'pending' }
        ],
        startTime
    };

    // Create agent with progress tracking
    const agent = createDesignAgent(userPrompt, assetType, withInspiration);

    // Create the task description
    const task = `Generate a ${assetType} design based on: "${userPrompt}"`;

    // Run the agent using MECH streaming API
    const streamingGenerator = runMECHStreaming(agent, task);
    
    let finalImagePath: string | undefined;
    let lastContent = '';
    let isComplete = false;

    // Process the stream of events
    for await (const event of streamingGenerator) {
        // Yield each event to the caller
        yield event;

        // Track content for extracting the final path
        if (event.type === 'message_delta' && 'content' in event && event.content) {
            lastContent += event.content;
        } else if (event.type === 'message_complete' && 'content' in event && event.content) {
            lastContent = event.content;
        }

        // Check for task completion
        if (event.type === 'tool_done' && 'tool_call' in event) {
            const toolCall = event.tool_call as any;
            if (toolCall?.function?.name === 'task_complete') {
                isComplete = true;
                // Try to extract image path from the result
                const result = toolCall.function?.arguments?.result;
                if (result && typeof result === 'string') {
                    const pathMatch = result.match(/\/[^\s]+\.png/);
                    if (pathMatch) {
                        finalImagePath = pathMatch[0];
                    }
                }
            }
        }

        // Handle errors
        if (event.type === 'error') {
            const errorEvent = event as any;
            throw new Error(`Design agent error: ${errorEvent.error || 'Unknown error'}`);
        }
    }

    // If we didn't find a path in the tool call, try the last content
    if (!finalImagePath && lastContent) {
        const pathMatch = lastContent.match(/\/[^\s]+\.png/);
        if (pathMatch) {
            finalImagePath = pathMatch[0];
        }
    }

    if (finalImagePath) {
        return finalImagePath;
    }

    throw new Error('Design agent did not produce a final image path');
}