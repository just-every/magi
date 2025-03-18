/**
 * MAGI System Client-Side Application
 * Handles UI interactions and WebSocket communication with the server
 */

// Type definitions for server events
interface ProcessCreateEvent {
  id: string;            // Process identifier (AI-xxxxxx)
  command: string;       // Command that started the process
  status: string;        // Initial status (usually 'running')
}

interface ProcessLogsEvent {
  id: string;            // Process identifier
  logs: string;          // Log content (may contain markdown)
}

interface ProcessUpdateEvent {
  id: string;            // Process identifier
  status: string;        // New status ('running', 'completed', 'failed', 'terminated')
}

// Type definition for process command
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ProcessCommand {
  processId: string;     // Process to send command to
  command: string;       // Command text
}

// DOM element references for processes
interface ProcessElement {
  box: HTMLElement;      // Container element
  logs: HTMLElement;     // Log output container
  status: HTMLElement;   // Status indicator
  input?: HTMLInputElement; // Optional process-specific input field
}

// Valid process statuses
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type ProcessStatus = 'running' | 'completed' | 'failed' | 'terminated' | 'ending';

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
  // Connect to Socket.io server
  const socket = io();
  
  // DOM elements
  const processGrid = document.getElementById('process-grid') as HTMLElement;
  const mainHeader = document.getElementById('main-header') as HTMLElement;
  const commandForm = document.getElementById('command-form') as HTMLFormElement;
  const commandInput = document.getElementById('command-input') as HTMLInputElement;
  const centerInputContainer = document.getElementById('center-input-container') as HTMLElement;
  const centerCommandForm = document.getElementById('center-command-form') as HTMLFormElement;
  const centerCommandInput = document.getElementById('center-command-input') as HTMLInputElement;
  const processTemplate = document.getElementById('process-template') as HTMLTemplateElement;
  
  // Map to store process elements
  const processElements = new Map<string, ProcessElement>();
  
  // State variables
  let isFirstProcess = true;
  
  // Function to handle command submission regardless of which input it comes from
  function handleCommandSubmission(command: string): void {
    if (command) {
      socket.emit('command:run', command);
      
      // If this is the first process, animate the transition
      if (isFirstProcess) {
        isFirstProcess = false;
        animateInitialTransition();
      }
    }
  }
  
  // Handle header form submission
  commandForm.addEventListener('submit', (event: Event) => {
    event.preventDefault();
    
    const command = commandInput.value.trim();
    handleCommandSubmission(command);
    commandInput.value = '';
  });
  
  // Handle center form submission
  centerCommandForm.addEventListener('submit', (event: Event) => {
    event.preventDefault();
    
    const command = centerCommandInput.value.trim();
    handleCommandSubmission(command);
    centerCommandInput.value = '';
  });
  
  // Handle keydown for header input
  commandInput.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      
      const command = commandInput.value.trim();
      handleCommandSubmission(command);
      commandInput.value = '';
    }
  });
  
  // Handle keydown for center input
  centerCommandInput.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      
      const command = centerCommandInput.value.trim();
      handleCommandSubmission(command);
      centerCommandInput.value = '';
    }
  });
  
  // Function to animate the transition from center input to header
  function animateInitialTransition(): void {
    // First, animate the header in
    mainHeader.style.opacity = '1';
    mainHeader.style.transform = 'translateY(0)';
    
    // Then, fade out the center input
    centerInputContainer.style.opacity = '0';
    
    // After animation completes, hide the center input completely
    setTimeout(() => {
      centerInputContainer.style.display = 'none';
      
      // Focus on the header input
      commandInput.focus();
    }, 500);
  }
  
  // Socket event handlers
  socket.on<ProcessCreateEvent>('process:create', (process) => {
    createProcessBox(process);
  });
  
  socket.on<ProcessLogsEvent>('process:logs', (data) => {
    appendLogs(data.id, data.logs);
  });
  
  socket.on<ProcessUpdateEvent>('process:update', (data) => {
    updateProcessStatus(data.id, data.status);
  });
  
  // Create a new process box
  function createProcessBox(process: ProcessCreateEvent): void {
    // Clone the template
    const clone = document.importNode(processTemplate.content, true);
    
    // Get elements
    const processBox = clone.querySelector('.process-box') as HTMLElement;
    const processId = clone.querySelector('.process-id') as HTMLElement;
    const processStatus = clone.querySelector('.process-status') as HTMLElement;
    const processTerminate = clone.querySelector('.process-terminate') as HTMLButtonElement;
    const processHeader = clone.querySelector('.card-header') as HTMLElement;
    
    // Generate complementary colors for header
    const generateColors = () => {
      // Create base colors, avoid too much yellow by keeping red and green from both being too high
      let r = Math.floor(Math.random() * 200) + 55; // 55-255
      let g = Math.floor(Math.random() * 200) + 55; // 55-255
      let b = Math.floor(Math.random() * 200) + 55; // 55-255
      
      // Ensure one color dominates to make the theme clear
      const dominantIndex = Math.floor(Math.random() * 3);
      if (dominantIndex === 0) {
        r = Math.min(255, r + 50);
        g = Math.max(50, g - 30);
        b = Math.max(50, b - 30);
      } else if (dominantIndex === 1) {
        g = Math.min(255, g + 50);
        r = Math.max(50, r - 30);
        b = Math.max(50, b - 30);
      } else {
        b = Math.min(255, b + 50);
        r = Math.max(50, r - 30);
        g = Math.max(50, g - 30);
      }
      
      // Create background with very low alpha
      const bgColor = `rgba(${r}, ${g}, ${b}, 0.08)`;
      
      // Create darker text version for contrast
      const textColor = `rgba(${Math.floor(r * 0.6)}, ${Math.floor(g * 0.6)}, ${Math.floor(b * 0.6)}, 0.9)`;
      
      return { bgColor, textColor };
    };
    
    const colors = generateColors();
    processHeader.style.backgroundColor = colors.bgColor;
    processId.style.color = colors.textColor;
    
    // Set process information
    processBox.id = `process-${process.id}`;
    processId.textContent = process.id; // Show the actual AI-xxxx ID
    
    // Add the process box to the grid
    processGrid.appendChild(clone);
    
    // Get process input elements
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const processInputContainer = processBox.querySelector('.process-input-container') as HTMLElement;
    const processInputForm = processBox.querySelector('.process-input-form') as HTMLFormElement;
    const processInput = processBox.querySelector('.process-input') as HTMLInputElement;
    
    // Store the process elements for later reference
    processElements.set(process.id, {
      box: processBox,
      logs: processBox.querySelector('.process-logs') as HTMLElement,
      status: processStatus,
      input: processInput
    });
    
    // Update process status
    updateProcessStatus(process.id, process.status);
    
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
      
      const command = processInput.value.trim();
      if (command) {
        // Emit the command with process ID to associate it
        socket.emit('process:command', {
          processId: process.id,
          command: command
        });
        
        // Clear input and reset height
        processInput.value = '';
        processInput.style.height = 'auto';
        
        // Append the command to the logs (client-side only)
        appendLogs(process.id, `> ${command}`);
      }
    });
    
    // Handle terminate button
    processTerminate.addEventListener('click', () => {
      // Prevent multiple clicks
      if (processTerminate.disabled) return;
      processTerminate.disabled = true;
      
      // Change the status to "ENDING..." immediately for better UX
      const processEl = processElements.get(process.id);
      if (processEl) {
        // Hide the terminate button
        processTerminate.style.display = 'none';
        
        // Show ending status
        processEl.status.textContent = 'ENDING...';
        processEl.status.classList.remove('status-running', 'status-completed', 'status-failed', 'status-terminated', 'status-ending');
        processEl.status.classList.add('status-ending');
        
        // Add a failsafe - if the server doesn't respond in 10 seconds, force the UI to show ENDED
        const failsafeTimer = setTimeout(() => {
          // If still showing ENDING...
          if (processEl.status.textContent === 'ENDING...') {
            // Force update to ENDED status and apply fadeout
            updateProcessStatus(process.id, 'terminated');
          }
        }, 10000);
        
        // Store the timer ID in a data attribute for cleanup if needed
        processEl.box.dataset.failsafeTimer = String(failsafeTimer);
      }
      
      // Send termination request
      socket.emit('process:terminate', process.id);
    });
    
    // Update the grid layout
    updateGridLayout();
    
    // Animate the new process appearance
    animateNewProcess(processBox);
  }
  
  // Append logs to a process
  function appendLogs(processId: string, logData: string): void {
    const processEl = processElements.get(processId);
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
  
  // Update process status
  function updateProcessStatus(processId: string, status: string): void {
    const processEl = processElements.get(processId);
    if (processEl) {
      // Remove all status classes
      processEl.status.classList.remove(
        'status-running', 'status-completed', 'status-failed', 'status-terminated', 'status-ending',
        'bg-secondary', 'bg-success', 'bg-danger', 'bg-warning'
      );
      
      // Add the appropriate status class
      processEl.status.classList.add(`status-${status}`);
      
      // Add Bootstrap badge classes
      if (status === 'running') {
        processEl.status.classList.add('bg-secondary');
      } else if (status === 'completed') {
        processEl.status.classList.add('bg-success');
      } else if (status === 'failed') {
        processEl.status.classList.add('bg-danger');
      } else if (status === 'ending' || status === 'terminated') {
        processEl.status.classList.add('bg-warning');
      }
      processEl.status.textContent = status;
      
      // Handle terminated status specially - add fadeout and removal
      if (status === 'terminated') {
        // Change text to "ENDED" immediately
        processEl.status.textContent = 'ENDED';
        
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
          // Apply fadeout animation
          processEl.box.style.animation = 'fadeOutRemove 1.5s ease-out forwards';
        }, 500);
        
        // Remove the process box after animation completes (accounting for the 500ms delay)
        setTimeout(() => {
          // Remove from DOM
          if (processEl.box.parentNode) {
            processEl.box.parentNode.removeChild(processEl.box);
          }
          
          // Remove from our tracking map
          processElements.delete(processId);
          
          // Update the grid layout
          updateGridLayout();
          
          // Check if this was the last process
          if (processElements.size === 0) {
            // If no more processes, show the centered input again
            isFirstProcess = true;
            mainHeader.style.opacity = '0';
            mainHeader.style.transform = 'translateY(-100%)';
            centerInputContainer.style.display = 'block';
            setTimeout(() => {
              centerInputContainer.style.opacity = '1';
              centerCommandInput.focus();
            }, 10);
          }
        }, 2000); // 500ms delay + 1500ms animation
      }
    }
  }
  
  // Update the grid layout when processes change
  function updateGridLayout(): void {
    const processBoxes = document.querySelectorAll('.process-box');
    const count = processBoxes.length;
    
    if (count === 0) return;
    
    // Remove any existing grid styles
    processGrid.style.gridTemplateColumns = '';
    processGrid.style.gridTemplateRows = '';
    
    // Reset any existing grid-area settings
    processBoxes.forEach(box => {
      (box as HTMLElement).style.gridArea = '';
    });
    
    // Determine how to split the screen based on count and create an alternating pattern
    if (count === 1) {
      // Full screen for first process
      processGrid.style.gridTemplateColumns = '1fr';
      processGrid.style.gridTemplateRows = '1fr';
    } 
    else if (count === 2) {
      // Split horizontally for 2 processes
      processGrid.style.gridTemplateColumns = '1fr 1fr';
      processGrid.style.gridTemplateRows = '1fr';
    } 
    else if (count === 3) {
      // For 3 processes, split into 2 columns with the third taking full width of second row
      processGrid.style.gridTemplateColumns = '1fr 1fr';
      processGrid.style.gridTemplateRows = '1fr 1fr';
      
      // Third box takes full second row
      const boxes = Array.from(processBoxes);
      (boxes[2] as HTMLElement).style.gridColumn = '1 / span 2';
    } 
    else if (count === 4) {
      // 2x2 grid for 4 processes
      processGrid.style.gridTemplateColumns = '1fr 1fr';
      processGrid.style.gridTemplateRows = '1fr 1fr';
    } 
    else if (count === 5) {
      // 5 processes: 2x2 + 1 row full width
      processGrid.style.gridTemplateColumns = '1fr 1fr';
      processGrid.style.gridTemplateRows = '1fr 1fr 1fr';
      
      // Fifth box takes full third row
      const boxes = Array.from(processBoxes);
      (boxes[4] as HTMLElement).style.gridColumn = '1 / span 2';
    } 
    else if (count === 6) {
      // 6 processes: 3x2 grid
      processGrid.style.gridTemplateColumns = '1fr 1fr 1fr';
      processGrid.style.gridTemplateRows = '1fr 1fr';
    } 
    else {
      // For more processes, create a grid that's roughly square
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      
      processGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      processGrid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    }
  }
  
  // Add animation when a new process is created
  function animateNewProcess(processBox: HTMLElement): void {
    // The animation is now handled by CSS
    // We just need to refresh all process boxes to trigger transitions
    
    const allBoxes = document.querySelectorAll('.process-box');
    allBoxes.forEach(box => {
      // Force a reflow/repaint to ensure animations work properly
      (box as HTMLElement).style.animation = 'none';
      void (box as HTMLElement).offsetWidth; // Trigger reflow
      (box as HTMLElement).style.animation = 'gridTransition 0.5s ease-out';
    });
    
    // Give new process box a specific animation
    processBox.style.animation = 'splitFadeIn 0.5s ease-out';
  }
  
  // Call once on load and then on window resize
  updateGridLayout();
  window.addEventListener('resize', updateGridLayout);
  
  // Check if there are existing processes on load and set UI accordingly
  socket.on<void>('connect', () => {
    // Wait a bit to make sure we've received any existing processes
    setTimeout(() => {
      const processCount = processElements.size;
      if (processCount > 0) {
        // If there are existing processes, show the header and hide the center input
        isFirstProcess = false;
        mainHeader.style.opacity = '1';
        mainHeader.style.transform = 'translateY(0)';
        centerInputContainer.style.opacity = '0';
        centerInputContainer.style.display = 'none';
      } else {
        // Focus on the center input if no processes
        centerCommandInput.focus();
      }
    }, 100);
  });
});