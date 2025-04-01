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
    complete: boolean;
}

const ToolCallMessage: React.FC<ToolCallMessageProps> = ({ message, rgb, complete }) => {
    if(message.toolName.startsWith('Talk_to_')) {
        return (
            <div className="message-group assistant-message" key={message.message_id || message.id}>
                <div className={"message-bubble assistant-bubble talk-bubble"}
                    style={{color: `rgba(${rgb} / 1)`}}>
                    { message.command && <div dangerouslySetInnerHTML={parseMarkdown(message.command)}/> }
                </div>
            </div>
        );
    }
    return (
        <div className="message-group tool-message" key={message.id}>
            <div className="message-bubble tool-bubble">
                <div className="tool-call-header">
                    <span className="tool-name">
                        {(complete ? "": "Running ")+message.toolName.replaceAll('_', ' ')+(message.agent?.model ? ` (${message.agent.model})` : '')+(complete ? " Complete" : "...")}
                    </span>
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
