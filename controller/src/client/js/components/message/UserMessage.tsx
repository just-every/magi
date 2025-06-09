/**
 * UserMessage Component
 * Renders messages from the user
 */
import * as React from 'react';
import { ClientMessage } from '../../context/SocketContext';
import { parseMarkdown } from '../utils/MarkdownUtils';

interface UserMessageProps {
    message: ClientMessage;
}

const UserMessage: React.FC<UserMessageProps> = ({ message }) => {
    const content =
        typeof message.content === 'string'
            ? message.content
            : typeof message.content === 'object'
              ? JSON.stringify(message.content, null, 2)
              : String(message.content);

    return (
        <div className="message-group user-message" key={message.id}>
            <div className="message-bubble user-bubble">
                <div dangerouslySetInnerHTML={parseMarkdown(content)} />
            </div>
        </div>
    );
};

export default UserMessage;
