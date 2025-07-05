/**
 * MessageList Component
 * Renders a list of messages with proper formatting
 */
import * as React from 'react';
import {
    AgentData,
    ClientMessage,
    ToolCallMessage as ToolCallMessageType,
    ToolResultMessage as ToolResultMessageType,
} from '../../context/SocketContext';
import { processMessages } from '../utils/ProcessBoxUtils';
import UserMessage from './UserMessage';
import AssistantMessage from './AssistantMessage';
import ToolCallMessage from './ToolCallMessage';
import ToolResultMessage from './ToolResultMessage';
import SystemMessage from './SystemMessage';

interface MessageListProps {
    agent?: AgentData;
    messages: ClientMessage[];
    isTyping?: boolean;
    rgb: string;
}

const MessageList: React.FC<MessageListProps> = ({
    agent,
    messages,
    isTyping,
    rgb,
}) => {
    // Process messages to handle deltas and sorting
    const filteredMessages = processMessages(messages);

    // If no structured messages, render raw logs with markdown
    if (messages.length === 0) {
        return (
            <>
                {agent?.model && (
                    <div className="message-header">
                        Starting ({agent.model})...
                    </div>
                )}
                {renderTypingIndicator(isTyping, rgb, agent)}
            </>
        );
    }

    return (
        <div className="message-container">
            {filteredMessages.map((message, index) =>
                renderMessage(message, filteredMessages, index, rgb, agent)
            )}
            {renderTypingIndicator(isTyping, rgb, agent)}
        </div>
    );
};

/**
 * Render a typing indicator when the assistant is thinking
 */
const renderTypingIndicator = (
    isTyping: boolean,
    rgb: string,
    agent?: AgentData
) => {
    if (!isTyping) return null;

    return (
        <div
            className="typing-indicator-container"
            style={{ color: `rgba(${rgb} / 0.8)` }}
        >
            <div className="typing-indicator-text">
                {agent?.model
                    ? `Processing request with ${agent.model}...`
                    : 'Processing request...'}
            </div>
            <span
                className="typing-indicator"
                title="Agent is thinking..."
                style={{ color: `rgba(${rgb} / 0.8)` }}
            >
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
            </span>
        </div>
    );
};

/**
 * Render a message based on its type
 */
const renderMessage = (
    message: ClientMessage,
    filteredMessages: ClientMessage[],
    index: number,
    rgb: string,
    agent?: AgentData
) => {
    const lastMessage: ClientMessage | undefined =
        filteredMessages[index - 1] || undefined;
    const nextMessage: ClientMessage | undefined =
        filteredMessages[index + 1] || undefined;

    const defaultCollapsed = index < filteredMessages.length - 1;

    switch (message.type) {
        case 'user':
            return (
                <UserMessage
                    key={message.id}
                    rgb={rgb}
                    message={message}
                    defaultCollapsed={defaultCollapsed}
                />
            );

        case 'assistant':
            return (
                <AssistantMessage
                    key={message.id}
                    rgb={rgb}
                    message={message}
                    isLast={index === filteredMessages.length - 1}
                    defaultCollapsed={defaultCollapsed}
                    agent={agent}
                />
            );

        case 'tool_call': {
            const toolCallMessage = message as ToolCallMessageType;
            let complete = false;
            let matchingResult: ToolResultMessageType | undefined;

            // Find the matching tool result
            for (let i = index + 1; i < filteredMessages.length; i++) {
                const resultMessage = filteredMessages[i];
                if (
                    resultMessage.type === 'tool_result' &&
                    (resultMessage as ToolResultMessageType).toolCallId ===
                        toolCallMessage.toolCallId
                ) {
                    complete = true;
                    matchingResult = resultMessage as ToolResultMessageType;
                    break;
                }
            }

            // If there's a matching result, skip rendering here - it will be rendered at the result position
            if (matchingResult) {
                return null;
            }

            const nextToolResultMessage =
                nextMessage && nextMessage.type === 'tool_result'
                    ? (nextMessage as ToolResultMessageType)
                    : undefined;

            // Only render if there's no matching result (incomplete tool call)
            return (
                <ToolCallMessage
                    key={toolCallMessage.id}
                    rgb={rgb}
                    message={toolCallMessage}
                    complete={complete}
                    callFollows={
                        nextToolResultMessage &&
                        nextToolResultMessage.toolCallId ===
                            toolCallMessage.toolCallId
                    }
                    defaultCollapsed={defaultCollapsed}
                    result={matchingResult}
                />
            );
        }

        case 'tool_result': {
            const toolResultMessage = message as ToolResultMessageType;
            let matchingToolCall: ToolCallMessageType | undefined;

            // Check if there's a matching tool call
            for (let i = index - 1; i >= 0; i--) {
                const prevMessage = filteredMessages[i];
                if (
                    prevMessage.type === 'tool_call' &&
                    (prevMessage as ToolCallMessageType).toolCallId ===
                        toolResultMessage.toolCallId
                ) {
                    matchingToolCall = prevMessage as ToolCallMessageType;
                    break;
                }
            }

            // If there's a matching tool call, render the ToolCallMessage here at the result position
            if (matchingToolCall) {
                const nextToolResultMessage =
                    nextMessage && nextMessage.type === 'tool_result'
                        ? (nextMessage as ToolResultMessageType)
                        : undefined;

                return (
                    <ToolCallMessage
                        key={matchingToolCall.id}
                        rgb={rgb}
                        message={matchingToolCall}
                        complete={true}
                        callFollows={
                            nextToolResultMessage &&
                            nextToolResultMessage.toolCallId ===
                                matchingToolCall.toolCallId
                        }
                        defaultCollapsed={defaultCollapsed}
                        result={toolResultMessage}
                    />
                );
            }

            // If no matching tool call found, render standalone
            const lastToolCallMessage =
                lastMessage && lastMessage.type === 'tool_call'
                    ? (lastMessage as ToolCallMessageType)
                    : undefined;

            return (
                <ToolResultMessage
                    key={toolResultMessage.id}
                    rgb={rgb}
                    followsCall={
                        lastToolCallMessage &&
                        lastToolCallMessage.toolCallId ===
                            toolResultMessage.toolCallId
                    }
                    message={toolResultMessage}
                    defaultCollapsed={defaultCollapsed}
                />
            );
        }

        default: // system or unknown type
            return (
                <SystemMessage
                    key={message.id}
                    rgb={rgb}
                    message={message}
                    defaultCollapsed={defaultCollapsed}
                />
            );
    }
};

export default MessageList;
