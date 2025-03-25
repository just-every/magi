/**
 * MessageList Component
 * Renders a list of messages with proper formatting
 */
import * as React from 'react';
import { ClientMessage, ToolCallMessage as ToolCallMessageType, ToolResultMessage as ToolResultMessageType } from '../../context/SocketContext';
import { processMessages } from '../utils/ProcessBoxUtils';
import UserMessage from './UserMessage';
import AssistantMessage from './AssistantMessage';
import ToolCallMessage from './ToolCallMessage';
import ToolResultMessage from './ToolResultMessage';
import SystemMessage from './SystemMessage';
import { parseMarkdown } from '../utils/MarkdownUtils';

interface MessageListProps {
    messages: ClientMessage[];
    logs: string;
    isTyping: boolean;
    colors: {
        rgb: string;
        bgColor: string;
        textColor: string;
    };
}

const MessageList: React.FC<MessageListProps> = ({
    messages,
    logs,
    isTyping,
    colors
}) => {
    // If no structured messages, render raw logs with markdown
    if (messages.length === 0) {
        return (
            <>
                <div className="raw-logs" dangerouslySetInnerHTML={parseMarkdown(logs)}/>
                {renderTypingIndicator(isTyping, colors.textColor)}
            </>
        );
    }

    // Process messages to handle deltas and sorting
    const filteredMessages = processMessages(messages);

    return (
        <div className="message-container">
            {filteredMessages.map((message) => renderMessage(message, colors.rgb))}
            {renderTypingIndicator(isTyping, colors.textColor)}
        </div>
    );
};

/**
 * Render a typing indicator when the assistant is thinking
 */
const renderTypingIndicator = (isTyping: boolean, textColor: string) => {
    if (!isTyping) return null;

    return (
        <span className="typing-indicator" title="Agent is thinking..." style={{color: textColor}}>
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
        </span>
    );
};

/**
 * Render a message based on its type
 */
const renderMessage = (message: ClientMessage, rgb: string) => {
    switch (message.type) {
        case 'user':
            return <UserMessage key={message.id} message={message} />;

        case 'assistant':
            return <AssistantMessage key={message.id} message={message} rgb={rgb} />;

        case 'tool_call':
            return <ToolCallMessage
                key={message.id}
                message={message as ToolCallMessageType}
                rgb={rgb}
            />;

        case 'tool_result':
            return <ToolResultMessage
                key={message.id}
                message={message as ToolResultMessageType}
            />;

        default: // system or unknown type
            return <SystemMessage key={message.id} message={message} />;
    }
};

export default MessageList;
