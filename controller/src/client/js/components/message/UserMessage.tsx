/**
 * UserMessage Component
 * Renders messages from the user
 */
import * as React from 'react';
import { ClientMessage } from '../../context/SocketContext';
import MessageContent from '../ui/MessageContent';
/**
 * ProcessGrid Component
 * Renders the main grid view of all processes with zooming and panning capabilities
 */

interface UserMessageProps {
    message: ClientMessage;
}

const UserMessage: React.FC<UserMessageProps> = ({ message }) => {
    // For structured content, use MessageContent component
    return (
        <div className="message-group user-message" key={message.id}>
            <div className="message-header">
                {message.sender && <span className="message-model">{message.sender}</span>}
                {message.title && <div className="message-title">
                    {message.title}
                </div>}
            </div>
            <div className="message-bubble user-bubble">
                <MessageContent content={message.content} />
            </div>
        </div>
    );
};

export default UserMessage;
