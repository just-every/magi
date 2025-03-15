"use strict";
document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const processGrid = document.getElementById('process-grid');
    const mainHeader = document.getElementById('main-header');
    const commandForm = document.getElementById('command-form');
    const commandInput = document.getElementById('command-input');
    const centerInputContainer = document.getElementById('center-input-container');
    const centerCommandForm = document.getElementById('center-command-form');
    const centerCommandInput = document.getElementById('center-command-input');
    const processTemplate = document.getElementById('process-template');
    const processElements = new Map();
    let isFirstProcess = true;
    function handleCommandSubmission(command) {
        if (command) {
            socket.emit('command:run', command);
            if (isFirstProcess) {
                isFirstProcess = false;
                animateInitialTransition();
            }
        }
    }
    commandForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const command = commandInput.value.trim();
        handleCommandSubmission(command);
        commandInput.value = '';
    });
    centerCommandForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const command = centerCommandInput.value.trim();
        handleCommandSubmission(command);
        centerCommandInput.value = '';
    });
    commandInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            const command = commandInput.value.trim();
            handleCommandSubmission(command);
            commandInput.value = '';
        }
    });
    centerCommandInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            const command = centerCommandInput.value.trim();
            handleCommandSubmission(command);
            centerCommandInput.value = '';
        }
    });
    function animateInitialTransition() {
        mainHeader.style.opacity = '1';
        mainHeader.style.transform = 'translateY(0)';
        centerInputContainer.style.opacity = '0';
        setTimeout(() => {
            centerInputContainer.style.display = 'none';
            commandInput.focus();
        }, 500);
    }
    socket.on('process:create', (process) => {
        createProcessBox(process);
    });
    socket.on('process:logs', (data) => {
        appendLogs(data.id, data.logs);
    });
    socket.on('process:update', (data) => {
        updateProcessStatus(data.id, data.status);
    });
    function createProcessBox(process) {
        const clone = document.importNode(processTemplate.content, true);
        const processBox = clone.querySelector('.process-box');
        const processId = clone.querySelector('.process-id');
        const processStatus = clone.querySelector('.process-status');
        const processTerminate = clone.querySelector('.process-terminate');
        processBox.id = `process-${process.id}`;
        processId.textContent = process.id;
        processGrid.appendChild(clone);
        const processInputContainer = processBox.querySelector('.process-input-container');
        const processInputForm = processBox.querySelector('.process-input-form');
        const processInput = processBox.querySelector('.process-input');
        processElements.set(process.id, {
            box: processBox,
            logs: processBox.querySelector('.process-logs'),
            status: processStatus,
            input: processInput
        });
        updateProcessStatus(process.id, process.status);
        processBox.addEventListener('click', (event) => {
            document.querySelectorAll('.process-box').forEach(box => {
                box.classList.remove('focused');
            });
            processBox.classList.add('focused');
            const clickedElement = event.target;
            const isClickingInput = clickedElement.classList.contains('process-input') ||
                clickedElement.closest('.process-input-container') !== null;
            if (isClickingInput && processInput) {
                setTimeout(() => processInput.focus(), 0);
            }
        });
        processInput.addEventListener('input', function () {
            this.style.height = 'auto';
            const newHeight = Math.min(Math.max(this.scrollHeight, 40), 120);
            this.style.height = newHeight + 'px';
        });
        processInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && event.shiftKey) {
                event.preventDefault();
                const pos = processInput.selectionStart || 0;
                const value = processInput.value;
                processInput.value = value.substring(0, pos) + '\n' + value.substring(pos);
                processInput.selectionStart = processInput.selectionEnd = pos + 1;
                processInput.dispatchEvent(new Event('input'));
                return false;
            }
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                processInputForm.dispatchEvent(new Event('submit'));
                return false;
            }
        });
        processInputForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const command = processInput.value.trim();
            if (command) {
                socket.emit('process:command', {
                    processId: process.id,
                    command: command
                });
                processInput.value = '';
                processInput.style.height = 'auto';
                appendLogs(process.id, `> ${command}`);
            }
        });
        processTerminate.addEventListener('click', () => {
            if (processTerminate.disabled)
                return;
            processTerminate.disabled = true;
            const processEl = processElements.get(process.id);
            if (processEl) {
                processTerminate.style.display = 'none';
                processEl.status.textContent = 'ENDING...';
                processEl.status.classList.remove('status-running', 'status-completed', 'status-failed', 'status-terminated', 'status-ending');
                processEl.status.classList.add('status-ending');
                const failsafeTimer = setTimeout(() => {
                    if (processEl.status.textContent === 'ENDING...') {
                        updateProcessStatus(process.id, 'terminated');
                    }
                }, 10000);
                processEl.box.dataset.failsafeTimer = String(failsafeTimer);
            }
            socket.emit('process:terminate', process.id);
        });
        updateGridLayout();
        animateNewProcess(processBox);
    }
    function appendLogs(processId, logData) {
        const processEl = processElements.get(processId);
        if (processEl) {
            const formattedLogData = logData.replace(/\n/g, '\n\n');
            const html = marked.parse(formattedLogData);
            const temp = document.createElement('div');
            temp.innerHTML = html;
            while (temp.firstChild) {
                processEl.logs.appendChild(temp.firstChild);
            }
            processEl.logs.scrollTop = processEl.logs.scrollHeight;
        }
    }
    function updateProcessStatus(processId, status) {
        const processEl = processElements.get(processId);
        if (processEl) {
            processEl.status.classList.remove('status-running', 'status-completed', 'status-failed', 'status-terminated', 'status-ending');
            processEl.status.classList.add(`status-${status}`);
            processEl.status.textContent = status;
            if (status === 'terminated') {
                processEl.status.textContent = 'ENDED';
                const terminateButton = processEl.box.querySelector('.process-terminate');
                if (terminateButton) {
                    terminateButton.style.display = 'none';
                }
                if (processEl.box.dataset.failsafeTimer) {
                    clearTimeout(parseInt(processEl.box.dataset.failsafeTimer, 10));
                    delete processEl.box.dataset.failsafeTimer;
                }
                setTimeout(() => {
                    processEl.box.style.animation = 'fadeOutRemove 1.5s ease-out forwards';
                }, 500);
                setTimeout(() => {
                    if (processEl.box.parentNode) {
                        processEl.box.parentNode.removeChild(processEl.box);
                    }
                    processElements.delete(processId);
                    updateGridLayout();
                    if (processElements.size === 0) {
                        isFirstProcess = true;
                        mainHeader.style.opacity = '0';
                        mainHeader.style.transform = 'translateY(-100%)';
                        centerInputContainer.style.display = 'block';
                        setTimeout(() => {
                            centerInputContainer.style.opacity = '1';
                            centerCommandInput.focus();
                        }, 10);
                    }
                }, 2000);
            }
        }
    }
    function updateGridLayout() {
        const processBoxes = document.querySelectorAll('.process-box');
        const count = processBoxes.length;
        if (count === 0)
            return;
        processGrid.style.gridTemplateColumns = '';
        processGrid.style.gridTemplateRows = '';
        processBoxes.forEach(box => {
            box.style.gridArea = '';
        });
        if (count === 1) {
            processGrid.style.gridTemplateColumns = '1fr';
            processGrid.style.gridTemplateRows = '1fr';
        }
        else if (count === 2) {
            processGrid.style.gridTemplateColumns = '1fr 1fr';
            processGrid.style.gridTemplateRows = '1fr';
        }
        else if (count === 3) {
            processGrid.style.gridTemplateColumns = '1fr 1fr';
            processGrid.style.gridTemplateRows = '1fr 1fr';
            const boxes = Array.from(processBoxes);
            boxes[2].style.gridColumn = '1 / span 2';
        }
        else if (count === 4) {
            processGrid.style.gridTemplateColumns = '1fr 1fr';
            processGrid.style.gridTemplateRows = '1fr 1fr';
        }
        else if (count === 5) {
            processGrid.style.gridTemplateColumns = '1fr 1fr';
            processGrid.style.gridTemplateRows = '1fr 1fr 1fr';
            const boxes = Array.from(processBoxes);
            boxes[4].style.gridColumn = '1 / span 2';
        }
        else if (count === 6) {
            processGrid.style.gridTemplateColumns = '1fr 1fr 1fr';
            processGrid.style.gridTemplateRows = '1fr 1fr';
        }
        else {
            const cols = Math.ceil(Math.sqrt(count));
            const rows = Math.ceil(count / cols);
            processGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
            processGrid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        }
    }
    function animateNewProcess(processBox) {
        const allBoxes = document.querySelectorAll('.process-box');
        allBoxes.forEach(box => {
            box.style.animation = 'none';
            void box.offsetWidth;
            box.style.animation = 'gridTransition 0.5s ease-out';
        });
        processBox.style.animation = 'splitFadeIn 0.5s ease-out';
    }
    updateGridLayout();
    window.addEventListener('resize', updateGridLayout);
    socket.on('connect', () => {
        setTimeout(() => {
            const processCount = processElements.size;
            if (processCount > 0) {
                isFirstProcess = false;
                mainHeader.style.opacity = '1';
                mainHeader.style.transform = 'translateY(0)';
                centerInputContainer.style.opacity = '0';
                centerInputContainer.style.display = 'none';
            }
            else {
                centerCommandInput.focus();
            }
        }, 100);
    });
});
//# sourceMappingURL=client.js.map