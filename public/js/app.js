document.addEventListener('DOMContentLoaded', () => {
  // Connect to Socket.io server
  const socket = io();
  
  // DOM elements
  const processGrid = document.getElementById('process-grid');
  const commandForm = document.getElementById('command-form');
  const commandInput = document.getElementById('command-input');
  const processTemplate = document.getElementById('process-template');
  
  // Map to store process elements
  const processElements = new Map();
  
  // Handle form submission
  commandForm.addEventListener('submit', (event) => {
    event.preventDefault();
    
    const command = commandInput.value.trim();
    if (command) {
      socket.emit('command:run', command);
      commandInput.value = '';
    }
  });
  
  // Socket event handlers
  socket.on('process:create', (process) => {
    createProcessBox(process);
  });
  
  socket.on('process:logs', (data) => {
    appendLogs(data.id, data.logs);
  });
  
  socket.on('process:update', (data) => {
    updateProcessStatus(data.id, data.status);
  });
  
  // Create a new process box
  function createProcessBox(process) {
    // Clone the template
    const clone = document.importNode(processTemplate.content, true);
    
    // Get elements
    const processBox = clone.querySelector('.process-box');
    const processId = clone.querySelector('.process-id');
    const processCommand = clone.querySelector('.process-command');
    const processStatus = clone.querySelector('.process-status');
    const processTerminate = clone.querySelector('.process-terminate');
    
    // Set process information
    processBox.id = `process-${process.id}`;
    processId.textContent = `Process #${process.id}`;
    processCommand.textContent = process.command;
    
    // Add the process box to the grid
    processGrid.appendChild(clone);
    
    // Store the process elements for later reference
    processElements.set(process.id, {
      box: processBox,
      logs: processBox.querySelector('.process-logs'),
      status: processStatus
    });
    
    // Update process status
    updateProcessStatus(process.id, process.status);
    
    // Handle terminate button
    processTerminate.addEventListener('click', () => {
      socket.emit('process:terminate', process.id);
    });
    
    // Scroll to the bottom of the page to show the new process
    window.scrollTo(0, document.body.scrollHeight);
  }
  
  // Append logs to a process
  function appendLogs(processId, logData) {
    const processEl = processElements.get(processId);
    if (processEl) {
      // Parse markdown
      const html = marked.parse(logData);
      
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
  function updateProcessStatus(processId, status) {
    const processEl = processElements.get(processId);
    if (processEl) {
      // Remove all status classes
      processEl.status.classList.remove('status-running', 'status-completed', 'status-failed', 'status-terminated');
      
      // Add the appropriate status class
      processEl.status.classList.add(`status-${status}`);
      processEl.status.textContent = status;
    }
  }
  
  // Automatically resize the grid items to fill available space
  function resizeGridItems() {
    const gridItems = document.querySelectorAll('.process-box');
    const gapSize = 16; // Gap size in pixels (same as 1rem in the CSS)
    
    if (gridItems.length > 0) {
      // Calculate the optimal height
      const containerHeight = processGrid.clientHeight;
      const itemsPerRow = Math.floor(processGrid.clientWidth / (300 + gapSize)); // 300px min-width
      const rows = Math.ceil(gridItems.length / itemsPerRow);
      const heightPerItem = (containerHeight - (gapSize * (rows - 1))) / rows;
      
      // Set the height of each grid item
      gridItems.forEach(item => {
        item.style.height = `${heightPerItem}px`;
      });
    }
  }
  
  // Call once on load and then on window resize
  resizeGridItems();
  window.addEventListener('resize', resizeGridItems);
});