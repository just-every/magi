// Common types shared between client and server

// Process status values
export type ProcessStatus = 
  | 'launching'  // Process is being launched
  | 'running'    // Process is running
  | 'completed'  // Process has completed successfully
  | 'failed'     // Process has failed with an error
  | 'ending'     // Process is in the process of being terminated
  | 'terminated' // Process has been terminated

// Event types for socket communication
export interface ProcessCreateEvent {
  id: string
  command: string
  status: ProcessStatus
  colors: {
    bgColor: string
    textColor: string
  }
}

export interface ProcessLogsEvent {
  id: string
  logs: string
}

export interface ProcessUpdateEvent {
  id: string
  status: ProcessStatus
}

// Client types
export interface ProcessElement {
  box: HTMLElement
  logs: HTMLElement
  status: HTMLElement
  input: HTMLInputElement
}