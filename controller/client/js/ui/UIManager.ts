/**
 * UI Manager Module
 *
 * Handles UI state and animations
 */
import { ProcessUI } from './ProcessUI';
import { ProcessCreateEvent, ProcessLogsEvent, ProcessUpdateEvent } from '@types';

export class UIManager {
  private isFirstProcess = true;
  private processUI: ProcessUI;
  private mainHeader: HTMLElement;
  private centerInputContainer: HTMLElement;
  private commandInput: HTMLInputElement;
  private centerCommandInput: HTMLInputElement;
  private commandForm: HTMLFormElement;
  private centerCommandForm: HTMLFormElement;
  private runCommand: (command: string) => void;
  private currentServerVersion: string | null = null;

  constructor(
    processGrid: HTMLElement,
    processTemplate: HTMLTemplateElement,
    mainHeader: HTMLElement,
    centerInputContainer: HTMLElement,
    commandInput: HTMLInputElement,
    centerCommandInput: HTMLInputElement,
    commandForm: HTMLFormElement,
    centerCommandForm: HTMLFormElement,
    runCommand: (command: string) => void,
    onProcessCommand: (processId: string, command: string) => void,
    onProcessTerminate: (processId: string) => void
  ) {
    // Initialize ProcessUI
    this.processUI = new ProcessUI(
      processGrid,
      processTemplate
    );

    // Store DOM references
    this.mainHeader = mainHeader;
    this.centerInputContainer = centerInputContainer;
    this.commandInput = commandInput;
    this.centerCommandInput = centerCommandInput;
    this.commandForm = commandForm;
    this.centerCommandForm = centerCommandForm;

    // Store the run command function
    this.runCommand = runCommand;

    // Set up event listeners
    this.setupEventListeners(
      (command) => this.handleCommandSubmission(command),
      onProcessCommand,
      onProcessTerminate
    );
  }

  /**
   * Set up UI event listeners
   *
   * @param onCommand - Callback for command submission
   * @param onProcessCommand - Callback for process-specific commands
   * @param onProcessTerminate - Callback for process termination
   */
  private setupEventListeners(
    onCommand: (command: string) => void,
    onProcessCommand: (processId: string, command: string) => void,
    onProcessTerminate: (processId: string) => void
  ): void {
    // Handle header form submission
    this.commandForm.addEventListener('submit', (event: Event) => {
      event.preventDefault();

      const command = this.commandInput.value.trim();
      onCommand(command);
      this.commandInput.value = '';
    });

    // Handle center form submission
    this.centerCommandForm.addEventListener('submit', (event: Event) => {
      event.preventDefault();

      const command = this.centerCommandInput.value.trim();
      onCommand(command);
      this.centerCommandInput.value = '';
    });

    // Handle keydown for header input
    this.commandInput.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();

        const command = this.commandInput.value.trim();
        onCommand(command);
        this.commandInput.value = '';
      }
    });

    // Handle keydown for center input
    this.centerCommandInput.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();

        const command = this.centerCommandInput.value.trim();
        onCommand(command);
        this.centerCommandInput.value = '';
      }
    });
  }

  /**
   * Handle command submission from either form
   *
   * @param command - The command to submit
   * @returns true if the command should be processed, false otherwise
   */
  handleCommandSubmission(command: string): boolean {
    if (!command.trim()) return false;
    this.runCommand(command);

    // If this is the first process, animate the transition
    if (this.isFirstProcess) {
      this.isFirstProcess = false;
      this.animateInitialTransition();
    }

    // Always return true for non-empty commands
    return true;
  }

  /**
   * Function to transition from center input to header
   */
  animateInitialTransition(): void {
    // Add transition for smooth animation
    this.mainHeader.style.transition = 'all 0.5s cubic-bezier(0.25, 1, 0.5, 1)';

    // Show header
    this.mainHeader.style.opacity = '1';
    this.mainHeader.style.transform = 'translateY(0)';

    // Hide center input
    this.centerInputContainer.style.display = 'none';

    // Focus on the header input
    this.commandInput.focus();
  }

  /**
   * Handle server info event
   *
   * @param version - Server version
   */
  handleServerInfo(version: string): void {
    console.log(`Server info received: version=${version}`);

    // If we have a previous version and it's different from current version,
    // and this is a server restart, reload the page to get the latest code
    if (this.currentServerVersion && this.currentServerVersion !== version) {
      console.log('Server was restarted. Reloading page to get latest code...');
      window.location.reload();
      return;
    }

    // Update the stored server version
    this.currentServerVersion = version;
  }

  /**
   * Handle connection event
   */
  handleConnect(): void {
    // Wait a bit to make sure we've received any existing processes
    setTimeout(() => {
      const processCount = this.processUI.getProcessCount();
      if (processCount > 0) {
        // If there are existing processes, immediately set the correct UI state without animations
        this.isFirstProcess = false;

        // Directly set final state without transitions
        this.mainHeader.style.opacity = '1';
        this.mainHeader.style.transform = 'translateY(0)';

        // Ensure center input remains hidden
        this.centerInputContainer.style.display = 'none';
        this.centerInputContainer.style.opacity = '0';

        // Focus the header input
        this.commandInput.focus();
      } else {
        // Add transition for smooth animation when no processes exist
        this.mainHeader.style.transition = 'all 0.5s cubic-bezier(0.25, 1, 0.5, 1)';

        // Show and focus the center input if no processes
        this.centerInputContainer.style.display = 'block';
        this.centerInputContainer.style.opacity = '1';
        this.centerCommandInput.focus();
      }
    }, 100);
  }

  /**
   * Handle process creation event
   *
   * @param event - Process creation event data
   * @param onTerminate - Callback for process termination
   * @param onCommand - Callback for process command
   */
  handleProcessCreate(
    event: ProcessCreateEvent,
    onTerminate: (processId: string) => void,
    onCommand: (processId: string, command: string) => void
  ): void {
    this.processUI.createProcessBox(
      event.id,
      event.command,
      event.status,
      event.colors,
      onTerminate,
      onCommand
    );
  }

  /**
   * Handle process logs event
   *
   * @param event - Process logs event data
   */
  handleProcessLogs(event: ProcessLogsEvent): void {
    this.processUI.appendLogs(event.id, event.logs);
  }

  /**
   * Handle process update event
   *
   * @param event - Process update event data
   */
  handleProcessUpdate(event: ProcessUpdateEvent): void {
    this.processUI.updateProcessStatus(event.id, event.status);

    // Check if this was the last process and it was terminated
    if (event.status === 'terminated') {
      setTimeout(() => {
        if (this.processUI.getProcessCount() === 0) {
          // If no more processes, show the centered input again
          this.isFirstProcess = true;
          this.mainHeader.style.opacity = '0';
          this.mainHeader.style.transform = 'translateY(-100%)';
          this.centerInputContainer.style.display = 'block';
          this.centerInputContainer.style.opacity = '1';
          this.centerCommandInput.focus();
        }
      }, 1200); // Wait a bit longer than the fadeout animation
    }
  }
}
