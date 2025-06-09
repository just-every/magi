/**
 * ToolCallMessage Component
 * Renders tool call messages
 */
import * as React from 'react';
import { ToolCallMessage as ToolCallMessageType } from '../../context/SocketContext';
import { parseMarkdown } from '../utils/MarkdownUtils';

interface ToolCallMessageProps {
    message: ToolCallMessageType;
    rgb: string;
    complete: boolean;
    callFollows: boolean;
}

function prepareToolName(name: string): string {
    // Convert tool name to a more readable format
    return name.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

const ToolCallMessage: React.FC<ToolCallMessageProps> = ({
    message,
    rgb,
    complete,
    callFollows,
}) => {
    if (message.toolName.startsWith('talk_to_')) {
        if (message.t)
            return (
                <div
                    className="message-group assistant-message"
                    key={message.message_id || message.id}
                >
                    {message.agent?.model && (
                        <div className="message-header">
                            <div className="message-model">
                                {message.agent.model}
                            </div>
                        </div>
                    )}
                    <div
                        className={
                            'message-bubble assistant-bubble talk-bubble'
                        }
                        style={{ color: `rgba(${rgb} / 1)` }}
                    >
                        {message.command && (
                            <div
                                dangerouslySetInnerHTML={parseMarkdown(
                                    message.command
                                )}
                            />
                        )}
                    </div>
                </div>
            );
    }

    // Ensure we have a string representation of the tool parameters
    let toolCallParams = '';
    if (message.toolParams) {
        if (typeof message.toolParams === 'string') {
            // If it's already a string, use it as-is
            toolCallParams = message.toolParams.trim();
        } else if (typeof message.toolParams === 'object') {
            // If it's an object, stringify it
            toolCallParams = JSON.stringify(message.toolParams, null, '\t')
                .replace(/^[\t ]*[{}][\t ]*(?=\r?\n|$)/gm, '')
                .trim();
        }
    }
    return (
        <div className="message-group tool-message" key={message.id}>
            <div className="message-bubble tool-bubble">
                <div className="message-header">
                    {message.agent?.model && (
                        <div className="message-model">
                            {message.agent.model}
                        </div>
                    )}
                    <div className="message-title">
                        {prepareToolName(message.toolName)}{' '}
                        {complete ? '' : 'Running...'}
                    </div>
                </div>
                {message.command && (
                    <div
                        className={
                            'message-bubble tool-call-command' +
                            (callFollows ? ' call-follows' : '')
                        }
                        style={{ color: `rgba(${rgb} / 1)` }}
                    >
                        <div
                            dangerouslySetInnerHTML={parseMarkdown(
                                message.command
                            )}
                        />
                    </div>
                )}
                {!message.command && (
                    <div
                        className={
                            'message-bubble tool-call-command' +
                            (callFollows ? ' call-follows' : '')
                        }
                    >
                        <pre>
                            {message.toolName}(
                            {toolCallParams &&
                            toolCallParams !== '{}' &&
                            toolCallParams !== 'null'
                                ? '\n\t' + toolCallParams + '\n'
                                : ''}
                            )
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ToolCallMessage;
