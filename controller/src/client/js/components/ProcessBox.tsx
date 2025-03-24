import * as React from 'react';
import {useState, useRef, useEffect} from 'react';
import {marked} from 'marked';
import {ProcessStatus} from '@types';
import {useSocket, ClientMessage, ToolCallMessage, ToolResultMessage} from '../context/SocketContext';

interface ProcessBoxProps {
	id: string;
	command: string;
	status: ProcessStatus;
	colors: {
		rgb: string;
		bgColor: string;
		textColor: string;
	};
	logs: string;
	focused: boolean;
	onFocus: (id: string) => void;
}

// Interface for tool information
interface Tool {
	name: string;
	description: string;
}

const ProcessBox: React.FC<ProcessBoxProps> = ({
	id,
	status,
	colors,
	logs,
	focused,
	onFocus
}) => {
	const {sendProcessCommand, terminateProcess, processes} = useSocket();
	const [inputValue, setInputValue] = useState('');
	const [tools, setTools] = useState<Tool[]>([]);
	const logsRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const inputFormRef = useRef<HTMLFormElement>(null);

	// Get data directly from the socket context
	const process = processes.get(id);
	const messages = process ? process.messages : [];
	const agentName = process?.agentName;
	const isTyping = process?.isTyping || false;
	const isSubAgent = process?.isSubAgent || false;
	const hasChildProcesses = process?.childProcessIds?.length > 0 || false;

	// Extract tools information from logs
	useEffect(() => {
		if (!logs) return;

		const toolRegex = /Tool: ([^\n]+)\nDescription: ([^\n]+)/g;
		const extractedTools: Tool[] = [];

		let match;
		while ((match = toolRegex.exec(logs)) !== null) {
			extractedTools.push({
				name: match[1],
				description: match[2]
			});
		}

		if (extractedTools.length > 0) {
			setTools(extractedTools);
		}
	}, [logs]);

	// Parse markdown for logs
	const createMarkup = (content: string) => {
		try {
			// Ensure that newlines are preserved before markdown parsing
			const formattedContent = content.replace(/\n/g, '\n\n');
			return {__html: marked.parse(formattedContent)};
		} catch (e) {
			return {__html: content};
		}
	};

	// Handle form submission
	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		if (inputValue.trim()) {
			sendProcessCommand(id, inputValue);
			setInputValue('');
		}
	};

	// Handle key down events
	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		// Allow shift+enter for newlines
		if (e.key === 'Enter' && e.shiftKey) {
			e.preventDefault();

			// Insert a newline at cursor position
			const pos = e.currentTarget.selectionStart || 0;
			const value = inputValue;
			setInputValue(value.substring(0, pos) + '\n' + value.substring(pos));

			// Set cursor position after the newline (needs setTimeout to work)
			setTimeout(() => {
				if (inputRef.current) {
					inputRef.current.selectionStart = inputRef.current.selectionEnd = pos + 1;
				}
			}, 0);
		}
		// Enter without shift submits
		else if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			inputFormRef.current?.dispatchEvent(new Event('submit', {cancelable: true, bubbles: true}));
		}
	};

	// Auto-resize input based on content
	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setInputValue(e.target.value);

		// Reset height to get the right scrollHeight
		e.target.style.height = 'auto';

		// Set new height based on scrollHeight
		const newHeight = Math.min(Math.max(e.target.scrollHeight, 40), 120); // Between 40px and 120px
		e.target.style.height = newHeight + 'px';
	};

	// Handle terminate button click
	const handleTerminate = () => {
		terminateProcess(id);
	};

	// Handle click on process box
	const handleBoxClick = (e: React.MouseEvent<HTMLDivElement>) => {
		// Check what was clicked
		const target = e.target as HTMLElement;

		// Check if clicking on input area
		const isClickingInput =
			target.classList.contains('process-input') ||
			!!target.closest('.process-input-container');

		// Check if clicking on header controls
		const isClickingControls =
			target.classList.contains('process-status') ||
			target.classList.contains('process-terminate') ||
			!!target.closest('.process-terminate');

		if (isClickingInput && inputRef.current) {
			// Focus the input if clicking on input area
			setTimeout(() => inputRef.current?.focus(), 0);
		} else if (!isClickingControls) {
			// If clicking anywhere else except controls, zoom to 100% and center
			onFocus(id);
		}
	};

	// Scroll to bottom of logs when they update
	useEffect(() => {
		if (logsRef.current) {
			logsRef.current.scrollTop = logsRef.current.scrollHeight;
		}
	}, [logs, messages]);

	// Get CSS class for status
	const getStatusClass = () => {
		switch (status) {
			case 'running':
				return 'status-running bg-light';
			case 'completed':
				return 'status-completed bg-success';
			case 'failed':
				return 'status-failed bg-warning';
			case 'ending':
			case 'terminated':
				return 'status-terminated bg-danger';
			default:
				return 'status-running bg-light';
		}
	};

	// Render tool list if any tools are available
	const renderTools = () => {
		if (tools.length === 0) return null;

		return (
			<div className="tool-list mt-2 mb-3">
				<h6 className="tool-header mb-2">Available Tools:</h6>
				<div className="row">
					{tools.map((tool, index) => (
						<div className="col-md-6 mb-1" key={index}>
							<div className="tool-item">
								<span className="tool-name fw-bold">{tool.name}:</span>
								<span className="tool-description ms-1">{tool.description}</span>
							</div>
						</div>
					))}
				</div>
			</div>
		);
	};

	// Render chat messages in iOS-style bubbles
	const renderMessages = () => {
		if (messages.length === 0) {
			// If no JSON messages found, display raw logs
			return <div className="raw-logs" dangerouslySetInnerHTML={createMarkup(logs)}/>;
		}

		// Group messages by message_id to handle delta/complete pairs
		const messageMap = new Map<string, ClientMessage>();

		// Process messages to ensure we only show one instance per message_id
		messages.forEach(message => {
			const messageId = message.message_id;

			// For messages with message_id (like LLM responses)
			if (messageId) {
				// If it's a complete message (not a delta), or we don't have this message yet
				if (!message.isDelta || !messageMap.has(messageId)) {
					messageMap.set(messageId, message);
				}
					// If it's a delta and we already have a message with this ID,
				// only update if the existing one is also a delta
				else if (message.isDelta) {
					const existingMessage = messageMap.get(messageId);
					if (existingMessage && existingMessage.isDelta) {
						messageMap.set(messageId, message);
					}
				}
			}
			// For messages without message_id (like user inputs, tool calls)
			else {
				// Use the regular ID as key since these don't have message_id
				messageMap.set(message.id, message);
			}
		});

		// Convert back to array and sort by timestamp
		const filteredMessages = Array.from(messageMap.values())
			.sort((a, b) => {
				// Sort by timestamp if available
				if (a.timestamp && b.timestamp) {
					return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
				}
				return 0;
			});

		return (
			<div className="message-container">
				{filteredMessages.map((message) => {
					if (message.type === 'user') {
						return (
							<div className="message-group user-message" key={message.id}>
								<div className="message-bubble user-bubble">
									<div dangerouslySetInnerHTML={createMarkup(message.content)}/>
								</div>
							</div>
						);
					} else if (message.type === 'assistant') {
						// Add a special class for delta messages (streaming)
						const bubbleClass = message.isDelta
							? "message-bubble assistant-bubble streaming"
							: "message-bubble assistant-bubble";

						// If this is a delta message with chunks, ensure we display all concatenated content
						let displayContent = message.content;

						// For delta messages with chunks, rebuild the content in correct order
						if (message.isDelta && message.deltaChunks) {
							const orderedKeys = Object.keys(message.deltaChunks)
								.map(Number)
								.sort((a, b) => a - b);

							// Concatenate all chunks in correct order
							displayContent = orderedKeys
								.map(key => message.deltaChunks![key])
								.join('');
						}

						return (
							<div className="message-group assistant-message" key={message.message_id || message.id}>
								<div className={bubbleClass}
									style={{color: `rgba(${colors.rgb} / 1)`}}>
									<div dangerouslySetInnerHTML={createMarkup(displayContent)}/>
								</div>
							</div>
						);
					} else if (message.type === 'tool_call') {
						const toolCallMsg = message as ToolCallMessage;
						return (
							<div className="message-group tool-message" key={message.id}>
								<div className="message-bubble tool-bubble">
									<div className="tool-call-header">
										<span className="tool-icon">🔧</span>
										<span className="tool-name">{toolCallMsg.toolName}</span>
									</div>
									{toolCallMsg.command && (
										<div className="tool-call-command">
                                            <pre className="command-line"><span
												className="prompt">$</span> {toolCallMsg.command}</pre>
										</div>
									)}
									<div className="tool-call-params">
										<pre>{JSON.stringify(toolCallMsg.toolParams, null, 2)}</pre>
									</div>
								</div>
							</div>
						);
					} else if (message.type === 'tool_result') {
						const toolResultMsg = message as ToolResultMessage;
						return (
							<div className="message-group tool-result-message" key={message.id}>
								<div className="message-bubble tool-result-bubble">
									<div className="tool-result-header">
										<span className="tool-result-icon">✓</span>
										<span className="tool-result-name">{toolResultMsg.toolName} result</span>
									</div>
									<div className="tool-result-content">
                    <pre>{typeof toolResultMsg.result === 'string'
						? toolResultMsg.result as string
						: JSON.stringify(toolResultMsg.result, null, 2)}</pre>
									</div>
								</div>
							</div>
						);
					} else {
						return (
							<div className="message-group system-message" key={message.id}>
								<div className="message-bubble system-bubble">
									<div dangerouslySetInnerHTML={createMarkup(message.content)}/>
								</div>
							</div>
						);
					}
				})}
			</div>
		);
	};

	return (
		<div className={`process-box card border-0 shadow ${focused ? 'focused' : ''} ${isSubAgent ? 'sub-agent' : ''}`}
			onClick={handleBoxClick}>
			<div className={"process-box-bg"} style={{backgroundColor: colors.bgColor}}>
				<div className="card-header d-flex justify-content-between align-items-center border-0 py-3"
					data-theme-color={colors.textColor}>
					<div className="d-flex align-items-center">
						{isSubAgent && (
							<span className="sub-agent-indicator me-2"
								title="Sub-agent"
								style={{color: colors.textColor}}> ↳ </span>
						)}
						<span className="process-id fw-bold" style={{color: colors.textColor}}>
							{agentName ? agentName : ''}
						</span>
						{hasChildProcesses && (
							<span className="parent-agent-indicator ms-2"
								title="Has sub-agents"
								style={{color: colors.textColor}}> ⚙️ </span>
						)}
					</div>
					<div className="d-flex align-items-center gap-2">
						{status !== 'running' && (
							<span className={`process-status status-label btn-sm ${getStatusClass()}`}>
								{status}
							</span>
						)}
						{status !== 'ending' && status !== 'terminated' && (
							<button className="process-terminate btn btn-sm btn-outline"
								style={{color: `rgba(${colors.rgb} / var(--btn-color-opacity))`, borderColor: `rgba(${colors.rgb} / var(--btn-border-opacity))`}}
								onClick={handleTerminate}>
								terminate </button>
						)}
					</div>
				</div>

				<div className="process-logs card-body overflow-auto" ref={logsRef}>
					{renderTools()} {renderMessages()}
					{isTyping && (
						<span className="typing-indicator" title="Agent is thinking..." style={{color: colors.textColor}}>
							<span className="dot"></span>
							<span className="dot"></span>
							<span className="dot"></span>
						</span>
					)}
				</div>

				<div className="process-input-container card-footer bg-transparent p-2 border-0">
					<form className="process-input-form" onSubmit={handleSubmit} ref={inputFormRef}>
						<div className="input-group">
							<span className="input-group-text">&gt;</span>
							<input type="text"
								className="process-input form-control"
								placeholder="Send reply..."
								value={inputValue}
								onChange={handleInputChange}
								onKeyDown={handleKeyDown}
								ref={inputRef}
								autoComplete="off"/>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
};

export default ProcessBox;