/**
 * AssistantMessage Component
 * Renders messages from the AI assistant using the unified BaseMessage wrapper
 */
import * as React from 'react';
import { ClientMessage, AgentData } from '../../context/SocketContext';
import { parseMarkdown } from '../utils/MarkdownUtils';
import MessageContent from '../ui/MessageContent';
import BaseMessage from './BaseMessage';

interface AssistantMessageProps {
    rgb: string;
    message: ClientMessage;
    isLast: boolean;
    defaultCollapsed?: boolean;
    agent?: AgentData;
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
    rgb,
    message,
    isLast,
    defaultCollapsed = false,
    agent,
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

    const getPreviewText = (): string => {
        if (responseContent) {
            const content =
                typeof responseContent === 'string'
                    ? responseContent.replace(/\n/g, ' ').trim()
                    : 'Assistant response';
            return content.length > 80
                ? content.substring(0, 77) + '...'
                : content;
        }
        if (thinkingContent) {
            const content =
                typeof thinkingContent === 'string'
                    ? thinkingContent.replace(/\n/g, ' ').trim()
                    : 'Thinking...';
            return content.length > 80
                ? content.substring(0, 77) + '...'
                : content;
        }
        return 'Assistant message';
    };

    const getTitle = (): string => {
        if (title) return title;
        return getPreviewText();
    };

    const getSubtitle = (): string | undefined => {
        const parts: string[] = [];

        // Use live agent data if available, otherwise fall back to message.agent
        const agentData = agent || message.agent;

        // Add model name
        if (agentData?.model) {
            parts.push(agentData.model);
        }

        // Add duration if available
        if (agentData?.duration) {
            const seconds = (agentData.duration / 1000).toFixed(0);
            parts.push(`${seconds}s`);
        }

        // Add cost if available
        if (agentData?.cost) {
            parts.push(`$${agentData.cost.toFixed(4)}`);
        }

        return parts.length > 0 ? parts.join(' • ') : undefined;
    };

    return (
        <BaseMessage
            rgb={rgb}
            message={message}
            defaultCollapsed={defaultCollapsed}
            title={getTitle()}
            subtitle={getSubtitle()}
            className="assistant-message"
        >
            <>
                {thinkingContent && (
                    <div className={bubbleClass}>
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
                        className={
                            bubbleClass + (thinkingContent ? ' mt-2' : '')
                        }
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
            </>
        </BaseMessage>
    );
};

export default AssistantMessage;
