/**
 * SystemMessage Component
 * Renders system messages
 */
import * as React from 'react';
import { ClientMessage } from '../../context/SocketContext';
import { parseMarkdown } from '../utils/MarkdownUtils';

interface SystemMessageProps {
    message: ClientMessage;
}

const SystemMessage: React.FC<SystemMessageProps> = ({ message }) => {
    const content =
        typeof message.content === 'string'
            ? message.content
            : typeof message.content === 'object'
              ? JSON.stringify(message.content, null, 2)
              : String(message.content);

    if (message.type === 'error') {
        return (
            <div
                className="message-group system-message"
                key={message.message_id || message.id}
            >
                <pre
                    className={
                        'message-bubble alert mb-0 ' +
                        (message.type === 'error'
                            ? ' alert-danger'
                            : 'alert-secondary')
                    }
                    style={
                        {whiteSpace: 'pre-wrap'}
                    }
                >
                    { content }
                </pre>
            </div>
        );
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
                {message.title && (
                    <div className="message-title">
                        {message.title}
                    </div>
                )}
            </div>
            <div className="message-bubble assistant-bubble">
                <div dangerouslySetInnerHTML={parseMarkdown(content)} />
            </div>
        </div>
    );
};

export default SystemMessage;
