/**
 * Communication module for MAGI client
 *
 * Handles WebSocket communication with the controller
 */
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import {StreamingEvent} from '../types.js';

// Event types
export interface MagiMessage {
  processId: string;
  event: StreamingEvent;
}

export interface CommandMessage {
  type: 'command';
  command: string;
  args?: any;
}

export class CommunicationManager {
  private ws: WebSocket | null = null;
  private processId: string;
  private connected = false;
  private messageQueue: MagiMessage[] = [];
  private messageHistory: MagiMessage[] = [];
  private historyFile: string;
  private reconnectInterval = 3000; // milliseconds
  private reconnectTimer: NodeJS.Timeout | null = null;
  private commandListeners: ((command: CommandMessage) => void)[] = [];
  private testMode: boolean;

  constructor(processId: string, testMode: boolean = false) {
    this.processId = processId;
    this.testMode = testMode;
    this.historyFile = path.join('/magi_output', `${processId}_messages.json`);

    if (this.testMode) {
      console.log('[Communication] Test mode: WebSocket disabled, will print to console');
    } else {
      this.loadHistoryFromFile();
    }
  }

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
    // Controller is reachable at host.docker.internal
    const url = `ws://host.docker.internal:3001/ws/magi/${this.processId}`;

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
          timestamp: new Date().toISOString()
        }
      });
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      try {
        const message = JSON.parse(data.toString()) as CommandMessage;
        console.log('Received command:', message);

        // Notify all command listeners
        this.commandListeners.forEach(listener => {
          try {
            listener(message);
          } catch (err: unknown) {
            console.error('Error in command listener:', err);
          }
        });
      } catch (err: unknown) {
        console.error('Error parsing message:', err);
      }
    });

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

    this.ws.on('error', (err) => {
      console.error('WebSocket error:', err);
      this.connected = false;
    });
  }

  /**
   * Register a listener for incoming commands
   */
  onCommand(listener: (command: CommandMessage) => void): void {
    this.commandListeners.push(listener);
  }

  /**
   * Send a message to the controller
   */
  sendMessage(message: MagiMessage): void {
    // Always add to history (except in test mode)
    if (!this.testMode) {
      this.messageHistory.push(message);
      this.saveHistoryToFile();
    }

    // In test mode, just output formatted message to console
    if (this.testMode) {
      return this.testModeMessage(message);
    }

    // Also log to console for Docker logs as fallback
    console.log(JSON.stringify(message));

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
    const timestamp = new Date().toISOString().substring(11, 19); // HH:MM:SS
    console.log(`[${timestamp}]`);
    console.dir(message, { depth: 4, colors: true });
  }

  /**
   * Send message to the controller
   */
  send(event: StreamingEvent): void {
    this.sendMessage({
      processId: this.processId,
      event
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
        console.log(`Loaded ${this.messageHistory.length} historical messages`);
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
      console.log('[Communication] Test mode - WebSocket connection closed (simulated)');
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
}

// Create a singleton instance for easy import
let communicationManager: CommunicationManager | null = null;

export function initCommunication(processId: string, testMode: boolean = false): CommunicationManager {
  if (!communicationManager) {
    communicationManager = new CommunicationManager(processId, testMode);
    communicationManager.connect();
  }
  return communicationManager;
}

export function getCommunicationManager(): CommunicationManager {
  if (!communicationManager) {
    throw new Error('Communication manager not initialized');
  }
  return communicationManager;
}
