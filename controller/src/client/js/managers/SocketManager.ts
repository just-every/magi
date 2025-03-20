/**
 * Socket Manager Module
 * 
 * Handles WebSocket communication with the server
 */
import { 
  ProcessCreateEvent, 
  ProcessLogsEvent, 
  ProcessUpdateEvent,
  ProcessCommandEvent
} from '@types';

export interface SocketEventHandlers {
  onServerInfo: (version: string) => void;
  onProcessCreate: (event: ProcessCreateEvent) => void;
  onProcessLogs: (event: ProcessLogsEvent) => void;
  onProcessUpdate: (event: ProcessUpdateEvent) => void;
  onConnect: () => void;
}

export class SocketManager {
  private socket: any; // Socket.io client socket
  private handlers: SocketEventHandlers;

  constructor(handlers: SocketEventHandlers) {
    this.handlers = handlers;
    
    // Initialize socket
    this.socket = io();

    this.setupSocketListeners();
  }

  /**
   * Set up socket event listeners
   */
  private setupSocketListeners(): void {
    // Server info event
    this.socket.on('server:info', (data: {version: string}) => {
      this.handlers.onServerInfo(data.version);
    });

    // Process events
    this.socket.on('process:create', (process: ProcessCreateEvent) => {
      this.handlers.onProcessCreate(process);
    });

    this.socket.on('process:logs', (data: ProcessLogsEvent) => {
      this.handlers.onProcessLogs(data);
    });

    this.socket.on('process:update', (data: ProcessUpdateEvent) => {
      this.handlers.onProcessUpdate(data);
    });

    // Connection events
    this.socket.on('connect', () => {
      this.handlers.onConnect();
    });
  }

  /**
   * Send a command to the server
   * 
   * @param command - Command to run
   */
  runCommand(command: string): void {
    if (command.trim()) {
      this.socket.emit('command:run', command);
    }
  }

  /**
   * Send a command to a specific process
   * 
   * @param processId - Process ID to send command to
   * @param command - Command to send
   */
  sendProcessCommand(processId: string, command: string): void {
    if (command.trim()) {
      this.socket.emit('process:command', {
        processId,
        command
      } as ProcessCommandEvent);
    }
  }

  /**
   * Terminate a process
   * 
   * @param processId - Process ID to terminate
   */
  terminateProcess(processId: string): void {
    this.socket.emit('process:terminate', processId);
  }
}