/**
 * SystemMessage Component
 * Renders system messages using the unified BaseMessage wrapper
 */
import * as React from 'react';
import { ClientMessage } from '../../context/SocketContext';
import { parseMarkdown } from '../utils/MarkdownUtils';
import BaseMessage from './BaseMessage';

interface SystemMessageProps {
    rgb: string;
    message: ClientMessage;
    defaultCollapsed?: boolean;
}

const SystemMessage: React.FC<SystemMessageProps> = ({
    rgb,
    message,
    defaultCollapsed = false,
}) => {
    const content =
        typeof message.content === 'string'
            ? message.content
            : typeof message.content === 'object'
              ? JSON.stringify(message.content, null, 2)
              : String(message.content);

    const getTitle = (): string => {
        if (message.title) return message.title;

        const preview =
            content.length > 100 ? content.substring(0, 100) + '...' : content;
        return message.type === 'error' ? `Error: ${preview}` : preview;
    };

    const isError = message.type === 'error';

    return (
        <BaseMessage
            rgb={rgb}
            message={message}
            defaultCollapsed={defaultCollapsed}
            title={getTitle()}
            subtitle={
                message.agent?.model || (isError ? 'System Error' : 'System')
            }
            className={isError ? 'error-message' : 'system-message'}
        >
            {isError ? (
                <pre className="error-content">{content}</pre>
            ) : (
                <div className="system-content">
                    <div dangerouslySetInnerHTML={parseMarkdown(content)} />
                </div>
            )}
        </BaseMessage>
    );
};

export default SystemMessage;
