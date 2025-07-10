/**
 * UserMessage Component
 * Renders messages from the user using the unified BaseMessage wrapper
 */
import * as React from 'react';
import { ClientMessage, useSocket } from '../../context/SocketContext';
import MessageContent from '../ui/MessageContent';
import BaseMessage from './BaseMessage';

interface UserMessageProps {
    message: ClientMessage;
    defaultCollapsed?: boolean;
}

const UserMessage: React.FC<UserMessageProps> = ({
    rgb,
    message,
    defaultCollapsed = false,
}) => {
    const { yourName } = useSocket();
    const getTitle = (): string => {
        if (message.title) return message.title;

        // Create a preview from content if no title
        if (typeof message.content === 'string') {
            const preview = message.content.replace(/\n/g, ' ').trim();
            return preview.length > 80
                ? preview.substring(0, 77) + '...'
                : preview;
        }
        return 'User message';
    };

    return (
        <BaseMessage
            rgb={rgb}
            message={message}
            defaultCollapsed={defaultCollapsed}
            title={getTitle()}
            subtitle={message.sender || yourName || 'You'}
            className="user-message"
        >
            <MessageContent content={message.content} />
        </BaseMessage>
    );
};

export default UserMessage;
