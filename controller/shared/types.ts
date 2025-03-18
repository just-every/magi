/**
 * Shared type definitions for the MAGI System
 * Used by both client and server
 */

// Process status type
export type ProcessStatus = 'running' | 'completed' | 'failed' | 'terminated' | 'ending';

// Socket.io event interfaces

// Event sent when a new process is created
export interface ProcessCreateEvent {
  id: string;           // Process ID
  command: string;      // Command that created the process
  status: ProcessStatus;       // Initial status (usually 'running')
  colors: {
    bgColor: string;     // Background color (rgba)
    textColor: string;   // Text color (rgba)
  };
}

// Event sent when new logs are available for a process
export interface ProcessLogsEvent {
  id: string;           // Process ID
  logs: string;         // Log content (may include markdown)
}

// Event sent when a process status changes
export interface ProcessUpdateEvent {
  id: string;           // Process ID
  status: ProcessStatus;       // New status
}

// Event for sending a command to a specific process
export interface ProcessCommandEvent {
  processId: string;    // Target process ID
  command: string;      // Command to send
}

// Event for server information sent to clients
export interface ServerInfoEvent {
  version: string;      // Server version
}

// Client-side DOM element references for processes
export interface ProcessElement {
  box: HTMLElement;      // Container element
  logs: HTMLElement;     // Log output container
  status: HTMLElement;   // Status indicator
  input?: HTMLInputElement; // Optional process-specific input field
}