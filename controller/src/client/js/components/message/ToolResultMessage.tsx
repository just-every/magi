/**
 * ToolResultMessage Component
 * Renders tool result messages using the unified BaseMessage wrapper
 */
import * as React from 'react';
import { ToolResultMessage as ToolResultMessageType } from '../../context/SocketContext';
import { getToolResultContent } from '../utils/ProcessBoxUtils';
import BaseMessage from './BaseMessage';

interface ToolResultMessageProps {
    rgb: string;
    message: ToolResultMessageType;
    followsCall: boolean;
    defaultCollapsed?: boolean;
}

function prepareToolName(name: string): string {
    // Convert tool name to a more readable format
    return name.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

const ToolResultMessage: React.FC<ToolResultMessageProps> = ({
    rgb,
    message,
    followsCall,
    defaultCollapsed = false,
}) => {
    // Get the content and image path from the result
    let { content, imagePath } = getToolResultContent(message);
    const imageURL = imagePath;
    if (content.trim().startsWith('data:image/')) {
        // If the content is a base64 image, set it as the image path
        imagePath = content.trim();
        content = '';
    }

    // If this follows a tool call directly, don't wrap in BaseMessage
    if (followsCall) {
        return (
            <div className="tool-result-content follows-tool">
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
        );
    }

    return (
        <BaseMessage
            rgb={rgb}
            message={message}
            defaultCollapsed={defaultCollapsed}
            title={`${prepareToolName(message.toolName)} Result`}
            subtitle={message.agent?.model}
            className="tool-result-message"
        >
            <div className="tool-result-content">
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
        </BaseMessage>
    );
};

export default ToolResultMessage;
