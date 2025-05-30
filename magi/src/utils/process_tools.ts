import { ProcessToolType } from '../types/shared-types.js'; // Removed AgentProcess
import { ToolFunction } from '@magi-system/ensemble';
import { getCommunicationManager, sendStreamEvent } from './communication.js'; // Added sendStreamEvent
import { processTracker } from './process_tracker.js';
import { dateFormat } from './date_tools.js';
import { createToolFunction } from './tool_call.js';
import { getAllProjectIds, getExternalProjectIds } from './project_utils.js';
import { TASK_TYPE_DESCRIPTIONS } from '../magi_agents/constants.js';

/**
 * Send a message to a specific process
 *
 * @param taskId The ID of the process to send the message to
 * @param message The message to send
 * @returns Success message or error
 */
function send_message(taskId: string, command: string): string {
    const process = processTracker.getProcess(taskId);

    if (!process || process.status === 'terminated') {
        return `Error: taskId ${taskId} has been terminated.`;
    }

    try {
        // Get the communication manager
        const comm = getCommunicationManager();

        // Send a command event to the controller that will route it to the target process
        comm.send({
            type: 'command_start',
            targetProcessId: taskId,
            command,
        });

        return `Message sent to taskId ${taskId} successfully`;
    } catch (error) {
        return `Error sending message to taskId ${taskId}: ${error}`;
    }
}

/**
 * Get the current status of a task
 *
 * @param taskId The ID of the task to view
 * @param detailed Whether to return the full details (false = summarized view)
 * @returns A detailed or summarized view of the current status of the task
 */
async function get_task_status(
    taskId: string,
    detailed: boolean = false
): Promise<string> {
    return processTracker.getStatus(taskId, !detailed);
}

/**
 * Check the health of all active tasks
 * Returns information about any tasks that appear to be failing or stuck
 *
 * @returns Information about potentially failing tasks
 */
async function check_all_task_health(): Promise<string> {
    const failingTaskIds = await processTracker.checkTaskHealth();

    if (failingTaskIds.length === 0) {
        return 'All tasks appear to be functioning normally.';
    }

    let result = `WARNING: ${failingTaskIds.length} task(s) appear to be failing or stuck:\n\n`;

    for (const taskId of failingTaskIds) {
        const process = processTracker.getProcess(taskId);
        if (process) {
            result += `- Task ${taskId}: ${process.name} (Status: ${process.status})\n`;
        }
    }

    result +=
        '\nConsider checking these tasks with get_task_status() for more details.';
    return result;
}

/**
 * Create a new process.
 *
 * @param tool ProcessToolType The process to create
 * @param name string The name of the process
 * @param command string The command to start the process with
 * @param project string[] Array of project names to mount
 * @returns Success message
 */
function startProcess(
    tool: ProcessToolType,
    name: string,
    command: string,
    project?: string[]
): string {
    const comm = getCommunicationManager();

    const taskId = `AI-${Math.random().toString(36).substring(2, 8)}`;

    // Save a record of the process
    const agentProcess = processTracker.addProcess(taskId, {
        processId: taskId,
        started: new Date(),
        status: 'started',
        tool,
        name,
        command,
        projectIds: project,
    });

    // Send start event to the controller
    comm.send({
        type: 'process_start',
        agentProcess,
    });

    return `taskId ${taskId} ${tool} (${name}) started at ${dateFormat()}.`;
}

// function startResearchEngine(name: string, command: string, project?: string[]): string {
// 	return startProcess('research_engine', name, command);
// }
// function startGodelMachine(name: string, command: string, project?: string[]): string {
// 	return startProcess('godel_machine', name, command);
// }
function start_task(
    name: string,
    task: string,
    context: string,
    warnings: string,
    goal: string,
    type?: ProcessToolType,
    project?: string[]
): string {
    const command: string[] = [];
    if (task) command.push(`**Task:** ${task}`);
    if (context) command.push(`**Context:** ${context}`);
    if (warnings) command.push(`**Warnings:** ${warnings}`);
    if (goal) command.push(`**Goal:** ${goal}`);

    return startProcess(type, name, command.join('\n\n'), project);
}

/**
 * Wait for a running task (started via start_task) to complete.
 *
 * @param taskId The ID of the task to wait for.
 * @param timeout The maximum time to wait in seconds (default: 1800 = 30 minutes).
 * @returns The final status message of the task if it completes, fails, or is terminated within the timeout, or a timeout message.
 */
const TASK_HEARTBEAT_MS = 60_000; // Heartbeat every 60 seconds

async function wait_for_running_task(
    taskId: string,
    timeout: number = 1800,
    abort_signal?: AbortSignal
): Promise<string> {
    const startTime = Date.now();
    const timeoutMs = timeout * 1000;
    let lastHeartbeatTime = Date.now();
    let finalResult = ''; // To store the final message

    // Send start event
    sendStreamEvent({
        type: 'task_wait_start',
        taskId,
        timestamp: new Date().toISOString(),
        overseer_notification: true, // Let the overseer know we're deliberately waiting
    });

    // Initial check
    const initialProcess = processTracker.getProcess(taskId);
    if (!initialProcess) {
        finalResult = `Error: Task with ID ${taskId} not found or already finished before waiting began.`;
        sendStreamEvent({
            type: 'task_wait_complete',
            taskId,
            result: finalResult,
            finalStatus: 'unknown',
            timestamp: new Date().toISOString(),
        });
        return finalResult;
    }
    if (
        initialProcess.status !== 'running' &&
        initialProcess.status !== 'started' &&
        initialProcess.status !== 'waiting'
    ) {
        // Already finished before we started waiting
        switch (initialProcess.status) {
            case 'completed':
                finalResult =
                    initialProcess.output ??
                    `Task ${taskId} completed (status checked before wait).`;
                break;
            case 'failed':
                finalResult =
                    initialProcess.error ??
                    `Task ${taskId} failed (status checked before wait).`;
                break;
            case 'terminated':
                finalResult = `Task ${taskId} was terminated (status checked before wait).`;
                break;
            default:
                finalResult = `Task ${taskId} has unexpected status '${initialProcess.status}' before waiting began.`;
                break;
        }
        sendStreamEvent({
            type: 'task_wait_complete',
            taskId,
            result: finalResult,
            finalStatus: initialProcess.status,
            timestamp: new Date().toISOString(),
        });
        return finalResult;
    }

    // Polling loop
    while (Date.now() - startTime < timeoutMs) {
        // Check if the operation was aborted
        if (abort_signal?.aborted) {
            finalResult = `Wait for task ${taskId} was aborted.`;
            // Send stream event indicating abort - using task_wait_complete type with aborted status
            sendStreamEvent({
                type: 'task_wait_complete',
                taskId,
                result: finalResult,
                finalStatus: 'aborted',
                timestamp: new Date().toISOString(),
            });
            break; // Exit loop
        }

        const process = processTracker.getProcess(taskId);

        if (!process) {
            // Task finished and was removed? Should not happen if initial check passed.
            finalResult = `Task with ID ${taskId} disappeared unexpectedly after waiting began. Check system messages.`;
            break; // Exit loop
        }

        switch (process.status) {
            case 'completed':
                finalResult =
                    process.output ??
                    `Task ${taskId} completed. Check system messages for output.`;
                break; // Exit loop
            case 'failed':
                finalResult =
                    process.error ??
                    `Task ${taskId} failed. Check system messages for error details.`;
                break; // Exit loop
            case 'terminated':
                finalResult = `Task ${taskId} was terminated.`;
                break; // Exit loop
            case 'running':
            case 'started':
            case 'waiting':
                // Send heartbeat if needed
                if (Date.now() - lastHeartbeatTime > TASK_HEARTBEAT_MS) {
                    sendStreamEvent({
                        type: 'task_waiting',
                        taskId,
                        elapsedSeconds: Math.round(
                            (Date.now() - startTime) / 1000
                        ),
                        timestamp: new Date().toISOString(),
                    });
                    lastHeartbeatTime = Date.now();
                }
                // Still active, wait and check again
                try {
                    await new Promise((resolve, reject) => {
                        if (abort_signal?.aborted) {
                            reject(new Error('Aborted before delay'));
                            return;
                        }
                        const timerId = setTimeout(resolve, 1000);
                        abort_signal?.addEventListener(
                            'abort',
                            () => {
                                clearTimeout(timerId);
                                reject(new Error('Aborted during delay'));
                            },
                            { once: true }
                        );
                    });
                } catch (error) {
                    if (abort_signal?.aborted) {
                        finalResult = `Wait for task ${taskId} completed.`;
                        // Send stream event - using task_wait_complete type with aborted status
                        sendStreamEvent({
                            type: 'task_wait_complete',
                            taskId,
                            result: finalResult,
                            finalStatus: 'aborted',
                            timestamp: new Date().toISOString(),
                        });
                        break; // Exit the switch
                    }
                    // Re-throw if it's not an abort error, though unlikely here
                    // throw error;
                }
                continue; // Continue loop
            default:
                // Should not happen with defined statuses
                console.error(
                    `Unexpected status '${process.status}' for task ${taskId}`
                );
                finalResult = `Error: Encountered unexpected status '${process.status}' for task ${taskId}.`;
                break; // Exit loop
        }
        // If we reached here, the status was not 'running'/'started'/'waiting', so break the loop
        break;
    }

    // If the loop finished due to timeout
    if (!finalResult) {
        const finalStatus =
            processTracker.getProcess(taskId)?.status ?? 'unknown';
        finalResult = `Task ${taskId} did not complete within the ${timeout} second timeout. It might still be running.\nLast known status: ${finalStatus}`;
    }

    // Send completion event
    sendStreamEvent({
        type: 'task_wait_complete',
        taskId,
        result: finalResult,
        finalStatus: processTracker.getProcess(taskId)?.status ?? 'unknown',
        timestamp: new Date().toISOString(),
    });

    return finalResult;
}

/**
 * Get all project tools as an array of tool definitions
 */
export function getProcessTools(): ToolFunction[] {
    return [
        createToolFunction(
            start_task,
            'Starts a new Task. Uses human level intelligence.',
            {
                name: 'Give this task a name - four words or less. Can be funny, like a fictional reference or a pun, or if none work make it descriptive.',
                task: 'What task would like to work on? You should explain both the specific goal for the task and any additional information they need. Generally you should leave the way the task is performed up to the task operator unless you need a very specific set of tools used. Agents are expected to work autonomously, so will rarely ask additional questions.',
                context:
                    "If this is a request from someone else, explain the original request here. If this in response to a problem or project you're working on, provide some background on the issue/project here. The task agents only have the background information you provide, so please make it comprehensive. A couple of paragraphs is ideal.",
                warnings:
                    'Are there any warnings or things to be aware of? This could be a list of things to avoid, or things that are not working as expected. This is optional, but can help the task operator avoid problems.',
                goal: 'What is the final goal of this task? This is the final output or result you expect from the task. It should be a single sentence or two at most',
                type: {
                    description: `The type of task to start. Determines which operator that will run the task.\n\n${Object.entries(
                        TASK_TYPE_DESCRIPTIONS
                    )
                        .map(([type, description]) => `${type}: ${description}`)
                        .join('\n')}`,
                    type: 'string',
                    enum: Object.keys(TASK_TYPE_DESCRIPTIONS),
                },
                project: {
                    description:
                        'An array of projects to mount for the task giving the task access to a copy of files. For coding tasks, first create a project of the relevant type as this will fill the project with a skeleton template for coding agents to work from. The task can modify the files and submit them back as a new git branch.' +
                        (getExternalProjectIds().includes('magi-system')
                            ? ' Include "magi-system" to provide access to your code.'
                            : '') +
                        ' The task will have access to these files at /magi_output/{taskId}/projects/{project}. Their default branch will be "magi/{taskId}". If you provide only one project, that will be their working directory when they start (otherwise it will be /magi_output/{taskId}/working)\nNote: ONLY INCLUDE PROJECTS THE TASK NEEDS as an entire copy of the project is made for each task. For large projects this take 10+ seconds.',
                    type: 'array',
                    enum: () => getAllProjectIds(),
                },
            },
            'A description of information found or work that has been completed'
        ),
        createToolFunction(
            send_message,
            'Send a message to an task you are managing',
            {
                taskId: 'The ID of the task to send the message to',
                command:
                    "The message to send to the task. Send 'stop' to terminate the task. Any other message will be sent to the agent running the task to guide it's operation.",
            },
            'If the message was sent successfully or not'
        ),
        createToolFunction(
            get_task_status,
            'See the status of a task you are managing',
            {
                taskId: 'The ID of the task to view',
                detailed:
                    'Set to true for full details including complete history, or false (default) for a summarized view',
            },
            'A view of the current status of the task, summarized by default or detailed if requested.'
        ),
        createToolFunction(
            check_all_task_health,
            'Check the health of all active tasks and identify any that appear to be failing or stuck',
            {},
            'Information about any tasks that may be failing, along with recommendations'
        ),
        createToolFunction(
            wait_for_running_task,
            'Wait for a task you started with start_task() to finish. Avoids needing to check status repeatedly.',
            {
                taskId: 'The ID of the task to wait for',
                timeout: {
                    type: 'number',
                    description:
                        'The maximum time to wait for the task to finish, in seconds. Defaults to 1800 seconds (30 minutes).',
                    default: 1800,
                },
            },
            'The final status message of the task (completion, failure, termination, or timeout).'
        ),
    ];
}
