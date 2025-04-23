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

function prepareToolName(name: string): string {
    // Convert tool name to a more readable format
    return name.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

const ToolResultMessage: React.FC<ToolResultMessageProps> = ({
    message,
    followsCall,
}) => {
    if (message.toolName.startsWith('talk_to_')) {
        // Don't show talk results
        return null;
    }

    // Get the content and image path from the result
    let { content, imagePath } = getToolResultContent(message);
    const imageURL = imagePath;
    if (content.trim().startsWith('data:image/')) {
        // If the content is a base64 image, set it as the image path
        imagePath = content.trim();
        content = '';
    }

    return (
        <div className="message-group tool-result-message" key={message.id}>
            <div className="message-bubble tool-result-bubble">
                {!followsCall && (
                    <div className="message-header">
                        {message.agent?.model && (
                            <div className="message-model">
                                {message.agent.model}
                            </div>
                        )}
                        <div className="message-title">
                            Tool {prepareToolName(message.toolName)} Result
                        </div>
                    </div>
                )}
                <div className="tool-result-content message-bubble assistant-bubble">
                    {content && <pre>{content}</pre>}

                    {/* Display image if an image path was found */}
                    {imagePath && (
                        <div className="magi-output-image">
                            {imageURL && (
                                <a
                                    href={imageURL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <img
                                        src={imagePath}
                                        alt={`Result from ${message.toolName}`}
                                        className="img-fluid"
                                    />
                                </a>
                            )}
                            {!imageURL && (
                                <img
                                    src={imagePath}
                                    alt={`Result from ${message.toolName}`}
                                    className="img-fluid"
                                />
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ToolResultMessage;
