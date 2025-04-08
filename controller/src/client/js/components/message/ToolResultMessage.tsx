/**
 * ToolResultMessage Component
 * Renders tool result messages
 */
import * as React from 'react';
import { ToolResultMessage as ToolResultMessageType } from '../../context/SocketContext';
import { getToolResultContent } from '../utils/ProcessBoxUtils';

interface ToolResultMessageProps {
    message: ToolResultMessageType;
    followsCall: boolean;
}

const ToolResultMessage: React.FC<ToolResultMessageProps> = ({ message, followsCall }) => {
    if(message.toolName.startsWith('talk_to_')) {
        // Don't show talk results
        return null;
    }

    // Get the content and image path from the result
    const { content, imagePath } = getToolResultContent(message);
    return (
        <div className="message-group tool-result-message" key={message.id}>
            <div className="message-bubble tool-result-bubble">
                { !followsCall && <div className="tool-result-header">
                    <span className="tool-result-icon">✓</span>
                    <span className="tool-result-name">{message.toolName.replaceAll('_', ' ')} Complete</span>
                </div> }
                <div className="tool-result-content">
                    <pre>{content}</pre>

                    {/* Display image if an image path was found */}
                    {imagePath && (
                        <div className="magi-output-image">
                            <a href={imagePath} target="_blank" rel="noopener noreferrer">
                                <img src={imagePath} alt={`Result from ${message.toolName}`} className="img-fluid" />
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ToolResultMessage;
