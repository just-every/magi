/**
 * Client-side type definitions
 */

// DOM element references for processes
export interface ProcessElement {
  box: HTMLElement;      // Container element
  logs: HTMLElement;     // Log output container
  status: HTMLElement;   // Status indicator
  input?: HTMLInputElement; // Optional process-specific input field
}