/**
 * ProcessUI module
 *
 * Handles the UI representation of a MAGI process
 */
import { ProcessElement, ProcessStatus } from '@types';
import { InfiniteCanvas } from 'ef-infinite-canvas';

// Extend HTMLElement to include our custom property
declare global {
  interface HTMLElement {
    dotBackground?: HTMLElement;
  }
}

export class ProcessUI {
  private processElements: Map<string, ProcessElement> = new Map();
  private processTemplate: HTMLTemplateElement;
  private canvasContainer!: HTMLElement; // initialized in setupInfiniteCanvas
  private infiniteCanvas: InfiniteCanvas | null = null;
  private zoomLevel: number = 1;
  private processContainerWrapper!: HTMLElement; // initialized in setupInfiniteCanvas
  private translateX: number = 0;
  private translateY: number = 0;
  private gap: number = 40; // how wide a gap between boxes should be

  constructor(
    processTemplate: HTMLTemplateElement
  ) {
    this.processTemplate = processTemplate;

    // Setup infinite canvas container
    this.setupInfiniteCanvas();

    // Call once on load and then on window resize
    this.updateGridLayout();
    window.addEventListener('resize', () => this.handleWindowResize());
  }

  /**
   * Handle window resize events
   */
  private handleWindowResize(): void {
    // First update the grid layout to recalculate box sizes
    this.updateGridLayout();

    // Then immediately auto-zoom to fit all processes in the new viewport
    this.autoZoomToFit();
  }

  /**
   * Set up the infinite canvas for process layout
   */
  private setupInfiniteCanvas(): void {
    // Create canvas container to host the infinite canvas
    this.canvasContainer = document.createElement('div');
    this.canvasContainer.className = 'infinite-canvas-container';
    this.canvasContainer.style.position = 'fixed';
    this.canvasContainer.style.top = '0';
    this.canvasContainer.style.left = '0';
    this.canvasContainer.style.width = '100vw';
    this.canvasContainer.style.height = '100vh';
    this.canvasContainer.style.overflow = 'hidden';
    this.canvasContainer.style.zIndex = '0'; // Below header and content

    // Create a separate background layer for the dots that will scale with zoom
    const dotBackground = document.createElement('div');
    dotBackground.className = 'dot-background';

    // Create a wrapper for the process boxes that we'll transform
    this.processContainerWrapper = document.createElement('div');
    this.processContainerWrapper.className = 'process-container-wrapper';
    this.processContainerWrapper.style.position = 'absolute';

    // Add a tooltip/hint about zoom functionality
    this.addZoomHint();

    // Add containers to the DOM - append to body for full page coverage
    this.canvasContainer.appendChild(dotBackground);
    this.canvasContainer.appendChild(this.processContainerWrapper);
    document.body.appendChild(this.canvasContainer);

    // Store a reference to the dot background for updating
    this.canvasContainer.dotBackground = dotBackground;

    // Make sure the header stays on top
    const header = document.getElementById('main-header');
    if (header) {
      header.style.position = 'relative';
      header.style.zIndex = '100';
      header.style.pointerEvents = 'auto';
    }

    // Set up panning and zooming
    this.setupPanAndZoom();
  }

  /**
   * Add a hint about zoom functionality
   */
  private addZoomHint(): void {
    const hintElement = document.createElement('div');
    hintElement.className = 'zoom-hint';
    hintElement.style.position = 'absolute';
    hintElement.style.bottom = '10px';
    hintElement.style.right = '10px';
    hintElement.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
    hintElement.style.color = 'white';
    hintElement.style.padding = '8px 12px';
    hintElement.style.borderRadius = '4px';
    hintElement.style.fontSize = '0.8rem';
    hintElement.style.zIndex = '1000';
    hintElement.style.pointerEvents = 'none';
    hintElement.style.opacity = '0';
    hintElement.style.transition = 'opacity 0.3s ease';

    // Detect platform for correct hint text
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifierKey = isMac ? '⌘ Cmd' : 'Ctrl';

    hintElement.innerHTML = `
      <div><span class="zoom-hint-icon">👆</span> Click to focus on a process</div>
      <div><span class="zoom-hint-icon">👋</span> Drag to pan view</div>
      <div><span class="zoom-hint-icon">🔍</span> ${modifierKey} + Scroll to zoom</div>
    `;

    // Show hint when there are processes
    const observer = new MutationObserver(() => {
      if (this.processElements.size > 0) {
        hintElement.style.opacity = '1';
        // Hide hint after 5 seconds
        setTimeout(() => {
          hintElement.style.opacity = '0';
        }, 5000);
      }
    });

    observer.observe(this.processContainerWrapper, { childList: true });

    this.canvasContainer.appendChild(hintElement);
  }

  /**
   * Set up panning and zooming functionality
   */
  private setupPanAndZoom(): void {
    let isDragging = false;
    let wasDragged = false;
    let startX = 0;
    let startY = 0;

    // Create and add reset zoom button
    this.addResetZoomButton();

    // Pan functionality
    this.canvasContainer.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // Left mouse button
        isDragging = true;
        wasDragged = false; // Reset the drag tracking
        startX = e.clientX - this.translateX;
        startY = e.clientY - this.translateY;
        this.canvasContainer.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (isDragging) {
        // Track that actual dragging has occurred
        const moveX = Math.abs(e.clientX - (startX + this.translateX));
        const moveY = Math.abs(e.clientY - (startY + this.translateY));

        // Consider it a drag if moved more than 5px in any direction
        if (moveX > 5 || moveY > 5) {
          wasDragged = true;
        }

        this.translateX = e.clientX - startX;
        this.translateY = e.clientY - startY;
        this.updateTransform();
        this.showResetZoomButton();
      }
    });

    window.addEventListener('mouseup', () => {
      // Store drag state before resetting isDragging
      const hadDragged = wasDragged;
      isDragging = false;
      wasDragged = false;
      this.canvasContainer.style.cursor = 'grab';

      // Set a flag on the container to indicate a drag just ended
      // This will be used in the click handler to prevent focus
      if (hadDragged) {
        this.canvasContainer.dataset.justDragged = 'true';
        // Clear the flag after a short delay
        setTimeout(() => {
          delete this.canvasContainer.dataset.justDragged;
        }, 100);
      }
    });

    // Zoom functionality with mouse wheel + modifier key
    this.canvasContainer.addEventListener('wheel', (e) => {
      // Check if modifier key is pressed (Command on Mac, Ctrl on Windows/Linux)
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifierKeyPressed = isMac ? e.metaKey : e.ctrlKey;

      if (modifierKeyPressed) {
        e.preventDefault();

        // Also normalize the delta across different browsers/devices
        const normalizedDelta = Math.abs(e.deltaY) > 100
          ? e.deltaY / 100 // For browsers that use pixels
          : e.deltaY;      // For browsers that use lines

        const delta = -Math.sign(normalizedDelta) * 0.1;

        // Apply the delta with a smoother curve based on current zoom level
        // This makes zooming slower when zoomed out, and even slower when zoomed in
        // Logarithmic scaling to make zoom feel consistent at all levels
        let zoomFactor = delta * (0.1 + 0.05 * Math.log(this.zoomLevel + 0.5));

        // Apply stronger dampening when zoomed out
        zoomFactor *= this.zoomLevel;

        const oldZoom = this.zoomLevel;
        this.zoomLevel = Math.min(Math.max(0.1, this.zoomLevel + zoomFactor), 3); // Limit zoom between 0.1x and 3x

        // Adjust translateX and translateY to zoom toward mouse position
        const rect = this.canvasContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        this.translateX = mouseX - (mouseX - this.translateX) * (this.zoomLevel / oldZoom);
        this.translateY = mouseY - (mouseY - this.translateY) * (this.zoomLevel / oldZoom);

        this.updateTransform();
        this.showResetZoomButton();
      }
    }, { passive: false });

    // Set initial cursor style
    this.canvasContainer.style.cursor = 'grab';
  }

  /**
   * Add reset zoom button to the canvas
   */
  private addResetZoomButton(): void {
    // Create the reset zoom button
    const resetButton = document.createElement('button');
    resetButton.className = 'reset-zoom-button btn btn-sm btn-light';
    resetButton.textContent = 'Show All';


    // Add hover effect
    resetButton.addEventListener('mouseover', () => {
      resetButton.style.opacity = '1';
    });

    resetButton.addEventListener('mouseout', () => {
      resetButton.style.opacity = '0.8';
    });

    // Add click handler to reset the view
    resetButton.addEventListener('click', () => {
      this.resetZoom();
    });

    // Add the button to the body to ensure it's above everything
    document.body.appendChild(resetButton);
  }

  /**
   * Show the reset zoom button when zoom/pan changes
   */
  private showResetZoomButton(): void {
    const resetButton = document.querySelector('.reset-zoom-button') as HTMLButtonElement;
    if (resetButton) {
      // Only show the button if the view has been changed
      if (this.zoomLevel !== 1 || this.translateX !== 0 || this.translateY !== 0) {
        resetButton.style.display = 'block';
      }
    }
  }

  /**
   * Reset zoom and position
   */
  private resetZoom(): void {
    // Apply smooth transition just like focusOnProcess
    this.processContainerWrapper.style.transition = 'transform 0.5s ease-out';

    if (this.canvasContainer.dotBackground) {
      this.canvasContainer.dotBackground.style.transition = 'transform 0.5s ease-out';
    }

    if (this.processElements.size === 1) {
      // If only one process, go to 1:1 scale centered
      const singleProcess = Array.from(this.processElements.values())[0];
      const box = singleProcess.box;

      // Get viewport dimensions and account for header
      const viewportWidth = this.canvasContainer.clientWidth;
      const header = document.getElementById('main-header');
      const headerHeight = header ? header.offsetHeight : 0;
      const viewportHeight = this.canvasContainer.clientHeight - headerHeight;

      // Calculate position to center the process box
      const boxLeft = parseFloat(box.style.left) || 0;
      const boxTop = parseFloat(box.style.top) || 0;
      const boxWidth = parseFloat(box.style.width) || 0;
      const boxHeight = parseFloat(box.style.height) || 0;

      // Center the box in the viewport, accounting for header
      this.zoomLevel = 1;
      this.translateX = (viewportWidth - boxWidth) / 2 - boxLeft;
      this.translateY = headerHeight + (viewportHeight - boxHeight) / 2 - boxTop;

      this.updateTransform();
    } else {
      // Otherwise fit all processes
      this.autoZoomToFit();
    }

    // Hide the reset button
    const resetButton = document.querySelector('.reset-zoom-button') as HTMLButtonElement;
    if (resetButton) {
      resetButton.style.display = 'none';
    }

    // Reset the transition after it completes
    setTimeout(() => {
      this.processContainerWrapper.style.transition = 'transform 0.1s ease-out';

      if (this.canvasContainer.dotBackground) {
        this.canvasContainer.dotBackground.style.transition = 'transform 0.1s ease-out';
      }
    }, 500);
  }

  /**
   * Update the transform of the process container
   */
  private updateTransform(): void {
    // Apply the exact same transformation to both elements
    const transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.zoomLevel})`;

    // Update the transform for the process container wrapper
    this.processContainerWrapper.style.transform = transform;

    // Scale the dot background with the same transform
    if (this.canvasContainer.dotBackground) {
      this.canvasContainer.dotBackground.style.transform = transform;
    }
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

    // Check if this is the first process box
    const isFirstBox = this.processElements.size === 0;

    // For first box, disable transitions initially
    if (isFirstBox) {
      // Disable transitions to skip initial animation
      processBox.style.position = 'absolute';
      processBox.style.transition = 'none';

      // Set initial opacity to 1 to prevent fade-in
      processBox.style.opacity = '1';
    } else {
      // For additional boxes, use normal transitions
      processBox.style.position = 'absolute';
      processBox.style.transition = 'all 0.3s ease-in-out';
    }

    // Add the process box to the wrapper
    this.processContainerWrapper.appendChild(clone);

    // Get process input elements
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

      // Check if a drag just ended
      const justDragged = this.canvasContainer.dataset.justDragged === 'true';

      // If we just finished dragging, don't trigger focus
      if (justDragged) {
        return;
      }

      // Check what was clicked
      const clickedElement = event.target as HTMLElement;

      // Check if clicking on input area
      const isClickingInput = clickedElement.classList.contains('process-input') ||
                            clickedElement.closest('.process-input-container') !== null;

      // Check if clicking on header controls (status, terminate button)
      const isClickingControls = clickedElement.classList.contains('process-status') ||
                             clickedElement.classList.contains('process-terminate') ||
                             clickedElement.closest('.process-terminate') !== null;

      if (isClickingInput && processInput) {
        // Focus the input if clicking on input area
        setTimeout(() => processInput.focus(), 0);
      } else if (!isClickingControls) {
        // If clicking anywhere else except controls, zoom to 100% and center
        this.focusOnProcess(id);
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

    // Update the grid layout with the new process
    this.updateGridLayout();
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

          // Update the grid layout to reposition the remaining boxes
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

    // For the first process box, directly set position without transitions
    if (count === 1 && this.processElements.size === 1) {
      // Disable all transitions for the container and background
      this.processContainerWrapper.style.transition = 'none';
      if (this.canvasContainer.dotBackground) {
        this.canvasContainer.dotBackground.style.transition = 'none';
      }
    }

    // First, move all existing process boxes to the wrapper
    processBoxes.forEach(box => {
      // Only move if not already in the wrapper
      if (box.parentElement !== this.processContainerWrapper) {
        // For the first box, disable transitions
        if (count === 1) {
          (box as HTMLElement).style.transition = 'none';
        }
        this.processContainerWrapper.appendChild(box);
      }
    });

    // Get the process boxes again (now they should all be in the wrapper)
    const boxes = Array.from(this.processContainerWrapper.querySelectorAll('.process-box')) as HTMLElement[];

    // Get container dimensions
    const containerWidth = this.canvasContainer.clientWidth;
    const containerHeight = this.canvasContainer.clientHeight;

    // Make each box the full size of the container, but with max dimensions
    const maxWidth = 1000;
    const maxHeight = Math.min(1500, Math.max(500, Math.round(maxWidth*(containerHeight/containerWidth))));
    const boxWidth = Math.min(containerWidth, maxWidth);
    const boxHeight = Math.min(containerHeight, maxHeight);

    // Calculate the number of boxes per row
    let boxesPerRow;

    // Special case for 2 processes - force side by side layout
    if (count === 2) {
      boxesPerRow = 2; // Always show 2 boxes side by side
    } else {
      boxesPerRow = Math.ceil(Math.sqrt(count)); // Otherwise arrange in a roughly square grid
    }

    // Position each box in a grid layout
    boxes.forEach((box, index) => {
      const row = Math.floor(index / boxesPerRow);
      const col = index % boxesPerRow;

      // Set size and position
      box.style.position = 'absolute';
      box.style.width = `${boxWidth}px`;
      box.style.height = `${boxHeight}px`;
      box.style.left = `${col * (boxWidth + this.gap)}px`;
      box.style.top = `${row * (boxHeight + this.gap)}px`;
    });

    // Calculate the total width and height of the grid
    const totalWidth = boxesPerRow * (boxWidth + this.gap) - this.gap;
    const totalRows = Math.ceil(count / boxesPerRow);
    const totalHeight = totalRows * (boxHeight + this.gap) - this.gap;

    // Set the wrapper size to contain all boxes
    this.processContainerWrapper.style.width = `${totalWidth}px`;
    this.processContainerWrapper.style.height = `${totalHeight}px`;

    // Auto-zoom to fit all processes
    this.autoZoomToFit();

    // Re-enable transitions after the layout is complete
    // Use setTimeout to ensure the initial layout is applied without animation
    if (count === 1 && this.processElements.size === 1) {
      setTimeout(() => {
        this.processContainerWrapper.style.transition = 'transform 0.1s ease-out';
        if (this.canvasContainer.dotBackground) {
          this.canvasContainer.dotBackground.style.transition = 'transform 0.1s ease-out';
        }

        boxes.forEach(box => {
          box.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        });
      }, 50);
    }
  }

  /**
   * Automatically zoom to fit all process boxes in the viewport
   */
  private autoZoomToFit(): void {
    if (this.processElements.size === 0) return;

    // Get the dimensions of the wrapper and the viewport
    const wrapperWidth = parseFloat(this.processContainerWrapper.style.width);
    const wrapperHeight = parseFloat(this.processContainerWrapper.style.height);
    const viewportWidth = this.canvasContainer.clientWidth;

    // Account for header height when calculating available viewport height
    const header = document.getElementById('main-header');
    const headerHeight = header ? header.offsetHeight : 0;
    const viewportHeight = this.canvasContainer.clientHeight - headerHeight;

    // Calculate the zoom level needed to fit the content
    // Using gap to leave some margin around the edges
    const zoomX = ((viewportWidth - (this.gap*2)) / wrapperWidth);
    const zoomY = ((viewportHeight - (this.gap*2)) / wrapperHeight);

    // Use the smaller of the two zoom levels to ensure everything fits
    let newZoom = Math.min(zoomX, zoomY);

    // Apply final limits to avoid extreme zooming
    newZoom = Math.min(Math.max(newZoom, 0.1), 1);

    // Set the new zoom level
    this.zoomLevel = newZoom;

    // Calculate the position to center the content
    this.translateX = (viewportWidth - wrapperWidth * newZoom) / 2;

    // Add headerHeight to the Y translation to position content below the header
    this.translateY = headerHeight + (viewportHeight - wrapperHeight * newZoom) / 2;

    // For first process box (skip animation completely)
    if (this.processElements.size === 1) {
      // Disable all transitions to prevent any animation
      this.processContainerWrapper.style.transition = 'none';
      if (this.canvasContainer.dotBackground) {
        this.canvasContainer.dotBackground.style.transition = 'none';
      }
    } else {
      // Apply smooth transition when called from resetZoom (transition is already set)
      // but not when called during normal layout changes
      const currentTransition = this.processContainerWrapper.style.transition;

      // If there's no transition already set, don't add one
      // This avoids animation during initial layout and resizing
      if (!currentTransition || currentTransition.includes('0.1s')) {
        this.processContainerWrapper.style.transition = '';
        if (this.canvasContainer.dotBackground) {
          this.canvasContainer.dotBackground.style.transition = '';
        }
      }
    }

    // Update the transform with the new values
    this.updateTransform();

    // Show the reset button if there's more than one process
    if (this.processElements.size > 1) {
      this.showResetZoomButton();
    }

    // Reset the transition to default after a short delay
    setTimeout(() => {
      this.processContainerWrapper.style.transition = 'transform 0.1s ease-out';
      if (this.canvasContainer.dotBackground) {
        this.canvasContainer.dotBackground.style.transition = 'transform 0.1s ease-out';
      }
    }, 100);
  }

  /**
   * Focus on a specific process by zooming to 100% and centering it
   *
   * @param processId - Process ID to focus on
   */
  focusOnProcess(processId: string): void {
    const processEl = this.processElements.get(processId);
    if (!processEl) return;

    // Get the process box
    const box = processEl.box;

    // Get the process box position (not using getBoundingClientRect to avoid lint warnings)

    // Get viewport dimensions and account for header
    const viewportWidth = this.canvasContainer.clientWidth;
    const header = document.getElementById('main-header');
    const headerHeight = header ? header.offsetHeight : 0;
    const viewportHeight = this.canvasContainer.clientHeight - headerHeight;

    // Set zoom to 100%
    this.zoomLevel = 1;

    // Calculate position to center the process box
    const boxLeft = parseFloat(box.style.left) || 0;
    const boxTop = parseFloat(box.style.top) || 0;
    const boxWidth = parseFloat(box.style.width) || 0;
    const boxHeight = parseFloat(box.style.height) || 0;

    // Center the box in the viewport, accounting for header
    this.translateX = (viewportWidth - boxWidth) / 2 - boxLeft;
    this.translateY = headerHeight + (viewportHeight - boxHeight) / 2 - boxTop;

    // Apply the transform with a smooth transition
    this.processContainerWrapper.style.transition = 'transform 0.5s ease-out';

    // Apply the same transition to the dot background
    if (this.canvasContainer.dotBackground) {
      this.canvasContainer.dotBackground.style.transition = 'transform 0.5s ease-out';
    }

    this.updateTransform();

    // Reset the transition after it completes
    setTimeout(() => {
      this.processContainerWrapper.style.transition = 'transform 0.1s ease-out';

      if (this.canvasContainer.dotBackground) {
        this.canvasContainer.dotBackground.style.transition = 'transform 0.1s ease-out';
      }
    }, 500);

    // Show the reset zoom button
    this.showResetZoomButton();
  }

  /**
   * Remove a process from the UI
   *
   * @param processId - Process ID to remove
   */
  removeProcess(processId: string): void {
    const processEl = this.processElements.get(processId);
    if (processEl && processEl.box.parentNode) {
      // Add a fade-out transition
      processEl.box.style.opacity = '0';
      processEl.box.style.transform = 'scale(0.95)';

      // Delay the actual removal to allow for animation
      setTimeout(() => {
        if (processEl.box.parentNode) {
          processEl.box.parentNode.removeChild(processEl.box);
          this.processElements.delete(processId);

          // Update the grid layout to reposition the remaining boxes
          this.updateGridLayout();
        }
      }, 300);
    }
  }
}
