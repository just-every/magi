/**
 * Communication Manager Module
 *
 * Handles WebSocket communication with MAGI containers
 */

import { Server as WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import { ProcessManager } from './process_manager';
import { createNewProject } from './container_manager.js';
import fs from 'fs';
import path from 'path';
import { talk } from '../utils/talk';
import {
    CostUpdateData,
    CostUpdateEvent,
    GlobalCostData,
    MagiMessage,
    CommandMessage,
    SystemCommandMessage,
    AgentProcess,
    EventHandler,
    ContainerConnection,
    StreamingEvent,
} from '../../types/index';

interface ProcessState {
    accumulatedData: CostUpdateData;
    // Stores recent events for calculating cost in the last minute
    recentEvents: Array<{ timestamp: number; cost: number }>; // timestamp in milliseconds
}

export class CommunicationManager {
    private wss: WebSocketServer;
    private processManager: ProcessManager;
    private connections: Map<string, WebSocket> = new Map();
    private containerData: Map<string, ContainerConnection> = new Map();
    private storageDir: string;
    private costStartTime: number = Date.now();
    private processCostData: Record<string, ProcessState> = {};
    private readonly LAST_MINUTE_WINDOW_MS = 60 * 1000;
    private eventHandlers: Map<string, EventHandler> = new Map();

    constructor(server: HttpServer, processManager: ProcessManager) {
        this.processManager = processManager;
        this.processManager.setCommunicationManager(this);
        this.storageDir = path.join(
            process.cwd(),
            'dist/.server/magi_messages'
        );

        // Ensure storage directory exists
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }

        // Initialize WebSocket server
        this.wss = new WebSocketServer({
            noServer: true,
        });

        this.setupWebSocketServer();
    }

    /**
     * Handle WebSocket upgrade requests
     */
    public handleWebSocketUpgrade(request: any, socket: any, head: any): void {
        // Extract process ID from URL path
        // Expected format: /ws/magi/:processId
        const urlPath = request.url || '';
        const pathParts = urlPath.split('/');
        const processId = pathParts[pathParts.length - 1];

        if (!processId || processId === 'magi') {
            console.error(
                'Invalid WebSocket upgrade attempt - missing process ID'
            );
            socket.destroy();
            return;
        }

        // Handle the upgrade
        this.wss.handleUpgrade(request, socket, head, ws => {
            // Set the processId as a property on the WebSocket
            (ws as any).processId = processId;
            this.wss.emit('connection', ws, request);
        });
    }

    private setupWebSocketServer(): void {
        this.wss.on('connection', ws => {
            try {
                // Get the processId from the WebSocket object
                const processId = (ws as any).processId;

                if (!processId || processId === 'magi') {
                    console.error(
                        'Invalid WebSocket connection attempt - missing process ID'
                    );
                    ws.close(1008, 'Invalid connection - missing process ID');
                    return;
                }

                console.log(
                    `WebSocket connection established for process ${processId}`
                );

                // Store connection
                this.connections.set(processId, ws);

                // Initialize container data if not exists
                if (!this.containerData.has(processId)) {
                    const containerConnection: ContainerConnection = {
                        processId,
                        lastMessage: new Date(),
                        messageHistory: [],
                    };

                    this.containerData.set(processId, containerConnection);

                    // Load history from disk if available
                    this.loadMessageHistory(processId);
                }

                // Handle incoming messages
                ws.on('message', async data => {
                    try {
                        const message = JSON.parse(
                            data.toString()
                        ) as MagiMessage;

                        if (
                            !message.processId ||
                            message.processId !== processId
                        ) {
                            console.error(
                                `Message process ID mismatch: ${message.processId} vs ${processId}`
                            );
                            return;
                        }

                        // Update last message timestamp
                        const containerData = this.containerData.get(processId);
                        if (containerData) {
                            containerData.lastMessage = new Date();

                            // Store in message history
                            containerData.messageHistory.push(message);

                            // Save to disk periodically (we don't need to save every message)
                            if (containerData.messageHistory.length % 5 === 0) {
                                this.saveMessageHistory(processId);
                            }
                        }

                        // Process the message based on type
                        await this.processContainerMessage(processId, message);
                    } catch (err) {
                        console.error(
                            'Error processing WebSocket message:',
                            err
                        );
                    }
                });

                // Handle disconnections
                ws.on('close', () => {
                    console.log(
                        `WebSocket connection closed for process ${processId}`
                    );
                    this.connections.delete(processId);

                    // Save message history on disconnect but don't delete container data
                    // This allows us to preserve history if the container reconnects
                    this.saveMessageHistory(processId);

                    // Log that the container may reconnect with updated port
                    const serverPort = process.env.PORT || '3010';
                    console.log(
                        `Container ${processId} disconnected. When it reconnects, it will use port ${serverPort}`
                    );
                });

                // Handle errors
                ws.on('error', err => {
                    console.error(
                        `WebSocket error for process ${processId}:`,
                        err
                    );
                    this.connections.delete(processId);
                });

                // Send a welcome message to confirm connection
                // Include the current server port so containers can update if needed
                const serverPort = process.env.PORT || '3010';
                const connectMessage: CommandMessage = {
                    type: 'connect',
                    command: '',
                    args: {
                        timestamp: new Date().toISOString(),
                        controllerPort: serverPort,
                    },
                };

                ws.send(JSON.stringify(connectMessage));
            } catch (err) {
                console.error('Error handling WebSocket connection:', err);
                ws.close(1011, 'Internal server error');
            }
        });
    }

    /**
     * Retrieves or initializes the ProcessState for a given processId.
     * @param processId The identifier for the process.
     * @returns The ProcessState object for the process.
     */
    private getOrCreateProcessState(processId: string): ProcessState {
        if (!this.processCostData[processId]) {
            // Initialize state for a new process
            const now = new Date();
            this.processCostData[processId] = {
                // Initialize accumulated data
                accumulatedData: {
                    time: {
                        start: now.toISOString(), // Process start time (first seen)
                        now: now.toISOString(), // Initialize 'now'
                    },
                    cost: { total: 0, last_min: 0 },
                    tokens: { input: 0, output: 0 },
                    models: {},
                },
                // Initialize recent events list
                recentEvents: [],
            };
            console.log(
                `Initialized cost tracking for new process: ${processId}`
            );
        }
        return this.processCostData[processId];
    }

    /**
     * Calculates the aggregated global cost data by summing up stats from all processes.
     * @returns CostUpdateData representing the global state.
     */
    private calculateGlobalCostData(): CostUpdateData {
        const globalData: CostUpdateData = {
            time: {
                start: new Date(this.costStartTime).toISOString(),
                now: new Date(this.costStartTime).toISOString(),
            },
            cost: { total: 0, last_min: 0 }, // Initialize global last_min
            tokens: { input: 0, output: 0 },
            models: {},
        };
        let latestTime = this.costStartTime;

        for (const processId in this.processCostData) {
            if (
                Object.prototype.hasOwnProperty.call(
                    this.processCostData,
                    processId
                )
            ) {
                // Use the accumulatedData part of the process state
                const processAccumulatedData =
                    this.processCostData[processId].accumulatedData;

                globalData.cost.total += processAccumulatedData.cost.total;
                // Sum the per-process last_min values for the global last_min
                globalData.cost.last_min +=
                    processAccumulatedData.cost.last_min;
                globalData.tokens.input += processAccumulatedData.tokens.input;
                globalData.tokens.output +=
                    processAccumulatedData.tokens.output;

                const processUpdateTime = new Date(
                    processAccumulatedData.time.now
                ).getTime();
                if (processUpdateTime > latestTime) {
                    latestTime = processUpdateTime;
                }

                for (const modelName in processAccumulatedData.models) {
                    if (
                        Object.prototype.hasOwnProperty.call(
                            processAccumulatedData.models,
                            modelName
                        )
                    ) {
                        const processModelUsage =
                            processAccumulatedData.models[modelName];
                        if (!globalData.models[modelName]) {
                            globalData.models[modelName] = {
                                cost: 0,
                                calls: 0,
                            };
                        }
                        globalData.models[modelName].cost +=
                            processModelUsage.cost;
                        globalData.models[modelName].calls +=
                            processModelUsage.calls;
                    }
                }
            }
        }
        globalData.time.now = new Date(latestTime).toISOString();
        return globalData;
    }

    /**
     * Handles an incoming incremental model usage event.
     * Updates the specific process's accumulated state (including cost.last_min)
     * and triggers global recalculation/emission.
     * @param payload - The event payload containing processId and the single ModelUsage increment.
     */
    public handleModelUsage(processId: string, event: CostUpdateEvent): void {
        // Extract usage data from the event object
        const { usage } = event; // Get usage from the event parameter

        // Check for valid processId and usage data within the event
        if (!processId) {
            console.warn('handleModelUsage called without processId.');
            return;
        }
        if (!usage) {
            console.warn(
                `Received CostUpdateEvent without usage data for process ${processId}:`,
                event
            );
            return;
        }
        if (event.type !== 'cost_update') {
            console.warn(
                `Received event with incorrect type for process ${processId}:`,
                event
            );
            return;
        }

        try {
            // Get (or create) the state object for this process
            const processState = this.getOrCreateProcessState(processId);
            const accumulatedData = processState.accumulatedData; // Shorthand

            // --- Incrementally Update Process State ---
            const usageCost = usage.cost ?? 0;
            const usageInputTokens = usage.input_tokens ?? 0;
            const usageOutputTokens = usage.output_tokens ?? 0;

            // Safely parse the timestamp string, default to now if invalid/missing
            let parsedTimestamp: Date;
            if (usage.timestamp) {
                parsedTimestamp = new Date(usage.timestamp);
                if (isNaN(parsedTimestamp.getTime())) {
                    // Check if parsing failed
                    console.warn(
                        `Invalid timestamp string received for process ${processId}: ${usage.timestamp}. Defaulting to current time.`
                    );
                    parsedTimestamp = new Date(); // Fallback to now
                }
            } else {
                parsedTimestamp = new Date(); // Default to now if timestamp is missing
            }
            const usageTimestampMs = parsedTimestamp.getTime();

            // Update totals
            accumulatedData.cost.total += usageCost;
            accumulatedData.tokens.input += usageInputTokens;
            accumulatedData.tokens.output += usageOutputTokens;
            // Use the parsed Date object to get ISO string
            accumulatedData.time.now = parsedTimestamp.toISOString();

            // Update model usage
            if (usage.model) {
                if (!accumulatedData.models[usage.model]) {
                    accumulatedData.models[usage.model] = { cost: 0, calls: 0 };
                }
                accumulatedData.models[usage.model].cost += usageCost;
                accumulatedData.models[usage.model].calls += 1;
            }

            // --- Calculate cost.last_min for this process ---
            // 1. Add current event to recent history (using parsed timestamp in ms)
            processState.recentEvents.push({
                timestamp: usageTimestampMs,
                cost: usageCost,
            });

            // 2. Calculate the cutoff time (60 seconds ago from now)
            const cutoffTimeMs = Date.now() - this.LAST_MINUTE_WINDOW_MS;
            let currentLastMinCost = 0;

            // 3. Filter events within the window and sum their cost
            //    Also, prune events older than the window while iterating
            processState.recentEvents = processState.recentEvents.filter(
                histEvent => {
                    // Renamed inner variable
                    // Ensure histEvent.timestamp is valid before comparison
                    if (
                        !isNaN(histEvent.timestamp) &&
                        histEvent.timestamp >= cutoffTimeMs
                    ) {
                        currentLastMinCost += histEvent.cost;
                        return true; // Keep event
                    }
                    return false; // Discard (prune) event
                }
            );

            // 4. Update the accumulated last_min cost for this process
            accumulatedData.cost.last_min = currentLastMinCost;

            console.log(
                `Incremented usage for process: ${processId}, model: ${usage.model || 'N/A'}, cost: ${usageCost.toFixed(4)}, last_min: ${currentLastMinCost.toFixed(4)}`
            );

            // --- Recalculate Global State & Emit ---
            this.recalculateAndEmitGlobalState();
        } catch (error) {
            console.error(
                `Error handling model usage for process ${processId}:`,
                error
            );
        }
    }

    /**
     * Recalculates the global state and emits it. Called after any change.
     */
    private recalculateAndEmitGlobalState(): void {
        try {
            const aggregatedGlobalUsage = this.calculateGlobalCostData();
            const elapsedMinutes = (Date.now() - this.costStartTime) / 60000;
            const costPerMinute =
                elapsedMinutes > 1 / 60000
                    ? aggregatedGlobalUsage.cost.total / elapsedMinutes
                    : 0;

            const emitPayload: GlobalCostData = {
                usage: aggregatedGlobalUsage,
                costPerMinute: costPerMinute,
                numProcesses: Object.keys(this.processCostData).length,
                systemStartTime: new Date(this.costStartTime).toISOString(),
            };

            this.processManager.io.emit('cost:info', emitPayload);
        } catch (error) {
            console.error(
                'Error recalculating and emitting global state:',
                error
            );
        }
    }

    /**
     * Retrieves the latest calculated global cost data.
     * @returns GlobalCostData object representing the aggregated state.
     */
    public getLatestGlobalCostData(): GlobalCostData {
        const aggregatedGlobalUsage = this.calculateGlobalCostData();
        const elapsedMinutes = (Date.now() - this.costStartTime) / 60000;
        const costPerMinute =
            elapsedMinutes > 1 / 60000
                ? aggregatedGlobalUsage.cost.total / elapsedMinutes
                : 0;

        return {
            usage: aggregatedGlobalUsage,
            costPerMinute: costPerMinute,
            numProcesses: Object.keys(this.processCostData).length,
            systemStartTime: new Date(this.costStartTime).toISOString(),
        };
    }

    /**
     * Removes cost data for a specific process, e.g., when it terminates.
     * Triggers recalculation and emission of the global state.
     * @param processId - The identifier of the process to remove.
     */
    public removeProcessData(processId: string): void {
        if (this.processCostData[processId]) {
            console.log(`Removing cost data for process: ${processId}`);
            delete this.processCostData[processId];
            this.recalculateAndEmitGlobalState();
        }
    }

    // Process any content field to fix references to /magi_output paths
    // Helper function to process strings with magi_output paths
    private processOutputPaths = (text: string): string => {
        // Replace "sandbox:/magi_output/" with "/magi_output/" (sandbox prefix)
        let processed = text.replace(
            /sandbox:\/magi_output\//g,
            '/magi_output/'
        );

        // Also handle other sandbox paths
        processed = processed.replace(/sandbox:(\/[^\s)"']+)/g, '$1');

        // Make sure URLs like /magi_output/... are correctly formatted as markdown links
        processed = processed.replace(
            /(\s|^)(\/magi_output\/[^\s)"']+\.(png|jpg|jpeg|gif|svg))(\s|$|[,.;])/gi,
            (match, pre, url, ext, post) => `${pre}[${url}](${url})${post}`
        );

        return processed;
    };

    /**
     * Register a handler for a specific event type
     *
     * @param eventType - The type of event to handle
     * @param handler - The function to call when an event of this type is received
     */
    public addEventHandler(eventType: string, handler: EventHandler): void {
        this.eventHandlers.set(eventType, handler);
        console.log(`Event handler registered for event type: ${eventType}`);
    }

    private async processContainerEvent(
        processId: string,
        event: StreamingEvent
    ): Promise<void> {
        // Check if we have a registered handler for this event type
        if (this.eventHandlers.has(event.type)) {
            try {
                const handler = this.eventHandlers.get(event.type)!;
                const response = await handler(event, processId);

                // If the handler returns a response, send it back to the source process
                if (response) {
                    this.sendMessage(
                        processId,
                        JSON.stringify({
                            type: `${event.type}_response`,
                            ...response,
                        })
                    );
                }
                return;
            } catch (error) {
                console.error(
                    `Error handling event ${event.type} from ${processId}:`,
                    error
                );
            }
        }

        if (event.type === 'command_start') {
            if (
                event.command &&
                typeof event.command === 'string' &&
                event.command.trim().toLowerCase() === 'stop' &&
                processId === this.processManager.coreProcessId
            ) {
                this.sendMessage(
                    this.processManager.coreProcessId,
                    JSON.stringify({
                        type: 'system_message',
                        message: 'Can not stop the core process.',
                    })
                );
            } else {
                this.sendCommand(
                    event.targetProcessId as string,
                    event.command as string,
                    {},
                    processId
                );
            }
        } else if (event.type === 'process_start') {
            await this.processManager.createAgentProcess(
                event.agentProcess as AgentProcess
            );
        } else if (
            event.type === 'project_create' &&
            processId === this.processManager.coreProcessId
        ) {
            try {
                this.sendMessage(
                    this.processManager.coreProcessId,
                    JSON.stringify({
                        type: 'project_ready',
                        project: createNewProject(event.project as string),
                    })
                );
            } catch (error) {
                // Notify failure
                this.sendMessage(
                    this.processManager.coreProcessId,
                    JSON.stringify({
                        type: 'system_message',
                        message: `Error creating "${event.project}" project: ${error}`,
                    })
                );
            }
        } else if (
            event.type === 'process_running' ||
            event.type === 'process_updated' ||
            event.type === 'process_done' ||
            event.type === 'process_waiting' ||
            (event.type === 'process_terminated' &&
                processId !== this.processManager.coreProcessId)
        ) {
            this.sendMessage(
                this.processManager.coreProcessId,
                JSON.stringify({
                    type: 'process_event',
                    processId,
                    event,
                })
            );
        } else if (
            event.type === 'tool_start' &&
            event.tool_calls &&
            Array.isArray(event.tool_calls)
        ) {
            for (const toolCall of event.tool_calls) {
                if (toolCall.function.name.startsWith('talk_to_')) {
                    const toolParams: Record<string, unknown> = JSON.parse(
                        toolCall.function.arguments
                    );
                    if (
                        toolParams.message &&
                        typeof toolParams.message === 'string' &&
                        typeof toolParams.affect === 'string'
                    ) {
                        // Call talk, but don't await it.
                        const talkPromise = talk(
                            toolParams.message,
                            toolParams.affect,
                            processId
                        );

                        talkPromise.catch(error => {
                            console.error('Error calling talk:', error);
                        });
                    }
                }

                // Handle Telegram specific tool calls
                if (toolCall.function.name === 'Telegram_send_message') {
                    const toolParams: Record<string, unknown> = JSON.parse(
                        toolCall.function.arguments
                    );
                    if (
                        toolParams.message &&
                        typeof toolParams.message === 'string'
                    ) {
                        // Affect parameter is optional, default to 'neutral'
                        const affect =
                            toolParams.affect &&
                            typeof toolParams.affect === 'string'
                                ? toolParams.affect
                                : 'neutral';

                        // Call talk, which will also send to Telegram
                        const talkPromise = talk(
                            toolParams.message as string,
                            affect,
                            processId
                        );

                        talkPromise.catch(error => {
                            console.error(
                                'Error calling Telegram send:',
                                error
                            );
                        });
                    }
                }
            }
        } else if (
            event.type === 'tool_done' &&
            event.results &&
            typeof event.results === 'object'
        ) {
            // Process each result to fix output paths in result strings
            const results = event.results as Record<string, any>;
            for (const resultId in results) {
                const result = results[resultId];

                // Fix paths in string results
                if (typeof result === 'string') {
                    results[resultId] = this.processOutputPaths(result);
                }

                // Fix paths in object results with output property
                else if (
                    typeof result === 'object' &&
                    result !== null &&
                    'output' in result &&
                    typeof result.output === 'string'
                ) {
                    result.output = this.processOutputPaths(result.output);
                }
            }
        } else if (event.type === 'cost_update' && 'usage' in event) {
            this.handleModelUsage(
                processId,
                event as unknown as CostUpdateEvent
            );
        } else if (
            event.type === 'system_status' &&
            'status' in event &&
            processId === this.processManager.coreProcessId
        ) {
            this.processManager.io.emit('system:status', event.status);
        }
    }

    /**
     * Process messages received from containers
     */
    public async processContainerMessage(
        processId: string,
        message: MagiMessage
    ): Promise<void> {
        try {
            // First, check if this is the new format with 'event' property
            if (message.event) {
                // Process content field
                if (
                    'content' in message.event &&
                    typeof message.event.content === 'string'
                ) {
                    message.event.content = this.processOutputPaths(
                        message.event.content
                    );
                }

                // Process tool results for image paths
                await this.processContainerEvent(processId, message.event);

                // Also log to Docker logs for debugging purposes only
                if (message.event.type === 'cost_update') {
                    return;
                }

                // Emit a dedicated event for structured messages directly to Socket.io clients
                this.processManager.io.emit('process:message', {
                    id: processId,
                    message: message,
                });

                // Also log to Docker logs for debugging purposes only
                if (
                    ![
                        'message_delta',
                        'message_complete',
                        'system_status',
                        'agent_start',
                        'process_updated',
                        'tool_done',
                        'tool_start',
                        'tool_delta',
                        'quota_update',
                    ].includes(message.event.type)
                ) {
                    console.log(`[${processId}] ${message.event.type}`);
                    console.dir(message, { depth: 4, colors: true });
                }

                return;
            }

            // If we get here, the message doesn't have either format
            console.error(
                `Message with invalid format from process ${processId}: ${JSON.stringify(message)}`
            );
        } catch (error) {
            console.error(`Error processing message from ${processId}:`, error);
        }
    }

    /**
     * Send a command to a specific container
     */
    sendCommand(
        processId: string,
        command: string,
        args?: any,
        sourceId?: string
    ): boolean {
        try {
            const commandMessage: CommandMessage = {
                type: 'command',
                command,
                args: {
                    ...args,
                    // Include the source process ID if provided
                    sourceProcessId: sourceId,
                },
            };

            return this.sendMessage(processId, JSON.stringify(commandMessage));
        } catch (err) {
            console.error(
                `Error sending command to process ${processId}:`,
                err
            );
            return false;
        }
    }

    /**
     * Send a system command (i.e. not a message)
     */
    sendSystemCommand(processId: string, command: string): boolean {
        try {
            const commandMessage: SystemCommandMessage = {
                type: 'system_command',
                command,
            };

            return this.sendMessage(processId, JSON.stringify(commandMessage));
        } catch (err) {
            console.error(
                `Error sending command to process ${processId}:`,
                err
            );
            return false;
        }
    }

    /**
     * Send a message to a specific container
     */
    sendMessage(processId: string, message: string): boolean {
        const connection = this.connections.get(processId);

        if (!connection) {
            console.error(`No active connection for process ${processId}`);
            return false;
        }

        try {
            connection.send(message);
            return true;
        } catch (err) {
            console.error(
                `Error sending message to process ${processId}:`,
                err
            );
            return false;
        }
    }

    /**
     * Broadcast a message to all Socket.io clients for a specific process
     */
    broadcastProcessMessage(processId: string, message: MagiMessage): void {
        try {
            // Send to Socket.io clients
            this.processManager.io.emit('process:message', {
                id: processId,
                message,
            });
        } catch (err) {
            console.error(
                `Error broadcasting message for process ${processId}:`,
                err
            );
        }
    }

    /**
     * Save message history for a process to disk
     */
    private saveMessageHistory(processId: string): void {
        const containerData = this.containerData.get(processId);

        if (!containerData) {
            return;
        }

        try {
            const filePath = path.join(
                this.storageDir,
                `${processId}_messages.json`
            );
            fs.writeFileSync(
                filePath,
                JSON.stringify(containerData.messageHistory, null, 2),
                'utf8'
            );
        } catch (err) {
            console.error(
                `Error saving message history for process ${processId}:`,
                err
            );
        }
    }

    /**
     * Load message history for a process from disk
     */
    private loadMessageHistory(processId: string): void {
        try {
            const filePath = path.join(
                this.storageDir,
                `${processId}_messages.json`
            );

            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf8');
                const messages = JSON.parse(data) as MagiMessage[];

                // Update container data
                const containerData = this.containerData.get(processId);
                if (containerData) {
                    containerData.messageHistory = messages;
                    console.log(
                        `Loaded ${messages.length} historical messages for process ${processId}`
                    );
                }
            }
        } catch (err) {
            console.error(
                `Error loading message history for process ${processId}:`,
                err
            );
        }
    }

    /**
     * Get message history for a process
     */
    getMessageHistory(processId: string): MagiMessage[] {
        const containerData = this.containerData.get(processId);

        if (!containerData) {
            return [];
        }

        return [...containerData.messageHistory];
    }

    /**
     * Get all active processes and their message history
     * Useful for client reconnections to restore state
     */
    getAllProcessesData(): {
        processes: Map<string, ContainerConnection>;
        costData: Record<string, ProcessState>;
        globalCostData: GlobalCostData;
    } {
        return {
            processes: new Map(this.containerData),
            costData: { ...this.processCostData },
            globalCostData: this.getLatestGlobalCostData(),
        };
    }

    /**
     * Check if a process has an active connection
     */
    hasActiveConnection(processId: string): boolean {
        return this.connections.has(processId);
    }

    /**
     * Stop a process by sending a stop command
     */
    stopProcess(processId: string): boolean {
        return this.sendCommand(processId, 'stop');
    }

    /**
     * Set the pause state for a process
     */
    setPauseState(processId: string, pauseState: boolean): boolean {
        return this.sendSystemCommand(
            processId,
            pauseState ? 'pause' : 'resume'
        );
    }

    /**
     * Close all connections
     */
    closeAllConnections(): void {
        for (const [processId, connection] of this.connections.entries()) {
            try {
                connection.close();
                console.log(
                    `Closed WebSocket connection for process ${processId}`
                );

                // Save message history
                this.saveMessageHistory(processId);
            } catch (err) {
                console.error(
                    `Error closing WebSocket connection for process ${processId}:`,
                    err
                );
            }
        }

        this.connections.clear();
    }
}
