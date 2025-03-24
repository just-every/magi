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
export interface ClientMessage {
	id: string; // Generated UUID for the message
	processId: string; // Process ID this message belongs to
	type: 'user' | 'assistant' | 'system' | 'tool_call' | 'tool_result';
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
	toolParams: Record<string, unknown>;
	command?: string; // The equivalent shell command if applicable
}

export interface ToolResultMessage extends ClientMessage {
	type: 'tool_result';
	toolName: string;
	result: unknown;
}

// Define the context interface
interface SocketContextInterface {
	socket: Socket | null;
	runCommand: (command: string) => void;
	sendProcessCommand: (processId: string, command: string) => void;
	terminateProcess: (processId: string) => void;
	processes: Map<string, ProcessData>;
	isFirstProcess: boolean;
	serverVersion: string | null;
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
	messages: ClientMessage[]; // Store structured messages
	agentName?: string; // Store the agent name when available
	isTyping: boolean; // Indicates if the agent is in "thinking" state (waiting for first response)
	parentId?: string; // ID of the parent process if this is a sub-agent
	childProcessIds: string[]; // IDs of child processes (sub-agents)
	isSubAgent: boolean; // Flag to indicate this is a sub-agent process
}

// Create the context with a default value
const SocketContext = createContext<SocketContextInterface>({
	socket: null,
	runCommand: () => {
	},
	sendProcessCommand: () => {
	},
	terminateProcess: () => {
	},
	processes: new Map<string, ProcessData>(),
	isFirstProcess: true,
	serverVersion: null
});

// Define props for the provider
interface SocketProviderProps {
	children: ReactNode;
}

// Create a provider component
export const SocketProvider: React.FC<SocketProviderProps> = ({children}) => {
	const [socket, setSocket] = useState<Socket | null>(null);
	const [processes, setProcesses] = useState<Map<string, ProcessData>>(new Map());
	const [isFirstProcess, setIsFirstProcess] = useState<boolean>(true);
	const [serverVersion, setServerVersion] = useState<string | null>(null);

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
					messages: [initialMessage],
					isTyping: true, // Start in typing state
					childProcessIds: [], // Initialize empty array for child processes
					isSubAgent: false // Default to not being a sub-agent
				});
				return newProcesses;
			});

			// If this is the first process, set isFirstProcess to false
			if (isFirstProcess) {
				setIsFirstProcess(false);
			}
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

				// Only handle plain text logs - JSON messages come through the process:message event
				// This avoids double processing and corrupted logging

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
				const messages = [...process.messages];
				const streamingEvent = data.event;
				const timestamp = streamingEvent.timestamp || new Date().toISOString();
				const eventType = streamingEvent.type;

				// Handle different event types
				if (eventType === 'command_start' || eventType === 'connected') {
					// User message - already handled in process:create but good as a fallback
					if ('command' in streamingEvent) {
						const content = streamingEvent.command || '';
						if (content && !messages.some(m => m.type === 'user' && m.content === content)) {
							messages.push({
								id: generateId(),
								processId: event.id,
								type: 'user',
								content: content,
								timestamp: timestamp,
								rawEvent: data
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
							let command = '';
							if (toolName === 'shell' || toolName === 'bash' || toolName === 'terminal') {
								// For shell commands, use the command parameter directly
								command = toolParams.command?.toString() || '';
							} else if (toolName === 'file_read' || toolName === 'read_file') {
								// For file reading tools
								command = `cat ${toolParams.path || toolParams.file_path || ''}`;
							} else if (toolName === 'file_write' || toolName === 'write_file') {
								// For file writing tools
								command = `echo '...' > ${toolParams.path || toolParams.file_path || ''}`;
							} else if (toolName === 'search' || toolName === 'web_search') {
								// For search tools
								command = `search: ${toolParams.query || ''}`;
							} else if (toolName === 'python') {
								// For Python code execution
								command = `python -c "${toolParams.code || ''}"`;
							}

							messages.push({
								id: generateId(),
								processId: event.id,
								type: 'tool_call',
								content: `Using ${toolName}`,
								timestamp: timestamp,
								toolName: toolName,
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
							
							messages.push({
								id: generateId(),
								processId: event.id,
								type: 'tool_result',
								content: `Result from ${toolName}`,
								timestamp: timestamp,
								toolName: toolName,
								result: result,
								rawEvent: data
							} as ToolResultMessage);
						}
					}
				} else if (eventType === 'message_start' || eventType === 'message_delta' ||
					eventType === 'message_complete') {
					// Assistant message
					if ('content' in streamingEvent) {
						const content = streamingEvent.content || '';
						const messageId = 'message_id' in streamingEvent ? streamingEvent.message_id : '';

						if (content) {
							// Handle streaming messages (delta/complete pairs)
							if (eventType === 'message_delta' && messageId) {
								// For delta messages, handle ordered deltas to build complete message
								const existingDeltaIndex = messages.findIndex(m =>
									m.message_id === messageId);

								// Get order if available, otherwise default to 0
								const order = 'order' in streamingEvent ? Number(streamingEvent.order) : 0;

								if (existingDeltaIndex >= 0) {
									// Get the existing message
									const existingMessage = messages[existingDeltaIndex];

									// Initialize deltaChunks if not existing
									if (!existingMessage.deltaChunks) {
										existingMessage.deltaChunks = {};
									}

									// Store this chunk at the correct order position
									existingMessage.deltaChunks[order] = content;

									// Rebuild complete content from ordered chunks
									const orderedKeys = Object.keys(existingMessage.deltaChunks)
										.map(Number)
										.sort((a, b) => a - b);

									// Concatenate all chunks in correct order
									const combinedContent = orderedKeys
										.map(key => existingMessage.deltaChunks![key])
										.join('');

									// Update the displayed content
									messages[existingDeltaIndex].content = combinedContent;
								} else {
									// Create new delta message with deltaChunks
									const deltaChunks: { [order: number]: string } = {};
									deltaChunks[order] = content;

									messages.push({
										id: generateId(),
										processId: event.id,
										type: 'assistant',
										content: content, // Initial content is just this chunk
										timestamp: timestamp,
										message_id: messageId,
										isDelta: true,
										order: order,
										deltaChunks: deltaChunks,
										rawEvent: data
									});
								}
							} else if (eventType === 'message_complete' && messageId) {
								// For complete messages, update or replace any existing delta with same message_id
								const existingIndex = messages.findIndex(m =>
									m.message_id === messageId);

								if (existingIndex >= 0) {
									// Update the existing message in place
									messages[existingIndex].content = content;
									messages[existingIndex].isDelta = false;
									messages[existingIndex].rawEvent = data;
								} else {
									// Add the complete message if no matching delta was found
									messages.push({
										id: generateId(),
										processId: event.id,
										type: 'assistant',
										content: content,
										timestamp: timestamp,
										message_id: messageId,
										rawEvent: data
									});
								}
							} else {
								// For other message types, just add normally but still include message_id if available
								messages.push({
									id: generateId(),
									processId: event.id,
									type: 'assistant',
									content: content,
									timestamp: timestamp,
									message_id: messageId || undefined, // Include message_id if available
									rawEvent: data
								});
							}
						}
					}
				} else if (eventType === 'error') {
					// Error message
					const errorMessage = 'error' in streamingEvent ? streamingEvent.error : 'An error occurred';
					messages.push({
						id: generateId(),
						processId: event.id,
						type: 'system',
						content: errorMessage,
						timestamp: timestamp,
						rawEvent: data
					});
				} else if (eventType === 'agent_start' || eventType === 'agent_updated') {
					// Extract agent information
					if (streamingEvent.agent && streamingEvent.agent.name) {
						// Update the process with agent name
						process.agentName = streamingEvent.agent.name;
					}

					// Check for parent-child relationship
					if ('parent_id' in streamingEvent && streamingEvent.parent_id) {
						const parentId = streamingEvent.parent_id;
						// Set this process as a sub-agent
						process.parentId = parentId;
						process.isSubAgent = true;

						// Update the parent process to track this as a child
						const parentProcess = newProcesses.get(parentId);
						if (parentProcess) {
							// Add this process ID to parent's childProcessIds if not already there
							if (!parentProcess.childProcessIds.includes(event.id)) {
								parentProcess.childProcessIds.push(event.id);
								newProcesses.set(parentId, parentProcess);

								// Add a system message to the parent process logs indicating sub-agent creation
								parentProcess.messages.push({
									id: generateId(),
									processId: parentId,
									type: 'system',
									content: `Started sub-agent: ${process.agentName || event.id}`,
									timestamp: new Date().toISOString()
								});
							}
						}
					}
				}

				// Turn off typing indicator for any response
				if (eventType === 'message_delta' || eventType === 'message_complete' ||
					eventType === 'tool_start' || eventType === 'tool_done') {
					process.isTyping = false;
				}

				// Update the process with the new messages
				newProcesses.set(event.id, {
					...process,
					messages: messages
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
						id: process.id,
						command: process.command,
						status: event.status,
						colors: process.colors,
						logs: process.logs,
						messages: process.messages,
						agentName: process.agentName,
						isTyping: process.isTyping,
						parentId: process.parentId,
						childProcessIds: process.childProcessIds,
						isSubAgent: process.isSubAgent
					});

					// If process is terminated, handle child processes and remove after delay
					if (event.status === 'terminated') {
						// Check if this process has child processes
						if (process.childProcessIds && process.childProcessIds.length > 0) {
							// Make a copy of the child IDs since the array might be modified during iteration
							const childIds = [...process.childProcessIds];

							// Add a system message indicating child processes will be terminated
							newProcesses.set(event.id, {
								...newProcesses.get(event.id)!,
								messages: [
									...process.messages,
									{
										id: generateId(),
										processId: event.id,
										type: 'system',
										content: `Terminating ${childIds.length} sub-agent(s)`,
										timestamp: new Date().toISOString()
									}
								]
							});

							// For each child process, terminate it or update its status
							childIds.forEach(childId => {
								const childProcess = newProcesses.get(childId);
								if (childProcess) {
									// Update the child process to show it's being terminated with the parent
									newProcesses.set(childId, {
										...childProcess,
										status: 'ending',
										messages: [
											...childProcess.messages,
											{
												id: generateId(),
												processId: childId,
												type: 'system',
												content: `Parent process ${event.id} terminated, terminating this sub-agent`,
												timestamp: new Date().toISOString()
											}
										]
									});

									// Notify server to terminate the child process
									if (socket) {
										socket.emit('process:terminate', childId);
									}
								}
							});
						}

						// If this is a sub-agent, update the parent's childProcessIds
						if (process.isSubAgent && process.parentId) {
							const parentProcess = newProcesses.get(process.parentId);
							if (parentProcess) {
								// Remove this process from parent's childProcessIds
								const updatedChildIds = parentProcess.childProcessIds.filter(id => id !== event.id);
								newProcesses.set(process.parentId, {
									...parentProcess,
									childProcessIds: updatedChildIds
								});
							}
						}

						// Remove the process after animation delay
						setTimeout(() => {
							setProcesses(prevProcesses => {
								const updatedProcesses = new Map(prevProcesses);
								updatedProcesses.delete(event.id);

								// If there are no more processes, show the centered input again
								if (updatedProcesses.size === 0) {
									setIsFirstProcess(true);
								}

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
			setTimeout(() => {
				if (processes.size > 0) {
					setIsFirstProcess(false);
				}
			}, 100);
		});

		// Clean up on unmount
		return () => {
			// Disconnect the socket
			socketInstance.disconnect();
		};
	}, [serverVersion]);

	// Define command functions
	const runCommand = (command: string) => {
		if (socket && command.trim()) {
			socket.emit('command:run', command);

			// If this is the first process, set isFirstProcess to false
			if (isFirstProcess) {
				setIsFirstProcess(false);
			}
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

					newProcesses.set(processId, {
						...process,
						messages: [...process.messages, userMessage]
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
		terminateProcess,
		processes,
		isFirstProcess,
		serverVersion
	};

	return (
		<SocketContext.Provider value={contextValue}>
			{children}
		</SocketContext.Provider>
	);
};

// Create a custom hook for using the socket context
export const useSocket = () => useContext(SocketContext);