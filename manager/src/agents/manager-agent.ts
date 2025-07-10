/**
 * Manager Agent - Orchestrates the entire manager generation process using MECH
 */

import { runMECH, runMECHStreaming, type Agent as MechAgent } from '../interfaces/mech.js';
import { createToolFunction, type ResponseInput, Agent, type AgentDefinition, type ProviderStreamEvent } from '@just-every/ensemble';
// getManagerAgentTools removed - not used in this file
import {
    MANAGER_ASSET_TYPES,
    MANAGER_ASSET_REFERENCE,
    MANAGER_ASSET_GUIDE,
    ManagerAssetGuideItem,
    MANAGER_SEARCH_ENGINES,
    type ManagerSearchEngine,
    type ManagerSearchResult,
} from '../constants.js';
// path removed - not used in this file
import { v4 as uuidv4 } from 'uuid';
import { businessIntelSearch, multiSourceBusinessSearch } from '../manager-search-business.js';
import { addMessageToTask } from "@just-every/task";

/**
 * Manager progress tracker interface
 */
interface ManagerProgress {
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
 * Create the manager agent configuration
 */
export function createManagerAgent(
    userPrompt: string,
    assetType?: MANAGER_ASSET_TYPES,
    withInspiration: boolean = true,
): Agent {

/*
Task List:

1. Pick manager type
2. Background research
- web search
- system knowledge for manager type
3. Inspiration research
- run manager search and narrow results
4. Drafts
- Create a lot of low quality ideas and narrow down
5. Upscale
- Upscale a few of the best and choose winner
    */

    const managerId = `manager_${uuidv4().substring(0, 6)}`;
    let managerType: MANAGER_ASSET_TYPES | undefined = assetType;
    let researchReport: string | undefined;
    let managerInspiration: ManagerSearchResult[] | undefined;
    let draftManagers: string | undefined;

    const set_manager_type = (manager_type: MANAGER_ASSET_TYPES): string => {
        managerType = manager_type;
        return 'Successfully updated manager state';
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
        return `=== CEO Management Task Status ===
Management Request:
${userPrompt}

Task ID: ${managerId}
Deliverable Type: ${managerType ?? 'Not Set'}

=== Research Analysis ===
${researchReport ?? 'Not Started'}

=== Research Sources ===
${managerInspiration ?? 'Not Gathered'}

=== Analysis Progress ===
${draftManagers ?? 'Not Started'}
`;
    };

    const typePrompt = (): string => {
        const list = Object.entries(MANAGER_ASSET_REFERENCE)
            .map(([k, v]) => `- ${k}: ${v.description}`)
            .join('\n');

        return `**Deliverable Type is missing**
Please set it first with \`set_manager_type(manager_type)\`

As Manager-as-CEO, which type of deliverable should we create?
${list}`;
    };

    const researchPrompt = (): string => {
        const guide = MANAGER_ASSET_GUIDE[managerType as MANAGER_ASSET_TYPES] as ManagerAssetGuideItem;
        return `**Research Analysis is missing**

Please use \`write_research_report(guide, ideal, warnings, inspiration, criteria)\` next.

As CEO, here's the strategic framework for ${managerType}. You can also use \`manager_search()\` to gather additional business intelligence before writing your analysis. Ensure the analysis addresses the original **Management Request**.

GUIDELINES:
- ${guide.guide.join('\n- ')}

IDEAL CHARACTERISTICS:
- ${guide.ideal.join('\n- ')}

RISKS TO AVOID:
- ${guide.warnings.join('\n- ')}

RESEARCH SOURCES:
- ${guide.research_sources.join('\n- ')}

EVALUATION CRITERIA:
- ${guide.evaluation_criteria.join('\n- ')}`;
    };

    const inspirationPrompt = (): string => {
        return `**Research Sources are missing**

Please call manager_search() to gather business intelligence and industry insights.

Manager search will query multiple authoritative sources (Gartner, McKinsey, HBR, etc.) to gather relevant research for your analysis. Aim for 3-5 high-quality sources that directly inform your strategic deliverable.
`;
    };

    const draftPrompt = (): string => {
        return `**Analysis Not Started**

Now that you have research sources and framework, begin creating the strategic analysis.

As CEO, synthesize your research into actionable insights. Create a structured analysis that addresses the management request with specific recommendations and next steps. Include any sub-tasks that should be assigned to teams via Magi/Task.
`;
    };

    const addOperatorStatus = async(messages: ResponseInput): Promise<ResponseInput> => {
        // Add the system status to the messages
        messages.push({
            type: 'message',
            role: 'developer',
            content: statusPrompt(),
        });

        if(!managerType) {
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
        else if(!managerInspiration) {
            messages.push({
                type: 'message',
                role: 'developer',
                content: inspirationPrompt(),
            });
        }
        else if(!draftManagers) {
            messages.push({
                type: 'message',
                role: 'developer',
                content: draftPrompt(),
            });
        }

        return messages;
    };

    const manager_search = async (
        context: string,
        searchConfigs: {
            engine: ManagerSearchEngine;
            query: string;
            limit?: number;
        }[],
        judge_criteria: string,
        count?: number
    ): Promise<ManagerSearchResult[]> => {
        try {
            console.log(`[manager_search] Searching ${searchConfigs.length} business intelligence sources`);
            
            const searchPromises = searchConfigs.map(async (config) => {
                const contextualQuery = `${context}\n\n${config.query}`;
                const response = await businessIntelSearch(config.engine, contextualQuery, config.limit || 5);
                return JSON.parse(response);
            });
            
            const allResults = await Promise.all(searchPromises);
            const flatResults = allResults.flat();
            
            // Sort by relevance and limit to requested count
            const sortedResults = flatResults.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
            const limitedResults = sortedResults.slice(0, count || 5);
            
            // Convert to expected ManagerSearchResult format
            return limitedResults.map(result => ({
                url: result.url,
                title: result.title,
                description: result.description,
                source: result.source
            }));
        } catch (error) {
            console.error('[manager_search] Error:', error);
            return [];
        }
    }

    // Create the Agent instance with all required properties
    const agentConfig = {
        name: 'ManagerAgent',
        agent_id: managerId,
        modelClass: 'standard' as const, // Use standard modelClass to avoid thinking blocks issues
        // modelOverride: 'claude-3-5-sonnet-20241022', // Let ensemble choose appropriate model
        // Remove modelSettings - let ensemble handle thinking configuration
        tools: [
            createToolFunction(
                set_manager_type,
                'Set the management task type',
                {
                    manager_type: {
                        type: 'string',
                        description: `Based on the CEO/management request, which deliverable type are we creating?`,
                        enum: Object.keys(MANAGER_ASSET_REFERENCE),
                    },
                }
            ),
            createToolFunction(
                write_research_report,
                'Define the research and analysis approach',
                {
                    guide: {
                        type: 'string',
                        description: 'General guidelines on research methodology and focus areas',
                    },
                    ideal: {
                        type: 'string',
                        description: 'What are the ideal characteristics for this management deliverable?',
                    },
                    warnings: {
                        type: 'string',
                        description: 'Risks or pitfalls to avoid in analysis',
                    },
                    inspiration: {
                        type: 'string',
                        description: 'What type of research sources and references should we prioritize?',
                    },
                    criteria: {
                        type: 'string',
                        description: 'How do we evaluate quality and completeness of the analysis?',
                    },
                }
            ),
            createToolFunction(
                manager_search,
                'Search multiple business intelligence sources for research and analysis',
                {
                    context: {
                        type: 'string',
                        description: 'Context about the CEO/management task and what specific information is needed for analysis',
                    },
                    searches: {
                        type: 'array',
                        description: 'Array of search configurations across different business intelligence sources',
                        items: {
                            type: 'object',
                            properties: {
                                engine: {
                                    type: 'string',
                                    description: 'Business intelligence search engine',
                                    enum: MANAGER_SEARCH_ENGINES,
                                },
                                query: {
                                    type: 'string',
                                    description: 'Search query tailored to the specific source',
                                },
                                limit: {
                                    type: 'number',
                                    description: 'Max results to retrieve',
                                    optional: true,
                                },
                            },
                            required: ['engine', 'query'],
                        },
                    },
                    judge_criteria: {
                        type: 'string',
                        description: 'Criteria for evaluating and ranking the research results for relevance and quality',
                    },
                    count: {
                        type: 'number',
                        description: 'How many final research sources should be returned? Default: 5',
                        optional: true,
                    }
                },
            ),
        ],
        instructions: `You are a **Manager-as-CEO** AI assistant for JustEvery Inc. You have expertise in strategic planning, market analysis, operational excellence, and executive decision-making.

**COMPANY CONTEXT:**
- Mission: "Turn any single prompt into a live product—UI, back-end, hosting and all." 100% MIT-licensed, community-first, democratizing software creation.
- Product Stack: Ensemble → Task → Magi → JustEvery social layer
- Goal: Ship JustEvery App v1.0 to public beta by Dec 2025 with ≥10k MAU and ≤2% critical error rate
- Values: Radical openness, post-scarcity ethos (90% profit donation), healthy risk-taking

**YOUR CEO RESPONSIBILITIES:**
1. **Market & Tech Research** - Competitive analysis, feature prioritization for non-technical creators
2. **Strategic Planning** - 12-month roadmap, quarterly OKRs, team alignment
3. **Execution Oversight** - Sub-task creation via Magi/Task, budget management ($25k/month ceiling)
4. **Feedback & Governance** - Weekly progress reports, decision logging, team communication
5. **Risk Management** - Technical, legal, financial risk identification and mitigation

**DELIVERABLE TYPE:**
${assetType ? `- Type: ${assetType} (${MANAGER_ASSET_REFERENCE[assetType].description})
- Usage: ${MANAGER_ASSET_REFERENCE[assetType].usage_context}
- Output: ${MANAGER_ASSET_REFERENCE[assetType].spec.type}` : '- Type: To be determined based on management task'}

**YOUR PROCESS:**
1. **Research Phase** ${withInspiration ? '(ENABLED)' : '(SKIPPED)'}:
   ${withInspiration ? `- Search Gartner, McKinsey, HBR, TechCrunch, Forrester for industry insights
   - Gather 3-5 authoritative sources relevant to the task
   - Focus on recent trends, best practices, and strategic frameworks` : '- Skipping external research as requested'}

2. **Analysis Phase**:
   - Synthesize research into actionable insights
   - Apply strategic frameworks (SWOT, Porter's Five Forces, etc.)
   - Consider JustEvery's specific context and constraints

3. **Structure Phase**:
   - Organize analysis into executive-ready format
   - Include key recommendations and next steps
   - Ensure alignment with quarterly OKRs and company goals

4. **Review Phase**:
   - Validate against CEO responsibilities and company values
   - Check for completeness and actionability
   - Ensure appropriate level of detail for executive consumption

5. **Final Output**:
   - Deliver structured management deliverable
   - Include executive summary, key insights, and recommended actions
   - Specify any sub-tasks that should be created via Magi/Task

**OPERATING RULES:**
- Ask clarifying questions for underspecified objectives
- Seek approval before exceeding budget by >10%
- Maintain supportive, transparent tone
- Focus on decisions and actions, not just analysis

Begin with ${withInspiration ? 'research and analysis' : 'strategic analysis'}.`,
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
 * Run the complete manager generation process using MECH
 */
export async function runManagerAgent(
    assetType: MANAGER_ASSET_TYPES,
    userPrompt: string,
    withInspiration: boolean = true,
    brandAssets: string[] = [] // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<string> {
    const startTime = new Date();

    // Initialize manager progress tracker
    // CEO task progress tracking
    const managerProgress: ManagerProgress = { // eslint-disable-line @typescript-eslint/no-unused-vars
        phase: 'Strategic Analysis',
        totalPhases: withInspiration ? 5 : 4,
        currentPhase: 0,
        tasks: withInspiration ? [
            { id: '1', description: 'Gather business intelligence and research', status: 'pending' },
            { id: '2', description: 'Analyze market and competitive landscape', status: 'pending' },
            { id: '3', description: 'Synthesize strategic insights and recommendations', status: 'pending' },
            { id: '4', description: 'Create executive deliverable', status: 'pending' },
            { id: '5', description: 'Define next steps and sub-tasks', status: 'pending' }
        ] : [
            { id: '1', description: 'Analyze strategic requirements', status: 'pending' },
            { id: '2', description: 'Synthesize insights and recommendations', status: 'pending' },
            { id: '3', description: 'Create executive deliverable', status: 'pending' },
            { id: '4', description: 'Define next steps and sub-tasks', status: 'pending' }
        ],
        startTime
    };

    // Create agent with progress tracking
    const agent = createManagerAgent(userPrompt, assetType, withInspiration);

    // Create the task description
    const task = `Generate a ${assetType} manager based on: "${userPrompt}"`;

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

    throw new Error('Manager agent did not produce a final image path');
}

/**
 * Run the complete manager generation process using MECH with streaming
 * @returns AsyncGenerator that yields ProviderStreamEvent objects
 */
export async function* runManagerAgentStreaming(
    assetType: MANAGER_ASSET_TYPES,
    userPrompt: string,
    withInspiration: boolean = true,
    brandAssets: string[] = [] // eslint-disable-line @typescript-eslint/no-unused-vars
): AsyncGenerator<ProviderStreamEvent, string, unknown> {
    const startTime = new Date();

    // Initialize manager progress tracker
    const managerProgress: ManagerProgress = { // eslint-disable-line @typescript-eslint/no-unused-vars
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
    const agent = createManagerAgent(userPrompt, assetType, withInspiration);

    // Create the task description
    const task = `Generate a ${assetType} manager based on: "${userPrompt}"`;

    // Inject messages from external code
    //addMessageToTask(task, {
    //    type: 'message',
    //    role: 'developer',
    //    content: 'Strategic guidance'
    //});

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
            throw new Error(`Manager agent error: ${errorEvent.error || 'Unknown error'}`);
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

    throw new Error('Manager agent did not produce a final image path');
}
