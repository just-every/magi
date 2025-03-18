/**
 * ProcessUI module
 * 
 * Handles the UI representation of a MAGI process
 */
import { ProcessElement, ProcessStatus } from 'shared/types';

export class ProcessUI {
  private processElements: Map<string, ProcessElement> = new Map();
  private processGrid: HTMLElement;
  private processTemplate: HTMLTemplateElement;

  constructor(
    processGrid: HTMLElement,
    processTemplate: HTMLTemplateElement
  ) {
    this.processGrid = processGrid;
    this.processTemplate = processTemplate;
    
    // Call once on load and then on window resize
    this.updateGridLayout();
    window.addEventListener('resize', () => this.updateGridLayout());
  }

  /**
   * Get all process elements
   */
  getProcessElements(): Map<string, ProcessElement> {
    return this.processElements;
  }

  /**
   * Get the number of processes
   */
  getProcessCount(): number {
    return this.processElements.size;
  }

  /**
   * Create a new process box in the UI
   * 
   * @param id - Process ID
   * @param command - Process command
   * @param status - Initial process status
   * @param colors - Process colors
   * @param onTerminate - Callback when terminate button is clicked
   * @param onCommand - Callback when a command is submitted
   */
  createProcessBox(
    id: string,
    command: string,
    status: ProcessStatus,
    colors: { bgColor: string, textColor: string },
    onTerminate: (processId: string) => void,
    onCommand: (processId: string, command: string) => void
  ): void {
    // Clone the template
    const clone = document.importNode(this.processTemplate.content, true);

    // Get elements
    const processBox = clone.querySelector('.process-box') as HTMLElement;
    const processId = clone.querySelector('.process-id') as HTMLElement;
    const processStatus = clone.querySelector('.process-status') as HTMLElement;
    const processTerminate = clone.querySelector('.process-terminate') as HTMLButtonElement;
    const processHeader = clone.querySelector('.card-header') as HTMLElement;

    // Use the colors provided by the server
    processHeader.style.backgroundColor = colors.bgColor;
    processHeader.dataset.themeColor = colors.textColor;
    processId.style.color = colors.textColor;
    processStatus.style.color = colors.textColor;

    // Set process information
    processBox.id = `process-${id}`;
    processId.textContent = id; // Show the actual AI-xxxx ID

    // Add the process box to the grid - will be moved to a container later in updateGridLayout
    this.processGrid.appendChild(clone);

    // Get process input elements
    const processInputContainer = processBox.querySelector('.process-input-container') as HTMLElement;
    const processInputForm = processBox.querySelector('.process-input-form') as HTMLFormElement;
    const processInput = processBox.querySelector('.process-input') as HTMLInputElement;

    // Store the process elements for later reference
    this.processElements.set(id, {
      box: processBox,
      logs: processBox.querySelector('.process-logs') as HTMLElement,
      status: processStatus,
      input: processInput
    });

    // Update process status
    this.updateProcessStatus(id, status);

    // Handle focus/click on process box
    processBox.addEventListener('click', (event) => {
      // Add focused class
      document.querySelectorAll('.process-box').forEach(box => {
        box.classList.remove('focused');
      });
      processBox.classList.add('focused');

      // Only focus the input if clicking on the input container or input itself
      const clickedElement = event.target as HTMLElement;
      const isClickingInput = clickedElement.classList.contains('process-input') ||
                            clickedElement.closest('.process-input-container') !== null;

      if (isClickingInput && processInput) {
        setTimeout(() => processInput.focus(), 0);
      }
    });

    // Auto-resize input based on content
    processInput.addEventListener('input', function() {
      // Reset height to get the right scrollHeight
      this.style.height = 'auto';

      // Set new height based on scrollHeight
      const newHeight = Math.min(Math.max(this.scrollHeight, 40), 120); // Between 40px and 120px
      this.style.height = newHeight + 'px';
    });

    // Handle keydown events for shift+enter
    processInput.addEventListener('keydown', (event: KeyboardEvent) => {
      // Allow shift+enter for newlines
      if (event.key === 'Enter' && event.shiftKey) {
        // Don't submit the form
        event.preventDefault();

        // Insert a newline at cursor position
        const pos = processInput.selectionStart || 0;
        const value = processInput.value;
        processInput.value = value.substring(0, pos) + '\n' + value.substring(pos);

        // Set cursor position after the newline
        processInput.selectionStart = processInput.selectionEnd = pos + 1;

        // Trigger input event to resize
        processInput.dispatchEvent(new Event('input'));

        return false;
      }

      // Enter without shift submits
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        processInputForm.dispatchEvent(new Event('submit'));
        return false;
      }
    });

    // Handle command submission from process input
    processInputForm.addEventListener('submit', (event: Event) => {
      event.preventDefault();

      const commandText = processInput.value.trim();
      if (commandText) {
        // Pass command to callback
        onCommand(id, commandText);

        // Clear input and reset height
        processInput.value = '';
        processInput.style.height = 'auto';
      }
    });

    // Handle terminate button
    processTerminate.addEventListener('click', () => {
      // Prevent multiple clicks
      if (processTerminate.disabled) return;
      processTerminate.disabled = true;

      // Change the status to "ENDING..." immediately for better UX
      const processEl = this.processElements.get(id);
      if (processEl) {
        // Hide the terminate button
        processTerminate.style.display = 'none';

        // Show ending status
        processEl.status.textContent = 'terminating...';
        processEl.status.classList.remove(
          'status-running', 'status-completed', 'status-failed', 'status-terminated', 'status-ending'
        );
        processEl.status.classList.add('status-ending', 'text-danger');

        // Add a failsafe - if the server doesn't respond in 10 seconds, force the UI to show ENDED
        const failsafeTimer = setTimeout(() => {
          // If still showing ENDING...
          if (processEl.status.textContent === 'terminating...') {
            // Force update to ENDED status and apply fadeout
            this.updateProcessStatus(id, 'terminated');
          }
        }, 10000);

        // Store the timer ID in a data attribute for cleanup if needed
        processEl.box.dataset.failsafeTimer = String(failsafeTimer);
      }

      // Call terminate callback
      onTerminate(id);
    });

    // Update the grid layout
    this.updateGridLayout();

    // Setup the new process display
    processBox.style.opacity = '1';
    processBox.style.flex = '1';
  }

  /**
   * Append logs to a process
   * 
   * @param processId - Process ID
   * @param logData - Log data (markdown formatted)
   */
  appendLogs(processId: string, logData: string): void {
    const processEl = this.processElements.get(processId);
    if (processEl) {
      // Ensure that newlines are preserved before markdown parsing
      // Add line breaks for each newline character
      const formattedLogData = logData.replace(/\n/g, '\n\n');

      // Parse markdown
      const html = marked.parse(formattedLogData);

      // Create a temporary container
      const temp = document.createElement('div');
      temp.innerHTML = html;

      // Append each child one by one (to preserve event handlers)
      while (temp.firstChild) {
        processEl.logs.appendChild(temp.firstChild);
      }

      // Scroll to the bottom of the logs
      processEl.logs.scrollTop = processEl.logs.scrollHeight;
    }
  }

  /**
   * Update process status
   * 
   * @param processId - Process ID
   * @param status - New status
   */
  updateProcessStatus(processId: string, status: ProcessStatus): void {
    const processEl = this.processElements.get(processId);
    if (processEl) {
      // Remove all status classes
      processEl.status.classList.remove(
        'status-running', 'status-completed', 'status-failed', 'status-terminated', 'status-ending',
        'bg-secondary', 'bg-success', 'bg-danger', 'bg-warning', 'bg-light',
        'btn-light', 'btn-success', 'btn-danger', 'btn-warning'
      );

      // Add the appropriate status class
      processEl.status.classList.add(`status-${status}`);

      // Get the themed color from the header
      const header = processEl.box.querySelector('.card-header') as HTMLElement;
      const themeColor = header.dataset.themeColor;

      // Update status with appropriate styling
      if (status === 'running') {
        processEl.status.style.color = themeColor || 'rgba(96, 30, 120, 0.9)';
        processEl.status.classList.add('bg-light');
      } else if (status === 'completed') {
        processEl.status.style.color = '';
        processEl.status.classList.add('bg-success');
      } else if (status === 'failed') {
        processEl.status.style.color = '';
        processEl.status.classList.add('bg-warning');
      } else if (status === 'ending' || status === 'terminated') {
        processEl.status.style.color = '';
        processEl.status.classList.add('bg-danger');
      }
      
      // Custom label text for certain statuses
      processEl.status.textContent = status;

      // Handle terminated status specially - add fadeout and removal
      if (status === 'terminated') {
        // Make sure the terminate button is hidden
        const terminateButton = processEl.box.querySelector('.process-terminate') as HTMLButtonElement;
        if (terminateButton) {
          terminateButton.style.display = 'none';
        }

        // Clear any failsafe timers
        if (processEl.box.dataset.failsafeTimer) {
          clearTimeout(parseInt(processEl.box.dataset.failsafeTimer, 10));
          delete processEl.box.dataset.failsafeTimer;
        }

        // Slight delay before starting fadeout to ensure "ENDED" is visible
        setTimeout(() => {
          // No animation, just reduce opacity
          processEl.box.style.opacity = '0.2';
        }, 500);

        // Remove the process box after a short delay
        setTimeout(() => {
          // Remove from DOM
          if (processEl.box.parentNode) {
            processEl.box.parentNode.removeChild(processEl.box);
          }

          // Remove from our tracking map
          this.processElements.delete(processId);

          // Update the grid layout
          this.updateGridLayout();
        }, 1000); // Just a short delay
      }
    }
  }

  /**
   * Update the grid layout when processes change
   */
  updateGridLayout(): void {
    const processBoxes = document.querySelectorAll('.process-box');
    const count = processBoxes.length;

    if (count === 0) return;

    // Clear all existing containers first
    const containers = document.querySelectorAll('.process-container');
    containers.forEach(container => {
      // Get all process boxes within this container
      const boxesInContainer = Array.from(container.querySelectorAll('.process-box'));

      // Move each process box directly under the grid
      boxesInContainer.forEach(box => {
        this.processGrid.appendChild(box);
      });

      // Remove the empty container
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    });

    // Remove any existing grid styles
    this.processGrid.style.gridTemplateColumns = '';
    this.processGrid.style.gridTemplateRows = '';

    // Reset any existing grid-area settings and flex properties
    processBoxes.forEach(box => {
      const boxEl = box as HTMLElement;
      boxEl.style.gridArea = '';
      boxEl.style.flex = '1';
      boxEl.classList.remove('animate-slide-top', 'animate-slide-left', 'animate-grow-width', 'animate-grow-height');
    });

    // Determine how to split the screen based on count and create an alternating pattern
    if (count === 1) {
      // Full screen for first process - nothing special needed
    }
    else if (count === 2) {
      // Split horizontally for 2 processes using a flex container
      // Create a horizontal container
      const container = document.createElement('div');
      container.className = 'process-container split-horizontal';

      // Move both process boxes into the container
      const boxes = Array.from(processBoxes);
      container.appendChild(boxes[0]);
      container.appendChild(boxes[1]);

      // Add the container to the grid
      this.processGrid.appendChild(container);
    }
    else if (count === 3) {
      // For 3 processes: First row split horizontally, second row full width
      // Create a horizontal container for the first row
      const topContainer = document.createElement('div');
      topContainer.className = 'process-container split-horizontal';

      // Create container for the second row (just one box) - use vertical for single elements
      const bottomContainer = document.createElement('div');
      bottomContainer.className = 'process-container split-vertical';

      // Move process boxes into containers
      const boxes = Array.from(processBoxes);
      topContainer.appendChild(boxes[0]);
      topContainer.appendChild(boxes[1]);
      bottomContainer.appendChild(boxes[2]);

      // Add the containers to the grid
      this.processGrid.appendChild(topContainer);
      this.processGrid.appendChild(bottomContainer);
    }
    else if (count === 4) {
      // 2x2 grid with nested flex containers
      // Create a container for each row
      const topContainer = document.createElement('div');
      topContainer.className = 'process-container split-horizontal';

      const bottomContainer = document.createElement('div');
      bottomContainer.className = 'process-container split-horizontal';

      // Move process boxes into containers
      const boxes = Array.from(processBoxes);
      topContainer.appendChild(boxes[0]);
      topContainer.appendChild(boxes[1]);
      bottomContainer.appendChild(boxes[2]);
      bottomContainer.appendChild(boxes[3]);

      // Add containers to the grid
      this.processGrid.appendChild(topContainer);
      this.processGrid.appendChild(bottomContainer);
    }
    else if (count === 5 || count === 6) {
      // For 5 processes: 3 rows with alternating splits
      // First row: 2 horizontal
      // Second row: 2 horizontal
      // Third row: 1 or 2 horizontal depending on count

      const topContainer = document.createElement('div');
      topContainer.className = 'process-container split-horizontal';

      const middleContainer = document.createElement('div');
      middleContainer.className = 'process-container split-horizontal';

      // Move process boxes into containers
      const boxes = Array.from(processBoxes);

      // First row: boxes 0 and 1
      topContainer.appendChild(boxes[0]);
      topContainer.appendChild(boxes[1]);

      // Second row: boxes 2 and 3
      middleContainer.appendChild(boxes[2]);
      middleContainer.appendChild(boxes[3]);

      // Add containers to the grid
      this.processGrid.appendChild(topContainer);
      this.processGrid.appendChild(middleContainer);

      if (count === 5) {
        // Put the last box in a vertical container
        const lastContainer = document.createElement('div');
        lastContainer.className = 'process-container split-vertical';
        lastContainer.appendChild(boxes[4]);
        this.processGrid.appendChild(lastContainer);
      } else {
        // Create a third row with 2 boxes
        const bottomContainer = document.createElement('div');
        bottomContainer.className = 'process-container split-horizontal';
        bottomContainer.appendChild(boxes[4]);
        bottomContainer.appendChild(boxes[5]);
        this.processGrid.appendChild(bottomContainer);
      }
    }
    else {
      // For more processes (7+), organize in rows of 3
      const boxes = Array.from(processBoxes);

      // Calculate how many full rows of 3 we can create
      const fullRowCount = Math.floor(count / 3);
      const remainder = count % 3;

      // Create full rows of 3
      for (let i = 0; i < fullRowCount; i++) {
        const rowContainer = document.createElement('div');
        rowContainer.className = 'process-container split-horizontal';

        // Add 3 boxes to this row
        for (let j = 0; j < 3; j++) {
          const boxIndex = i * 3 + j;
          rowContainer.appendChild(boxes[boxIndex]);
        }

        this.processGrid.appendChild(rowContainer);
      }

      // Handle remaining boxes
      if (remainder > 0) {
        const lastRowContainer = document.createElement('div');
        lastRowContainer.className = 'process-container split-horizontal';

        // Add remaining boxes
        for (let k = 0; k < remainder; k++) {
          const boxIndex = fullRowCount * 3 + k;
          lastRowContainer.appendChild(boxes[boxIndex]);
        }

        this.processGrid.appendChild(lastRowContainer);
      }
    }
  }

  /**
   * Remove a process from the UI
   * 
   * @param processId - Process ID to remove
   */
  removeProcess(processId: string): void {
    const processEl = this.processElements.get(processId);
    if (processEl && processEl.box.parentNode) {
      processEl.box.parentNode.removeChild(processEl.box);
      this.processElements.delete(processId);
      this.updateGridLayout();
    }
  }
}