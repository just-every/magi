/**
 * UserMessage Component
 * Renders messages from the user
 */
import * as React from 'react';
import { ClientMessage } from '../../context/SocketContext';
import { parseMarkdown } from '../utils/MarkdownUtils';
import MessageContent from '../ui/MessageContent';

interface UserMessageProps {
    message: ClientMessage;
}

const UserMessage: React.FC<UserMessageProps> = ({ message }) => {
    // For string content, use markdown parsing
    if (typeof message.content === 'string') {
        return (
            <div className="message-group user-message" key={message.id}>
                <div className="message-bubble user-bubble">
                    <div dangerouslySetInnerHTML={parseMarkdown(message.content)} />
                </div>
            </div>
        );
    }

    // For structured content, use MessageContent component
    return (
        <div className="message-group user-message" key={message.id}>
            <div className="message-bubble user-bubble">
                <MessageContent content={message.content} />
            </div>
        </div>
    );
};

export default UserMessage;
