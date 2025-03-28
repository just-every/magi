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
    return (
        <div className="message-group system-message" key={message.id}>
            <div className="message-bubble">
                <div className={"alert "+(message.type === 'error' ? ' alert-danger' : 'alert-secondary')}>
                    <div dangerouslySetInnerHTML={parseMarkdown(message.content)}/>
                </div>
            </div>
        </div>
    );
};

export default SystemMessage;
