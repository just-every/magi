/**
 * Communication Manager Module
 * 
 * Handles WebSocket communication with MAGI containers
 */

import { Server as WebSocketServer } from 'ws';
import { Server as HttpServer } from 'http';
import { ProcessManager } from './process_manager';
import fs from 'fs';
import path from 'path';

// Event types that match those in the magi client
export interface MagiMessage {
  type: string;
  processId: string;
  data: any;
}

export interface ProgressMessage extends MagiMessage {
  type: 'progress';
  data: {
    step: string;
    status: 'running' | 'completed' | 'failed';
    message: string;
    progress?: number;
  };
}

export interface ResultMessage extends MagiMessage {
  type: 'result';
  data: any;
}

export interface CommandMessage {
  type: 'command';
  command: string;
  args?: any;
}

export interface ContainerConnection {
  processId: string;
  lastMessage: Date;
  messageHistory: MagiMessage[];
}

export class CommunicationManager {
  private wss: WebSocketServer;
  private processManager: ProcessManager;
  private connections: Map<string, WebSocket> = new Map();
  private containerData: Map<string, ContainerConnection> = new Map();
  private storageDir: string;
  
  constructor(server: HttpServer, processManager: ProcessManager) {
    this.processManager = processManager;
    this.storageDir = path.resolve('./magi_messages');
    
    // Ensure storage directory exists
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    
    // Initialize WebSocket server
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws/magi',
    });
    
    this.setupWebSocketServer();
    console.log('WebSocket server initialized for container communication');
  }
  
  /**
   * Set up WebSocket server event handlers
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws, req) => {
      try {
        // Extract process ID from URL path
        // Expected format: /ws/magi/:processId
        const urlPath = req.url || '';
        const pathParts = urlPath.split('/');
        const processId = pathParts[pathParts.length - 1];
        
        if (!processId || processId === 'magi') {
          console.error('Invalid WebSocket connection attempt - missing process ID');
          ws.close(1008, 'Invalid connection - missing process ID');
          return;
        }
        
        console.log(`WebSocket connection established for process ${processId}`);
        
        // Store connection
        this.connections.set(processId, ws);
        
        // Initialize container data if not exists
        if (!this.containerData.has(processId)) {
          const containerConnection: ContainerConnection = {
            processId,
            lastMessage: new Date(),
            messageHistory: []
          };
          
          this.containerData.set(processId, containerConnection);
          
          // Load history from disk if available
          this.loadMessageHistory(processId);
        }
        
        // Handle incoming messages
        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString()) as MagiMessage;
            
            if (!message.processId || message.processId !== processId) {
              console.error(`Message process ID mismatch: ${message.processId} vs ${processId}`);
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
            this.processContainerMessage(processId, message);
          } catch (err) {
            console.error('Error processing WebSocket message:', err);
          }
        });
        
        // Handle disconnections
        ws.on('close', () => {
          console.log(`WebSocket connection closed for process ${processId}`);
          this.connections.delete(processId);
          
          // Save message history on disconnect
          this.saveMessageHistory(processId);
        });
        
        // Handle errors
        ws.on('error', (err) => {
          console.error(`WebSocket error for process ${processId}:`, err);
          this.connections.delete(processId);
        });
        
        // Send a welcome message to confirm connection
        const welcomeMessage: CommandMessage = {
          type: 'command',
          command: 'welcome',
          args: { timestamp: new Date().toISOString() }
        };
        
        ws.send(JSON.stringify(welcomeMessage));
      } catch (err) {
        console.error('Error handling WebSocket connection:', err);
        ws.close(1011, 'Internal server error');
      }
    });
  }
  
  /**
   * Process messages received from containers
   */
  private processContainerMessage(processId: string, message: MagiMessage): void {
    // Process different message types
    switch (message.type) {
      case 'connection':
        console.log(`Container ${processId} connected`);
        break;
        
      case 'progress': {
        const progressMsg = message as ProgressMessage;
        // Send progress to process manager to update logs
        this.processManager.updateProcess(
          processId, 
          `[${progressMsg.data.step}] ${progressMsg.data.message}`
        );
        break;
      }
        
      case 'result': {
        const resultMsg = message as ResultMessage;
        // Handle final result
        console.log(`Received final result from process ${processId}`);
        // No need to store the full result again, as it was already streamed
        // Just update the process status if needed
        if (resultMsg.data) {
          this.processManager.updateProcess(
            processId,
            '[RESULT] Command execution completed'
          );
        }
        break;
      }
        
      default:
        console.log(`Received unknown message type ${message.type} from process ${processId}`);
    }
  }
  
  /**
   * Send a command to a specific container
   */
  async sendCommand(processId: string, command: string, args?: any): Promise<boolean> {
    const connection = this.connections.get(processId);
    
    if (!connection) {
      console.error(`No active connection for process ${processId}`);
      return false;
    }
    
    try {
      const commandMessage: CommandMessage = {
        type: 'command',
        command,
        args
      };
      
      connection.send(JSON.stringify(commandMessage));
      return true;
    } catch (err) {
      console.error(`Error sending command to process ${processId}:`, err);
      return false;
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
      const filePath = path.join(this.storageDir, `${processId}_messages.json`);
      fs.writeFileSync(
        filePath,
        JSON.stringify(containerData.messageHistory, null, 2),
        'utf8'
      );
    } catch (err) {
      console.error(`Error saving message history for process ${processId}:`, err);
    }
  }
  
  /**
   * Load message history for a process from disk
   */
  private loadMessageHistory(processId: string): void {
    try {
      const filePath = path.join(this.storageDir, `${processId}_messages.json`);
      
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        const messages = JSON.parse(data) as MagiMessage[];
        
        // Update container data
        const containerData = this.containerData.get(processId);
        if (containerData) {
          containerData.messageHistory = messages;
          console.log(`Loaded ${messages.length} historical messages for process ${processId}`);
        }
      }
    } catch (err) {
      console.error(`Error loading message history for process ${processId}:`, err);
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
   * Check if a process has an active connection
   */
  hasActiveConnection(processId: string): boolean {
    return this.connections.has(processId);
  }
  
  /**
   * Stop a process by sending a stop command
   */
  async stopProcess(processId: string): Promise<boolean> {
    return this.sendCommand(processId, 'stop');
  }
  
  /**
   * Close all connections
   */
  closeAllConnections(): void {
    for (const [processId, connection] of this.connections.entries()) {
      try {
        connection.terminate();
        console.log(`Closed WebSocket connection for process ${processId}`);
        
        // Save message history
        this.saveMessageHistory(processId);
      } catch (err) {
        console.error(`Error closing WebSocket connection for process ${processId}:`, err);
      }
    }
    
    this.connections.clear();
  }
}