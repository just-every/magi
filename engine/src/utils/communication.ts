/**
 * Communication module for MAGI client
 *
 * Handles WebSocket communication with the controller
 *
 * Provides functions for:
 * - Initializing WebSocket connection
 * - Sending and receiving messages
 * - Streaming events to clients
 */
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import {
    StreamingEvent,
    MagiMessage,
    ServerMessage,
    CommandMessage,
    ProcessEventMessage,
    ProjectMessage,
    SystemMessage,
    SystemCommandMessage,
} from '../types/shared-types.js';
import { v4 as uuidv4 } from 'uuid';
import { get_output_dir } from './file_utils.js';
import { processTracker } from './process_tracker.js';
import { addSystemMessage } from './history.js';

import { truncateLargeValues } from './file_utils.js';
import { pause, resume, getPauseController } from '@just-every/ensemble';
import { sendToAllPtyProcesses } from './run_pty.js';

let lastEventLogged = '';

// Set up pause controller event handlers for code providers
const pauseController = getPauseController();

// Send escape sequences to pause/resume code providers
pauseController.on('paused', () => {
    // Send double escape twice for better reliability
    sendToAllPtyProcesses('\x1b\x1b');
    // Small delay then send again
    setTimeout(() => {
        sendToAllPtyProcesses('\x1b\x1b');
        console.log(
            '[Communication] Sent pause signal (2x) to all code providers'
        );
    }, 100);
});

pauseController.on('resumed', () => {
    // Send "Please continue" with different variations to ensure compatibility
    // Try multiple variations as different terminals/shells may respond differently
    sendToAllPtyProcesses('Please continue\r\n');
    setTimeout(() => {
        sendToAllPtyProcesses('\r');
    }, 50);
    setTimeout(() => {
        sendToAllPtyProcesses('\n');
    }, 100);
    setTimeout(() => {
        sendToAllPtyProcesses('\x1b\r');
    }, 150);
    setTimeout(() => {
        sendToAllPtyProcesses('\x1b\n');
    }, 200);
    setTimeout(() => {
        sendToAllPtyProcesses('\x1b\n\r');
    }, 250);
    console.log(
        '[Communication] Sent resume signal with multiple newline variations to all code providers'
    );
});

export class CommunicationManager {
    private ws: WebSocket | null = null;
    private processId: string;
    private connected = false;
    private messageQueue: MagiMessage[] = [];
    private messageHistory: MagiMessage[] = [];
    private historyFile: string;
    private reconnectInterval = 3000; // milliseconds
    private reconnectTimer: NodeJS.Timeout | null = null;
    private commandListeners: ((command: ServerMessage) => Promise<void>)[] =
        [];
    private testMode: boolean;

    constructor(processId: string, testMode: boolean = false) {
        this.processId = processId;
        this.testMode = testMode;
        this.historyFile = path.join(
            get_output_dir('communication'),
            'messages.json'
        );

        if (this.testMode) {
            console.log(
                '[Communication] Test mode: WebSocket disabled, will print to console'
            );
        } else {
            this.loadHistoryFromFile();
        }
    }

    // Store the current controller port for reconnection logic
    private controllerPort = process.env.CONTROLLER_PORT;

    /**
     * Connect to the controller WebSocket server
     */
    connect(): void {
        // In test mode, we don't actually connect via WebSocket
        if (this.testMode) {
            this.connected = true;
            return;
        }

        // Using Docker container service discovery
        // Get HOST_HOSTNAME from environment variable, fallback to host.docker.internal
        const hostName = process.env.HOST_HOSTNAME || 'host.docker.internal';
        // Use stored controllerPort (which may be updated during reconnection)
        const url = `ws://${hostName}:${this.controllerPort}/ws/engine/${this.processId}`;

        if (this.ws) {
            this.ws.terminate();
        }

        console.log(`Connecting to controller at ${url}`);
        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
            console.log('Connected to controller');
            this.connected = true;
            this.sendQueuedMessages();

            // Send initial connection message
            this.sendMessage({
                processId: this.processId,
                event: {
                    type: 'connected',
                    timestamp: new Date().toISOString(),
                },
            });
        });

        this.ws.on(
            'message',
            async (data: WebSocket.RawData): Promise<void> => {
                try {
                    const message = JSON.parse(
                        data.toString()
                    ) as ServerMessage;
                    console.log('Received command:', message);

                    // Check if this is a welcome message with port information
                    if (message.type === 'connect') {
                        const commandMessage = message as CommandMessage;
                        if (commandMessage.args) {
                            // Handle controller port
                            if (commandMessage.args.controllerPort) {
                                const newPortRaw =
                                    commandMessage.args.controllerPort;

                                // Check if newPortRaw is a string or number before assigning
                                if (
                                    typeof newPortRaw === 'string' ||
                                    typeof newPortRaw === 'number'
                                ) {
                                    const newPort = String(newPortRaw); // Convert number to string if necessary

                                    // If port has changed, update our stored port for future reconnections
                                    if (newPort !== this.controllerPort) {
                                        console.log(
                                            `Controller port changed from ${this.controllerPort} to ${newPort}`
                                        );
                                        this.controllerPort = newPort;
                                    }
                                } else if (newPortRaw !== undefined) {
                                    console.warn(
                                        `Received non-string/number controllerPort: ${typeof newPortRaw}`
                                    );
                                }
                            }
                            
                            // Handle core process ID
                            if (commandMessage.args.coreProcessId) {
                                const coreProcessId = commandMessage.args.coreProcessId;
                                console.log(`[Communication] Received core process ID: ${coreProcessId}`);
                                processTracker.setCoreProcessId(coreProcessId);
                            }
                        }
                        return;
                    } else if (message.type === 'process_event') {
                        const eventMessage = message as ProcessEventMessage;
                        await processTracker.handleEvent(eventMessage);
                        return;
                    } else if (message.type === 'project_update') {
                        const projectMessage = message as ProjectMessage;
                        if (projectMessage.failed) {
                            console.log(
                                `Project ${projectMessage.project_id} failed: ${projectMessage.message}`
                            );
                            await addSystemMessage(
                                `Creating project ${projectMessage.project_id} failed: ${projectMessage.message}`,
                                'project failed'
                            );
                            return;
                        }
                        await addSystemMessage(
                            `Project ${projectMessage.project_id} created: ${projectMessage.message}`,
                            'project created'
                        );
                        return;
                    } else if (message.type === 'system_message') {
                        const systemMessage = message as SystemMessage;
                        await addSystemMessage(systemMessage.message);
                        return;
                    } else if (message.type === 'system_command') {
                        const commandMessage = message as SystemCommandMessage;
                        if (commandMessage.command === 'pause') {
                            pause();
                            console.log(
                                'System PAUSED - LLM requests will wait until resumed'
                            );
                            await addSystemMessage(
                                'System paused - LLM requests will wait until resumed'
                            );
                        } else if (commandMessage.command === 'resume') {
                            resume();
                            console.log(
                                'System RESUMED - LLM requests will proceed normally'
                            );
                            await addSystemMessage(
                                'System resumed - LLM requests will proceed normally',
                                'system resumed'
                            );
                        }
                        return;
                    }

                    // Notify all command listeners SEQUENTIALLY
                    for (const listener of this.commandListeners) {
                        // Use for...of
                        try {
                            // Await the listener execution. This catches BOTH sync and async errors
                            // from the listener promise.
                            await listener(message);
                        } catch (err: unknown) {
                            console.error('Error in command listener:', err);
                            // Decide if one listener failing should stop processing others
                        }
                    }
                } catch (err: unknown) {
                    console.error('Error parsing message:', err);
                }
            }
        );

        this.ws.on('close', () => {
            console.log('Disconnected from controller, scheduling reconnect');
            this.connected = false;

            // Schedule reconnect
            if (!this.reconnectTimer) {
                this.reconnectTimer = setTimeout(() => {
                    this.reconnectTimer = null;
                    this.connect();
                }, this.reconnectInterval);
            }
        });

        this.ws.on('error', err => {
            console.error('WebSocket error:', err);
            this.connected = false;
        });
    }

    /**
     * Register a listener for incoming commands
     */
    onCommand(listener: (command: ServerMessage) => Promise<void>): void {
        this.commandListeners.push(listener);
    }

    /**
     * Send a message to the controller
     */
    sendMessage(message: MagiMessage): void {
        // Always add to history (except in test mode and delta)
        if (
            !this.testMode &&
            message.event.type !== 'message_delta' &&
            message.event.type !== 'tool_delta' &&
            message.event.type !== 'console'
        ) {
            this.messageHistory.push(message);
            this.saveHistoryToFile();
        }

        // In test mode, just output formatted message to console
        if (this.testMode) {
            return this.testModeMessage(message);
        }

        if (
            message.event.type !== 'message_delta' &&
            message.event.type !== 'tool_delta' &&
            message.event.type !== 'console'
        ) {
            // Log to console for Docker logs for debugging purposes only
            // but ensure it's clearly marked as a JSON message so we don't try to parse it
            // from the Docker logs in the controller
            console.log(
                `[JSON_MESSAGE] ${JSON.stringify(truncateLargeValues(message))}`
            );
        }

        if (this.connected && this.ws) {
            try {
                this.ws.send(JSON.stringify(message));
            } catch (err) {
                console.error('Error sending message:', err);
                this.messageQueue.push(message);
            }
        } else {
            // Queue for later if not connected
            this.messageQueue.push(message);
        }
    }

    /**
     * Format a message for console output in test mode
     */
    private testModeMessage(message: MagiMessage): void {
        if (message.event.type === 'tool_delta') {
            // Not sure how to display this one cleanly?
            return;
        }
        if (message.event.type === 'message_delta') {
            // Don't log deltas in test mode, just output the content to screen
            if (message.event.thinking_content) {
                if (lastEventLogged !== 'message_thinking_delta') {
                    process.stdout.write('\n');
                    lastEventLogged = 'message_thinking_delta';
                }
                process.stdout.write(message.event.thinking_content);
            }
            if (message.event.content) {
                if (lastEventLogged !== 'message_delta') {
                    process.stdout.write('\n');
                    lastEventLogged = 'message_delta';
                }
                process.stdout.write(message.event.content);
            }
            return;
        }
        lastEventLogged = message.event?.type;

        const timestamp = new Date().toISOString().substring(11, 19); // HH:MM:SS
        console.log(`[${timestamp}]`);
        console.dir(message, { depth: 4, colors: true });
    }

    /**
     * Send message to the controller
     */
    send(event: StreamingEvent): void {
        // Track message_id for delta/complete message pairs
        if (
            event.type === 'message_start' ||
            event.type === 'message_delta' ||
            event.type === 'message_complete'
        ) {
            // Cast to MessageEvent to access specific properties
            const messageEvent = event as any; // TypeScript limitation workaround

            // Generate a message_id for message_start events if not present
            if (event.type === 'message_start' && !messageEvent.message_id) {
                messageEvent.message_id = uuidv4();
            }

            // Use the original message_id for delta/complete messages
            // The message_id should have been created from the message_start event
            if (!messageEvent.message_id) {
                console.warn(
                    'Message event missing message_id, generating a new one'
                );
                messageEvent.message_id = uuidv4();
            }
        }

        this.sendMessage({
            processId: this.processId,
            event,
        });
    }

    /**
     * Send any queued messages after reconnection
     */
    private sendQueuedMessages(): void {
        if (!this.connected || !this.ws) return;

        const queueCopy = [...this.messageQueue];
        this.messageQueue = [];

        for (const message of queueCopy) {
            try {
                this.ws.send(JSON.stringify(message));
            } catch (err) {
                console.error('Error sending queued message:', err);
                this.messageQueue.push(message);
            }
        }
    }

    /**
     * Load message history from file if it exists
     */
    private loadHistoryFromFile(): void {
        try {
            if (fs.existsSync(this.historyFile)) {
                const data = fs.readFileSync(this.historyFile, 'utf8');
                this.messageHistory = JSON.parse(data);
                console.log(
                    `Loaded ${this.messageHistory.length} historical messages`
                );
            }
        } catch (err) {
            console.error('Error loading message history:', err);
        }
    }

    /**
     * Save message history to file
     */
    private saveHistoryToFile(): void {
        try {
            fs.writeFileSync(
                this.historyFile,
                JSON.stringify(this.messageHistory, null, 2),
                'utf8'
            );
        } catch (err) {
            console.error('Error saving message history:', err);
        }
    }

    /**
     * Get the message history
     */
    getMessageHistory(): MagiMessage[] {
        return [...this.messageHistory];
    }

    /**
     * Close the connection
     */
    close(): void {
        if (this.testMode) {
            console.log(
                '[Communication] Test mode - WebSocket connection closed (simulated)'
            );
            this.connected = false;
            return;
        }

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.ws) {
            this.ws.terminate();
            this.ws = null;
        }

        this.connected = false;
    }

    isClosed(): boolean {
        return !this.connected || !this.ws;
    }
}

// Create a singleton instance for easy import
let communicationManager: CommunicationManager | null = null;

export function initCommunication(
    testMode: boolean = false
): CommunicationManager {
    if (!communicationManager) {
        communicationManager = new CommunicationManager(
            process.env.PROCESS_ID,
            testMode
        );
        communicationManager.connect();
    }
    return communicationManager;
}

/**
 * Send a streaming event to the controller
 */
export function sendStreamEvent(event: StreamingEvent): void {
    const message: MagiMessage = {
        processId: process.env.PROCESS_ID || `magi-${Date.now()}`,
        event: event,
    };

    if (communicationManager) {
        communicationManager.sendMessage(message);
    } else {
        console.error(
            'Cannot send stream event: Communication manager not initialized'
        );
    }
}

export function getCommunicationManager(): CommunicationManager {
    if (!communicationManager) {
        throw new Error('Communication manager not initialized');
    }
    return communicationManager;
}

export function setTestCommunicationManager(
    testCommunicationManager: CommunicationManager
): CommunicationManager {
    communicationManager = testCommunicationManager;
    return communicationManager;
}

export function hasCommunicationManager(): boolean {
    return !!communicationManager;
}

export function sendComms(event: StreamingEvent): void {
    if (communicationManager) {
        communicationManager.send(event);
    } else {
        console.error(
            'Cannot set comm event: Communication manager not initialized'
        );
    }
}
