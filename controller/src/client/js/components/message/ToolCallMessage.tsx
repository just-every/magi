/**
 * ToolCallMessage Component
 * Renders tool call messages
 */
import * as React from 'react';
import { ToolCallMessage as ToolCallMessageType } from '../../context/SocketContext';
import { parseMarkdown } from '../utils/MarkdownUtils';

interface ToolCallMessageProps {
    message: ToolCallMessageType;
    rgb: string;
}

const ToolCallMessage: React.FC<ToolCallMessageProps> = ({ message, rgb }) => {
    return (
        <div className="message-group tool-message" key={message.id}>
            <div className="message-bubble tool-bubble">
                <div className="tool-call-header">
                    <span className="tool-icon">Using</span>
                    <span className="tool-name">{message.toolName}</span>
                </div>
                {message.command && (
                    <div className="tool-call-command message-bubble assistant-bubble" style={{color: `rgba(${rgb} / 1)`}}>
                        <div dangerouslySetInnerHTML={parseMarkdown(message.command)}/>
                    </div>
                )}
                {!message.command && (
                    <div className="tool-call-params">
                        <pre>{JSON.stringify(message.toolParams, null, 2)}</pre>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ToolCallMessage;
