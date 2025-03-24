import * as React from 'react';
import {useRef, useEffect} from 'react';
import * as marked from 'marked';
import {ProcessStatus} from '@types';
import {ClientMessage, ToolCallMessage, ToolResultMessage} from '../context/SocketContext';

interface AgentBoxProps {
    id: string;
    status: ProcessStatus;
    colors: {
        rgb: string;
        bgColor: string;
        textColor: string;
    };
    logs: string;
    agentName: string;
    messages: ClientMessage[];
    isTyping: boolean;
}

const AgentBox: React.FC<AgentBoxProps> = ({
    status,
    colors,
    logs,
    agentName,
    messages,
    isTyping
}) => {
    const logsRef = useRef<HTMLDivElement>(null);

    // Parse markdown for logs and enhance links
    const createMarkup = (content: string) => {
        try {
            // Ensure that newlines are preserved before markdown parsing
            const formattedContent = content.replace(/\n/g, '\n\n');
            
            // Custom renderer for links and images
            class CustomRenderer extends marked.Renderer {
                link(href: string, title: string | null, text: string): string {
                    const titleAttr = title ? ` title="${title}"` : '';
                    return `<a href="${href}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`;
                }
                
                image(href: string, title: string | null, text: string): string {
                    const titleAttr = title ? ` title="${title}"` : '';
                    const altAttr = text ? ` alt="${text}"` : '';
                    
                    // Check if this is a /magi_output/ path
                    if (href && href.startsWith('/magi_output/')) {
                        // For images, render both the link and the image
                        return `
                            <div class="magi-output-image">
                                <a href="${href}" target="_blank" rel="noopener noreferrer"${titleAttr}>
                                    <img src="${href}"${altAttr}${titleAttr} class="img-fluid">
                                </a>
                            </div>
                        `;
                    }
                    
                    // Regular image handling
                    return `<img src="${href}"${altAttr}${titleAttr} class="img-fluid">`;
                }
            }
            
            const renderer = new CustomRenderer();
            
            // Apply custom renderer
            const parsedOutput = marked.parse(formattedContent, { renderer });
            
            return {__html: parsedOutput};
        } catch (e) {
            return {__html: content};
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
                                        <span className="tool-icon">Using</span>
                                        <span className="tool-name">{toolCallMsg.toolName}</span>
                                    </div>
                                    {toolCallMsg.command && (
                                        <div className="tool-call-command message-bubble assistant-bubble" style={{color: `rgba(${colors.rgb} / 1)`}}>
                                            <div dangerouslySetInnerHTML={createMarkup(toolCallMsg.command)}/>
                                        </div>
                                    )}
                                    {!toolCallMsg.command && (
                                        <div className="tool-call-params">
                                            <pre>{JSON.stringify(toolCallMsg.toolParams, null, 2)}</pre>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    } else if (message.type === 'tool_result') {
                        const toolResultMsg = message as ToolResultMessage;
                        
                        // Helper function to check for and extract image paths
                        const findImagePath = (text: string): string => {
                            if (text.includes('/magi_output/') && 
                                (text.includes('.png') || text.includes('.jpg') || text.includes('.jpeg') || text.includes('.gif'))) {
                                const match = text.match(/\/magi_output\/[^\s)"']+\.(png|jpg|jpeg|gif)/i);
                                if (match) {
                                    return match[0];
                                }
                            }
                            return '';
                        };
                        
                        // Get the display content based on the result type
                        let resultContent = '';
                        let imagePath = '';
                        
                        if (typeof toolResultMsg.result === 'string') {
                            resultContent = toolResultMsg.result;
                            imagePath = findImagePath(resultContent);
                        } else if (typeof toolResultMsg.result === 'object' && toolResultMsg.result !== null) {
                            // Type assertion for TypeScript
                            const resultObj = toolResultMsg.result as Record<string, any>;
                            
                            // Try to extract image path from the object
                            if ('output' in resultObj && typeof resultObj.output === 'string') {
                                resultContent = resultObj.output;
                                imagePath = findImagePath(resultContent);
                            } else {
                                // Just stringify the object
                                resultContent = JSON.stringify(toolResultMsg.result, null, 2);
                            }
                        } else {
                            resultContent = String(toolResultMsg.result);
                        }
                        
                        return (
                            <div className="message-group tool-result-message" key={message.id}>
                                <div className="message-bubble tool-result-bubble">
                                    <div className="tool-result-header">
                                        <span className="tool-result-icon">✓</span>
                                        <span className="tool-result-name">{toolResultMsg.toolName} result</span>
                                    </div>
                                    <div className="tool-result-content">
                                        <pre>{resultContent}</pre>
                                        
                                        {/* Display image if an image path was found */}
                                        {imagePath && (
                                            <div className="magi-output-image">
                                                <a href={imagePath} target="_blank" rel="noopener noreferrer">
                                                    <img src={imagePath} alt={`Result from ${toolResultMsg.toolName}`} className="img-fluid" />
                                                </a>
                                            </div>
                                        )}
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

    // Determine agent box class based on status
    const getAgentBoxClass = () => {
        let classes = "agent-box card border-0 shadow";
        
        // Add active-agent class when the agent is running
        if (status === 'running') {
            classes += " active-agent";
        }
        
        return classes;
    };

    return (
        <div className={getAgentBoxClass()}>
            <div className="agent-box-bg" style={{backgroundColor: colors.bgColor}}>
                <div className="card-header d-flex justify-content-between align-items-center border-0 py-2"
                    data-theme-color={colors.textColor}>
                    <div className="d-flex align-items-center">
                        <span className="sub-agent-indicator me-2"
                            title="Sub-agent"
                            style={{color: colors.textColor}}> ↳ </span>
                        <span className="process-id fw-bold" style={{color: colors.textColor}}>
                            {agentName}
                        </span>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                        {status !== 'running' && (
                            <span className={`process-status status-label btn-sm ${getStatusClass()}`}>
                                {status}
                            </span>
                        )}
                    </div>
                </div>

                <div className="agent-logs card-body overflow-auto" ref={logsRef}>
                    {renderMessages()}
                    {isTyping && (
                        <span className="typing-indicator" title="Agent is thinking..." style={{color: colors.textColor}}>
                            <span className="dot"></span>
                            <span className="dot"></span>
                            <span className="dot"></span>
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AgentBox;