/**
 * AssistantMessage Component
 * Renders messages from the AI assistant
 */
import * as React from 'react';
import { ClientMessage } from '../../context/SocketContext';
import { parseMarkdown } from '../utils/MarkdownUtils';
import { getDeltaMessageContent } from '../utils/ProcessBoxUtils';
import MessageContent from '../ui/MessageContent';

interface AssistantMessageProps {
    message: ClientMessage;
    rgb: string;
    isLast: boolean;
}

const AssistantMessage: React.FC<AssistantMessageProps> = ({
    message,
    rgb,
    isLast,
}) => {
    // Add a special class for delta messages (streaming)
    const bubbleClass =
        message.isDelta && isLast
            ? 'message-bubble assistant-bubble streaming'
            : 'message-bubble assistant-bubble';

    // Get the content to display (handling delta messages)
    const displayContent = getDeltaMessageContent(message);

    return (
        <div
            className="message-group assistant-message"
            key={message.message_id || message.id}
        >
            <div className="message-header">
                {message.agent?.model && (
                    <div className="message-model">{message.agent.model}</div>
                )}
            </div>
            <div className={bubbleClass} style={{ color: `rgba(${rgb} / 1)` }}>
                {typeof displayContent === 'string' ? (
                    <div dangerouslySetInnerHTML={parseMarkdown(displayContent)} />
                ) : (
                    <MessageContent content={displayContent} />
                )}
            </div>
        </div>
    );
};

export default AssistantMessage;
