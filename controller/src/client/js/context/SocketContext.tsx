import * as React from 'react';
import {createContext, useContext, useState, useEffect, ReactNode} from 'react';
import io from 'socket.io-client';
import {
	ProcessCreateEvent,
	ProcessLogsEvent,
	ProcessUpdateEvent,
	ProcessCommandEvent,
	ProcessMessageEvent,
	ProcessStatus
} from '@types';

// Define the type for the Socket.io socket
// Using a basic interface for Socket.io instance
interface Socket {
	emit: (event: string, ...args: unknown[]) => void;
	on: (event: string, callback: (...args: unknown[]) => void) => void;
	disconnect: () => void;
}


// Define message interfaces for the chat UI
export interface PartialClientMessage {
	id?: string; // Generated UUID for the message
	processId?: string; // Process ID this message belongs to
	type?: 'user' | 'assistant' | 'system' | 'tool_call' | 'tool_result' | 'error';
	content?: string;
	timestamp?: string;
	rawEvent?: unknown; // Store the raw event data for debugging
	message_id?: string; // Original message_id from the LLM for delta/complete pairs
	isDelta?: boolean; // Flag to indicate if this is a delta message that will be replaced by a complete
	order?: number; // Order position for delta messages
	deltaChunks?: { [order: number]: string }; // Storage for message delta chunks
}

// Define message interfaces for the chat UI
export interface ClientMessage {
	id: string; // Generated UUID for the message
	processId: string; // Process ID this message belongs to
	type: 'user' | 'assistant' | 'system' | 'tool_call' | 'tool_result' | 'error';
	content: string;
	timestamp: string;
	rawEvent?: unknown; // Store the raw event data for debugging
	message_id?: string; // Original message_id from the LLM for delta/complete pairs
	isDelta?: boolean; // Flag to indicate if this is a delta message that will be replaced by a complete
	order?: number; // Order position for delta messages
	deltaChunks?: { [order: number]: string }; // Storage for message delta chunks
}

export interface ToolCallMessage extends ClientMessage {
	type: 'tool_call';
	toolName: string;
	toolCallId: string;
	toolParams: Record<string, unknown>;
	command?: string; // The equivalent shell command if applicable
}

export interface ToolResultMessage extends ClientMessage {
	type: 'tool_result';
	toolName: string;
	toolCallId: string;
	result: unknown;
}

// Define the context interface
interface SocketContextInterface {
	socket: Socket | null;
	runCommand: (command: string) => void;
	sendProcessCommand: (processId: string, command: string) => void;
	sendCoreCommand: (command: string) => void;
	terminateProcess: (processId: string) => void;
	processes: Map<string, ProcessData>;
	serverVersion: string | null;
	coreProcessId: string | null;
}

export interface AgentData {
	agent_id?: string;
	name: string;
	parent?: AgentData;
	workers?: Map<string, AgentData>; // Map of workers by their agent_id
	model?: string;
	modelClass?: string;
	messages: ClientMessage[]; // Store structured messages
	isTyping?: boolean; // Indicates if the agent is in "thinking" state
}

// Define the process data structure
export interface ProcessData {
	id: string;
	command: string;
	status: ProcessStatus;
	colors: {
		rgb: string;
		bgColor: string;
		textColor: string;
	};
	logs: string;
	agent?: AgentData;
}

// Create the context with a default value
const SocketContext = createContext<SocketContextInterface>({
	socket: null,
	runCommand: () => {},
	sendProcessCommand: () => {},
	sendCoreCommand: () => {},
	terminateProcess: () => {},
	processes: new Map<string, ProcessData>(),
	serverVersion: null,
	coreProcessId: null,
});

// Define props for the provider
interface SocketProviderProps {
	children: ReactNode;
}

// Create a provider component
export const SocketProvider: React.FC<SocketProviderProps> = ({children}) => {
	const [socket, setSocket] = useState<Socket | null>(null);
	const [processes, setProcesses] = useState<Map<string, ProcessData>>(new Map());
	const [serverVersion, setServerVersion] = useState<string | null>(null);
	const [coreProcessId, setCoreProcessId] = useState<string | null>(null);

	// Initialize socket connection
	useEffect(() => {
		// Cast to Socket type since we know the interface matches our needs
		const socketInstance = io() as unknown as Socket;
		setSocket(socketInstance);

		// Set up event listeners
		socketInstance.on('server:info', (data: { version: string }) => {
			// If we have a previous version and it's different from current version,
			// and this is a server restart, reload the page to get the latest code
			if (serverVersion && serverVersion !== data.version) {
				console.log('Server was restarted. Reloading page to get latest code...');
				window.location.reload();
				return;
			}

			setServerVersion(data.version);
		});

		socketInstance.on('process:create', (event: ProcessCreateEvent) => {
			setProcesses(prevProcesses => {
				const newProcesses = new Map(prevProcesses);

				// Create initial user message from the command
				const initialMessage: ClientMessage = {
					id: generateId(),
					processId: event.id,
					type: 'user',
					content: event.command,
					timestamp: new Date().toISOString()
				};

				newProcesses.set(event.id, {
					id: event.id,
					command: event.command,
					status: event.status,
					colors: event.colors,
					logs: '',
					agent: {
						name: event.id,
						messages: [initialMessage],
						isTyping: true,
						workers: new Map<string, AgentData>(),
					},
				});

				// Set the core process ID if this is the first process created
				if (newProcesses.size === 1 || !coreProcessId) {
					setCoreProcessId(event.id);
					console.log(`Setting core process ID to ${event.id}`);
				}

				return newProcesses;
			});
		});

		// Helper function to generate unique IDs
		const generateId = (): string => {
			return Math.random().toString(36).substring(2, 15) +
				Math.random().toString(36).substring(2, 15);
		};

		// Still keep the logs event for basic log information (non-JSON)
		socketInstance.on('process:logs', (event: ProcessLogsEvent) => {
			setProcesses(prevProcesses => {
				const newProcesses = new Map(prevProcesses);
				const process = newProcesses.get(event.id);
				if (!process) return newProcesses;

				// Add the raw logs
				const updatedLogs = process.logs + event.logs;

				// Update the process with new logs only
				newProcesses.set(event.id, {
					...process,
					logs: updatedLogs
				});

				return newProcesses;
			});
		});

		// Handle structured messages from containers via the dedicated channel
		socketInstance.on('process:message', (event: ProcessMessageEvent) => {
			setProcesses(prevProcesses => {
				const newProcesses = new Map(prevProcesses);
				const process = newProcesses.get(event.id);

				if (!process) return newProcesses;

				// Use the imported MagiMessage structure
				const data = event.message;
				const streamingEvent = data.event;
				const timestamp = streamingEvent.timestamp || new Date().toISOString();
				const eventType = streamingEvent.type;

				function updateAgent(values: Record<string, unknown>, agent_id?: string, agent?: AgentData): AgentData {
					agent_id = agent_id || streamingEvent.agent.agent_id;
					const updatedAgent = agent || process.agent;
					if (updatedAgent.agent_id === agent_id) {
						Object.assign(updatedAgent, values);
					} else if (updatedAgent.workers) {
						const updatedWorkers = new Map();
						updatedAgent.workers.forEach((worker, workerId) => {
							updatedWorkers.set(workerId, updateAgent(values, agent_id, worker));
						});
						updatedAgent.workers = updatedWorkers;
					}
					if(!agent) {
						process.agent = updatedAgent;
					}
					return updatedAgent;
				}

				function addMessage(message: ClientMessage, agent_id?: string, agent?: AgentData): AgentData {
					agent_id = agent_id || streamingEvent.agent.agent_id;
					const updatedAgent = agent || process.agent;
					if (updatedAgent.agent_id === agent_id) {
						updatedAgent.messages.push(message);
					} else if (updatedAgent.workers) {
						const updatedWorkers = new Map();
						updatedAgent.workers.forEach((worker, workerId) => {
							updatedWorkers.set(workerId, addMessage(message, agent_id, worker));
						});
						updatedAgent.workers = updatedWorkers;
					}
					if(!agent) {
						process.agent = updatedAgent;
					}
					return updatedAgent;
				}

				function completeMessage(message: PartialClientMessage): ClientMessage {
					return {
						id: generateId(),
						processId: event.id,
						type: message.type || 'system',
						content: message.content || '',
						timestamp: message.timestamp || timestamp,
						rawEvent: message.rawEvent || data,
						...message
					} as ClientMessage;
				}

				function addPartialMessage(message: PartialClientMessage): AgentData {
					return addMessage(completeMessage(message));
				}

				// Handle different event types
				if (eventType === 'command_start' || eventType === 'connected') {
					// User message - already handled in process:create but good as a fallback
					if ('command' in streamingEvent) {
						const content = streamingEvent.command || '';
						if (content && !process.agent.messages.some(m => m.type === 'user' && m.content === content)) {
							addPartialMessage({
								type: 'user',
								content: content
							});
						}
					}
				} else if (eventType === 'tool_start') {
					// Tool call message
					if ('tool_calls' in streamingEvent) {
						const toolCalls = streamingEvent.tool_calls || [];
						for (const toolCall of toolCalls) {
							const toolName = toolCall.function.name;
							let toolParams: Record<string, unknown> = {};
							try {
								toolParams = JSON.parse(toolCall.function.arguments);
							} catch (e) {
								console.error('Error parsing tool arguments:', e);
							}

							// Generate command representation for certain tool types
							let command: string = '';
							['prompt', 'input', 'command', 'message'].forEach(
								(param: string) => {
									if (!command && param in toolParams && typeof toolParams[param] === 'string') {
										command = toolParams[param];
									}
								}
							);

							addMessage({
								id: generateId(),
								processId: event.id,
								type: 'tool_call',
								content: `Using ${toolName}`,
								timestamp: timestamp,
								toolName: toolName,
								toolCallId: toolCall.id,
								toolParams: toolParams,
								command: command,
								rawEvent: data
							} as ToolCallMessage);
						}
					}
				} else if (eventType === 'tool_done') {
					// Tool result message
					if ('tool_calls' in streamingEvent && 'results' in streamingEvent) {
						const toolCalls = streamingEvent.tool_calls || [];
						const results = streamingEvent.results || {};

						for (const toolCall of toolCalls) {
							const toolName = toolCall.function.name;
							const result = results[toolCall.id] || {};

							addMessage({
								id: generateId(),
								processId: event.id,
								type: 'tool_result',
								content: `Result from ${toolName}`,
								timestamp: timestamp,
								toolName: toolName,
								toolCallId: toolCall.id,
								result: result,
								rawEvent: data
							} as ToolResultMessage);
						}
					}
				} else if (eventType === 'message_start' || eventType === 'message_delta' || eventType === 'message_complete' || eventType === 'talk_start' || eventType === 'talk_delta' || eventType === 'talk_complete') {
					// Assistant message
					if ('content' in streamingEvent && 'message_id' in streamingEvent) {
						const content = streamingEvent.content || '';
						const message_id = streamingEvent.message_id || '';

						if (content && message_id) {
							let existingMessage = undefined;
							process.agent.messages.forEach(message => {
								if (message.message_id === message_id) {
									existingMessage = message;
								}
							});
							if(!existingMessage && process.agent.workers) {
								process.agent.workers.forEach(worker => {
									worker.messages.forEach(message => {
										if (message.message_id === message_id) {
											existingMessage = message;
										}
									});
								});
							}
							const updatedMessage: PartialClientMessage = {
								type: 'assistant',
								content: content,
								message_id: message_id,
								deltaChunks: {},
								...existingMessage
							};

							// Handle streaming messages (delta/complete pairs)
							if (eventType === 'message_delta') {
								// Get order if available, otherwise default to 0
								const order = 'order' in streamingEvent ? Number(streamingEvent.order) : 0;
								updatedMessage.deltaChunks[order] = content;
								updatedMessage.isDelta = true;

								if (existingMessage) {
									// Rebuild complete content from ordered chunks
									const orderedKeys = Object.keys(updatedMessage.deltaChunks)
										.map(Number)
										.sort((a, b) => a - b);

									// Update the displayed content
									updatedMessage.content = orderedKeys
										.map(key => updatedMessage.deltaChunks![key])
										.join('');
								}
							} else if ((eventType === 'message_complete' || eventType === 'talk_complete') && existingMessage) {
								// Update the existing message in place
								updatedMessage.content = content;
								updatedMessage.isDelta = false;
								updatedMessage.rawEvent = data;
							}

							if(existingMessage) {
								// Update in agent's messages array
								process.agent.messages.forEach((message, index) => {
									if (message.message_id === message_id) {
										process.agent.messages[index] = completeMessage(updatedMessage);
									}
								});

								// Update in workers' messages
								if(process.agent.workers) {
									// Correctly iterate over a Map
									process.agent.workers.forEach((worker) => {
										worker.messages.forEach((message, messageIndex) => {
											if (message.message_id === message_id) {
												worker.messages[messageIndex] = completeMessage(updatedMessage);
											}
										});
									});
								}
							}
							else {
								// If this is a new message, add it to the agent's messages
								addPartialMessage(updatedMessage);
							}
						}
					}
				} else if (eventType === 'error') {
					// Error message
					const errorMessage = 'error' in streamingEvent ? streamingEvent.error : 'An error occurred';
					addPartialMessage({
						type: 'error',
						content: errorMessage
					});
				} else if (eventType === 'agent_start' || eventType === 'agent_updated') {
					console.log(`[DEBUG] Processing ${eventType} event for process ${event.id}`);

					// Check for parent-child relationship
					if (streamingEvent.agent && streamingEvent.agent.parent && streamingEvent.agent.parent.agent_id) {
						// Generate a unique ID for the sub-agent
						const workerId = streamingEvent.agent.agent_id;
						console.log(`[DEBUG] Creating sub-agent with ID: ${workerId}`);

						// Add the sub-agent to the parent process's subAgents map
						if (!process.agent.workers.has(workerId)) {
							console.log(`[DEBUG] Adding sub-agent ${workerId} to parent process ${event.id}`);
							// Create a new sub-agent data object
							const worker: AgentData = {
								agent_id: workerId,
								parent: process.agent,
								name: streamingEvent.agent.name || workerId,
								messages: [completeMessage({
									content: streamingEvent.input || `Worker for ${process.agent.name || process.id}`,
								})],
								isTyping: true,
								workers: new Map<string, AgentData>(),
								model: streamingEvent.agent.model || undefined,
								modelClass: streamingEvent.agent.modelClass || undefined,
							};

							// Add this sub-agent to the parent's subAgents map
							process.agent.workers.set(workerId, worker);
						}
						else if(streamingEvent.input) {
							addPartialMessage({
								content: streamingEvent.input,
							});
						}
					}
					else if (streamingEvent.agent) {
						if(!process.agent.agent_id || process.agent.agent_id != process.agent.agent_id) {
							process.agent.agent_id = streamingEvent.agent.agent_id;
						}
						updateAgent({
							name: streamingEvent.agent.name,
							model: streamingEvent.agent.model || undefined,
							modelClass: streamingEvent.agent.modelClass || undefined,
						});
						console.log(`[DEBUG] Agent set: ${process.agent.name} (${process.agent.agent_id}) for process ${event.id}`);
					}
				}

				// Turn off typing indicator for any response
				if (eventType === 'message_delta' || eventType === 'message_complete' ||
					eventType === 'tool_start' || eventType === 'tool_done') {
					updateAgent({isTyping: false});
				}

				// Update the process with the new messages
				newProcesses.set(event.id, {
					...process,
				});

				return newProcesses;
			});
		});

		socketInstance.on('process:update', (event: ProcessUpdateEvent) => {
			setProcesses(prevProcesses => {
				const newProcesses = new Map(prevProcesses);
				const process = newProcesses.get(event.id);

				console.log(`${event.id} Received process:update`, event);

				if (process) {
					// Update the status
					newProcesses.set(event.id, {
						...process,
						status: event.status,
					});

					// If process is terminated, handle sub-agents and remove after delay
					if (event.status === 'terminated') {
						// If this was the core process, we should find a new one
						if (event.id === coreProcessId) {
							// Find the first non-terminated process to be the new core
							const remainingProcesses = Array.from(newProcesses.entries())
								.filter(([id, p]) => id !== event.id && p.status !== 'terminated');

							if (remainingProcesses.length > 0) {
								const newCoreId = remainingProcesses[0][0];
								console.log(`Core process ${coreProcessId} terminated, setting new core to ${newCoreId}`);
								setCoreProcessId(newCoreId);
							} else {
								console.log(`Core process ${coreProcessId} terminated, no remaining processes`);
								setCoreProcessId(null);
							}
						}

						// Remove the process after animation delay
						setTimeout(() => {
							setProcesses(prevProcesses => {
								const updatedProcesses = new Map(prevProcesses);
								updatedProcesses.delete(event.id);

								return updatedProcesses;
							});
						}, 1200); // Same delay as in ProcessUI
					}
				}

				return newProcesses;
			});
		});

		socketInstance.on('connect', () => {
			// Wait a bit to make sure we've received any existing processes
		});

		// Clean up on unmount
		return () => {
			// Disconnect the socket
			socketInstance.disconnect();
		};
	}, [serverVersion, coreProcessId]);

	// Define command functions
	const runCommand = (command: string) => {
		if (socket && command.trim()) {
			socket.emit('command:run', command);
		}
	};

	const sendProcessCommand = (processId: string, command: string) => {
		if (socket && command.trim()) {
			// Add the command as a user message immediately
			setProcesses(prevProcesses => {
				const newProcesses = new Map(prevProcesses);
				const process = newProcesses.get(processId);

				if (process) {
					const userMessage: ClientMessage = {
						id: generateId(),
						processId: processId,
						type: 'user',
						content: command,
						timestamp: new Date().toISOString()
					};
					process.agent.messages.push(userMessage);

					newProcesses.set(processId, {
						...process,
					});
				}

				return newProcesses;
			});

			// Send the command to the server
			socket.emit('process:command', {
				processId,
				command
			} as ProcessCommandEvent);
		}
	};

	// Function to send a command always to the core process
	const sendCoreCommand = (command: string) => {
		if (coreProcessId) {
			sendProcessCommand(coreProcessId, command);
		} else if (processes.size > 0) {
			// Find the first active process if core isn't set
			const firstProcessId = Array.from(processes.keys())[0];
			sendProcessCommand(firstProcessId, command);
			// Also update the core process ID
			setCoreProcessId(firstProcessId);
		} else {
			// If no processes, create a new one
			runCommand(command);
		}
	};

	// Helper function to generate unique IDs
	const generateId = (): string => {
		return Math.random().toString(36).substring(2, 15) +
			Math.random().toString(36).substring(2, 15);
	};

	const terminateProcess = (processId: string) => {
		if (socket) {
			socket.emit('process:terminate', processId);
		}
	};

	// Provide context value
	const contextValue: SocketContextInterface = {
		socket,
		runCommand,
		sendProcessCommand,
		sendCoreCommand,
		terminateProcess,
		processes,
		serverVersion,
		coreProcessId
	};

	return (
		<SocketContext.Provider value={contextValue}>
			{children}
		</SocketContext.Provider>
	);
};

// Create a custom hook for using the socket context
export const useSocket = () => useContext(SocketContext);
