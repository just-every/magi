/**
 * AssistantMessage Component
 * Renders messages from the AI assistant
 */
import * as React from 'react';
import { ClientMessage } from '../../context/SocketContext';
import { parseMarkdown } from '../utils/MarkdownUtils';
import MessageContent from '../ui/MessageContent';

interface AssistantMessageProps {
    message: ClientMessage;
    isLast: boolean;
    colors?: {
        rgb: string;
        bgColor: string;
        textColor: string;
    };
}

/**
 * Get display content for delta messages with chunks
 * @param message The message to process
 * @returns The complete content with all chunks in correct order
 */
export const getThinkingContent = (message: ClientMessage): string => {
    // If this is a delta message with chunks, ensure we display all concatenated content
    return typeof message.thinking_content === 'string'
        ? message.thinking_content
        : typeof message.thinking_content === 'object'
          ? JSON.stringify(message.thinking_content, null, 2)
          : message.thinking_content
            ? String(message.thinking_content)
            : '';
};

/**
 * Get display content for delta messages with chunks
 * @param message The message to process
 * @returns The complete content with all chunks in correct order
 */
export const getResponseContent = (message: ClientMessage): string => {
    // If this is a delta message with chunks, ensure we display all concatenated content
    return typeof message.content === 'string'
        ? message.content
        : typeof message.content === 'object'
          ? JSON.stringify(message.content, null, 2)
          : message.content
            ? String(message.content)
            : '';
};

const AssistantMessage: React.FC<AssistantMessageProps> = ({
    message,
    isLast,
    colors,
}) => {
    // Add a special class for delta messages (streaming)
    const bubbleClass =
        message.isDelta && isLast
            ? 'message-bubble assistant-bubble streaming'
            : 'message-bubble assistant-bubble';

    // Get the content to display (handling delta messages)
    let thinkingContent = getThinkingContent(message);
    const responseContent = getResponseContent(message);

    let title: string | undefined =
        message.isDelta && isLast ? 'Thinking...' : undefined;

    // Check if thinkingContent starts with a bold line and extract title
    if (thinkingContent && typeof thinkingContent === 'string') {
        const boldLineMatch = thinkingContent.match(
            /^\s*\*\*(.+?)\*\*\s*(\r?\n|$)/
        );
        if (boldLineMatch) {
            title = boldLineMatch[1];
            // Remove the bold line from the beginning of thinkingContent
            thinkingContent = thinkingContent.replace(
                /^\s*\*\*(.+?)\*\*\s*(\r?\n)?/,
                ''
            );
        }
    }

    return (
        <div
            className="message-group assistant-message"
            key={message.message_id || message.id}
        >
            <div className="message-header">
                {message.agent?.model && (
                    <div className="message-model">{message.agent.model}</div>
                )}
                {title && <div className="message-title">{title}</div>}
            </div>
            {thinkingContent && (
                <div
                    className={bubbleClass}
                    style={{ color: `rgba(${colors.rgb} / 1)` }}
                >
                    {typeof thinkingContent === 'string' ? (
                        <div
                            dangerouslySetInnerHTML={parseMarkdown(
                                thinkingContent
                            )}
                        />
                    ) : (
                        <MessageContent content={thinkingContent} />
                    )}
                </div>
            )}
            {responseContent && (
                <div
                    className={bubbleClass}
                    style={{ color: `rgba(${colors.rgb} / 1)` }}
                >
                    {typeof responseContent === 'string' ? (
                        <div
                            dangerouslySetInnerHTML={parseMarkdown(
                                responseContent
                            )}
                        />
                    ) : (
                        <MessageContent content={responseContent} />
                    )}
                </div>
            )}
        </div>
    );
};

export default AssistantMessage;
