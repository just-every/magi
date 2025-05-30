/**
 * MECH Memory Wrapper
 *
 * Wraps the Meta-cognition Ensemble Chain-of-thought Hierarchy (MECH) implementation
 * with task-specific memory capabilities.
 *
 * This includes:
 * 1. Pre-run: RAG retrieval of relevant memories from previous tasks
 * 2. Post-run: Learning extraction and storage of insights
 * 3. Tracking of runtime and cost metrics
 */

import { randomUUID } from 'crypto';
import type { MechAgent, MechContext, MechResult } from './types.js';
import { runMECH } from './mech_tools.js';
import { ResponseInput } from '@magi-system/ensemble';

/**
 * Runs the Meta-cognition Ensemble Chain-of-thought Hierarchy (MECH) with memory
 * enhancement, retrieving relevant past experiences before execution and storing
 * new learnings after completion.
 *
 * @param agent - The agent to run
 * @param content - The user input to process
 * @param context - The MECH context containing required utilities
 * @param loop - Whether to loop continuously or exit after completion
 * @param model - Optional fixed model to use
 * @returns Promise that resolves to a MechResult containing status, cost, and metrics
 */
export async function runMECHWithMemory(
    agent: MechAgent,
    content: string,
    context: MechContext,
    loop: boolean = false,
    model?: string
): Promise<MechResult> {
    console.log(
        `Running MECH with memory for task: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`
    );

    // Check if memory features are available
    const hasMemoryFeatures = context.recordTaskStart && 
                            context.embed && 
                            context.lookupMemoriesEmbedding &&
                            context.formatMemories;

    // Record the task start time and get a task ID
    const startTime = Date.now();
    const costBaseline = context.costTracker.getTotalCost();
    let taskId: string | null = null;
    let status: 'complete' | 'fatal_error' = 'complete';
    let embedding: number[] | null = null;
    let memories: any[] = [];

    if (hasMemoryFeatures) {
        try {
            taskId = await context.recordTaskStart!({
                taskId: randomUUID(),
                taskDescription: content,
                prompt: content,
                model,
            });
            console.log(`Task recorded with ID: ${taskId}`);
        } catch (err) {
            console.error('Failed to record task start:', err);
        }

        try {
            // Generate embedding for the prompt
            console.log('Generating embedding for prompt...');
            embedding = await context.embed!(content);

            // Search for similar memories
            console.log('Searching for relevant memories...');
            memories = await context.lookupMemoriesEmbedding!(embedding);

            if (memories.length > 0) {
                // Format and add memories to the history
                const formattedMemories = context.formatMemories!(memories);
                console.log(`Found ${memories.length} relevant memories.`);

                // Add memories to history as a system message
                context.addHistory({
                    type: 'message',
                    role: 'user',
                    content: `PRIOR TASK MEMORIES:
When a similar task completed in the past, we recorded the following notes. They may be relevant. You can choose if you would like to use these to inform your approach to this task, if they make sense.

${formattedMemories}`,
                });
            } else {
                console.log('No relevant memories found.');
            }

            // Register any relevant custom tools based on the task embedding
            if (context.registerRelevantCustomTools) {
                console.log('Looking for relevant custom tools...');
                // Pass the agent with its ID for proper per-agent tool management
                await context.registerRelevantCustomTools(embedding, agent);
            }
        } catch (err) {
            console.error('Failed to retrieve memories:', err);
        }
    }

    // Step 2: Run the original MECH process and get the result
    try {
        const mechResult: MechResult = await runMECH(
            agent,
            content,
            context,
            loop,
            model
        );

        // Extract status, metrics from the result
        status = mechResult.status;
        const durationSec = mechResult.durationSec;
        const totalCost = mechResult.totalCost;

        console.log(
            `Task ${status === 'complete' ? 'completed' : 'failed'} in ${durationSec} seconds with cost $${totalCost.toFixed(6)}`
        );

        // Step 3: Record completion metrics and extract learnings
        if (hasMemoryFeatures && taskId) {
            try {
                // Execute all post-task operations concurrently
                const taskOperations = [
                    // Record task completion metrics
                    context.recordTaskEnd!({
                        taskId,
                        taskDescription: content,
                        status,
                        durationSec,
                        totalCost,
                    }),

                    // Extract learnings from the task history
                    extractAndStoreMemories(
                        agent,
                        context,
                        taskId,
                        status,
                        embedding,
                        memories
                    ),
                ];

                // Add git operations if needed
                if (context.getProcessProjectIds && context.planAndCommitChanges) {
                    const projectIds = context.getProcessProjectIds();
                    if (projectIds && projectIds.length > 0) {
                        // Add each project's git operation directly to taskOperations
                        taskOperations.push(
                            ...projectIds.map(projectId =>
                                context.planAndCommitChanges!(agent, projectId)
                            )
                        );
                    }
                }

                // Run all operations concurrently
                await Promise.all(taskOperations);
            } catch (err) {
                console.error('Failed to record task completion:', err);
            }
        }

        if (mechResult.mechOutcome?.event) {
            // Use sendStreamEvent if available
            if (context.sendStreamEvent) {
                context.sendStreamEvent(mechResult.mechOutcome.event);
            }
        }

        // Return the result to the caller
        return mechResult;
    } catch (error) {
        // Handle unexpected errors (ones not wrapped in MechResult)
        console.error('Unexpected error in MECH execution:', error);
        status = 'fatal_error';

        const endTime = Date.now();
        const durationSec = Math.round((endTime - startTime) / 1000);
        const totalCost = context.costTracker.getTotalCost() - costBaseline;

        // Record error in database
        if (hasMemoryFeatures && taskId && context.recordTaskEnd) {
            try {
                await context.recordTaskEnd({
                    taskId,
                    taskDescription: content,
                    status: 'fatal_error',
                    durationSec,
                    totalCost,
                });
            } catch (err) {
                console.error(
                    'Failed to record task completion after error:',
                    err
                );
            }
        }

        // Return an error result
        return {
            status: 'fatal_error',
            mechOutcome: { error: `Unexpected error: ${error}` },
            history: context.getHistory(),
            durationSec,
            totalCost,
        };
    }

    // Note: We removed the final empty return here because the return happens in the try/catch
}

/**
 * Extract learnings from the task history and store them in the database
 *
 * @param agent - The agent that ran the task
 * @param context - The MECH context
 * @param taskId - The ID of the task to extract learnings from
 * @param status - The completion status of the task
 * @param embedding - The embedding of the original task
 * @param memories - Previously retrieved memories
 */
async function extractAndStoreMemories(
    agent: MechAgent,
    context: MechContext,
    taskId: string,
    status: 'complete' | 'fatal_error',
    embedding: number[] | null,
    memories: any[]
): Promise<void> {
    // Skip MemoryAgent for project_update processes
    if (agent.args?.tool === 'project_update') {
        console.log(
            'MemoryAgent disabled for project_update; skipping learnings extraction.'
        );
        return;
    }

    // Check if we have the necessary utilities
    if (!context.quick_llm_call || !context.describeHistory || !context.formatMemories || !context.insertMemories) {
        console.log('Memory extraction utilities not available, skipping learnings extraction.');
        return;
    }

    try {
        console.log('Extracting learnings from task history...');

        const messages: ResponseInput = [];
        messages.push({
            type: 'message',
            role: 'developer',
            content: `=== Task Status ===

Task ID: **${taskId}**
Task Result: **${status === 'complete' ? 'COMPLETED SUCCESSFULLY' : 'FAILED WITH ERROR'}**`,
        });

        // Call the reasoning model to extract learnings using our utility with JSON mode
        const response = await context.quick_llm_call(
            context.describeHistory(agent, messages, 100),
            null,
            {
                name: 'MemoryAgent',
                description: 'Extract learnings from task history',
                instructions:
                    `You are **MemoryAgent**.

Most tasks teach us *nothing new*.
Return insights **only if they clear a very high bar**.

╭─  HIGH-BAR CHECKLIST  ───────────────────────────────────────────────╮
│ 0. **Novelty gate** →                                                │
│    • Would a skilled developer NOT know this without seeing the      │
│      task succeed/fail?                                              │
│    • Is it missing from PREVIOUS LEARNINGS?                          │
│    If "no" to either → discard.                                      │
│                                                                      │
│ 1. If it *is* novel, write ONE sentence in this exact template:      │
│    "[Tag] <Actionable advice>. Learned <how / when / why we          │
│     discovered this>."                                               │
│    • Start with "Always…", "Avoid…", "Prefer…", or "Consider…".      │
│    • Tag = [BestPractice] [Pitfall] or [Idea].                       │
│    • ≤ 35 words.  Max 3 items.                                       │
╰──────────────────────────────────────────────────────────────────────╯

Typical outcome: **no items** ⇒ respond \`{"learnings": []}\`.

GOOD vs. BAD
────────────────────────────────────────────────────────────────────────────
❌ Narrative only: "We cloned the repo."
❌ Obvious tip: "[BestPractice] Use a virtualenv."
✅ "[Pitfall] Avoid running 'npm ci' inside Docker on Apple Silicon. \
Learned after repeated segfaults due to incompatible node-gyp binaries."
✅ "[BestPractice] Prefer shallow git clones ( --depth 1 ) to cut CI time \
by 40 %. Learned when full clone exceeded the runner's memory limit."

---

` +
                    (memories.length > 0
                        ? `PREVIOUS LEARNINGS (skip duplicates):
${context.formatMemories(memories)}`
                        : ''),
                modelClass: 'reasoning_mini',
                modelSettings: {
                    force_json: true,
                    json_schema: {
                        name: 'learning_extraction',
                        type: 'json_schema',
                        schema: {
                            type: 'object',
                            properties: {
                                learnings: {
                                    type: 'array',
                                    items: { type: 'string' },
                                },
                            },
                            required: ['learnings'],
                        },
                    },
                },
            },
            agent.agent_id
        );

        // Parse JSON response to extract learnings
        let learnings: string[] = [];
        try {
            // Try to parse as JSON first
            const jsonResult = JSON.parse(response);
            if (jsonResult && Array.isArray(jsonResult.learnings)) {
                learnings = jsonResult.learnings;
            } else {
                console.warn(
                    'JSON response missing expected "learnings" array. Response:',
                    response
                );
            }
        } catch (jsonError) {
            // If JSON parsing fails, fall back to bullet point extraction
            console.warn(
                'Failed to parse JSON response, falling back to bullet point extraction:',
                jsonError
            );
            learnings = parseBulletPoints(response);
        }

        if (learnings.length === 0) {
            console.warn('No learnings extracted from task history.');
            return;
        }

        console.log(`Extracted ${learnings.length} learnings.`);

        // Create embeddings for each learning
        const memoryEmbeddings = await Promise.all(
            learnings.map(async text => {
                return {
                    text,
                    embedding:
                        embedding === null ? await context.embed!(text) : embedding,
                    // Score successful tasks higher than failed ones
                    score: status === 'complete' ? 1.0 : 0.5,
                    metadata: {
                        status,
                        // Extract tool names from the history
                        tools: extractToolNames(context.getHistory()),
                    },
                };
            })
        );

        // Store in database
        await context.insertMemories(taskId, memoryEmbeddings);
        console.log('Learnings stored in database.');
    } catch (err) {
        console.error('Failed to extract or store learnings:', err);
    }
}

/**
 * Parse bullet points from a string response
 */
function parseBulletPoints(text: string): string[] {
    // Split the text into lines and find bullet points
    const lines = text.split('\n').map(line => line.trim());
    const bulletPoints: string[] = [];

    for (const line of lines) {
        // Match lines that start with a bullet point marker
        if (line.match(/^[-•*]\s+/) || line.match(/^\d+\.\s+/)) {
            // Remove the bullet point marker
            const content = line
                .replace(/^[-•*]\s+/, '')
                .replace(/^\d+\.\s+/, '')
                .trim();
            if (content) {
                bulletPoints.push(content);
            }
        }
    }

    return bulletPoints;
}

/**
 * Extract tool names from the history
 */
function extractToolNames(history: any[]): string[] {
    const toolNames = new Set<string>();

    for (const item of history) {
        if (item.type === 'function_call' && item.name) {
            toolNames.add(item.name);
        }
    }

    return Array.from(toolNames);
}