/**
 * MAGI System Client-Side Application
 * Handles UI interactions and WebSocket communication with the server
 */
import { UIManager } from './js/ui/UIManager';
import { SocketManager } from './js/managers/SocketManager';

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const mainHeader = document.getElementById('main-header') as HTMLElement;
  const commandForm = document.getElementById('command-form') as HTMLFormElement;
  const commandInput = document.getElementById('command-input') as HTMLInputElement;
  const centerInputContainer = document.getElementById('center-input-container') as HTMLElement;
  const centerCommandForm = document.getElementById('center-command-form') as HTMLFormElement;
  const centerCommandInput = document.getElementById('center-command-input') as HTMLInputElement;
  const processTemplate = document.getElementById('process-template') as HTMLTemplateElement;

  // Initialize the UI Manager
  const uiManager = new UIManager(
    processTemplate,
    mainHeader,
    centerInputContainer,
    commandInput,
    centerCommandInput,
    commandForm,
    centerCommandForm,
    (command) => socketManager.runCommand(command),
    (processId, command) => socketManager.sendProcessCommand(processId, command),
    (processId) => socketManager.terminateProcess(processId)
  );

  // Initialize the Socket Manager
  const socketManager = new SocketManager({
    onServerInfo: (version) => uiManager.handleServerInfo(version),
    onProcessCreate: (event) => uiManager.handleProcessCreate(
        event,
        (processId) => socketManager.terminateProcess(processId),
        (processId, command) => socketManager.sendProcessCommand(processId, command)
    ),
    onProcessLogs: (event) => uiManager.handleProcessLogs(event),
    onProcessUpdate: (event) => uiManager.handleProcessUpdate(event),
    onConnect: () => uiManager.handleConnect()
  });

  // Don't focus input immediately - the connection handler will determine the right input to focus
});
