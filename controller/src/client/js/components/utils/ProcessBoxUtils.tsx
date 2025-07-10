/**
 * Utility functions for ProcessBox component
 */
import { ProcessStatus } from '../../../../types';
import { ClientMessage, ToolResultMessage } from '../../context/SocketContext';

/**
 * Get CSS class for process status
 * @param status The process status
 * @returns CSS class string for the status
 */
export const getStatusClass = (status: ProcessStatus): string => {
    switch (status) {
        case 'running':
            return 'status-running bg-light';
        case 'completed':
            return 'status-completed bg-success';
        case 'failed':
            return 'status-failed bg-warning';
        case 'ending':
        case 'terminated':
            return 'status-terminated bg-danger';
        default:
            return 'status-running bg-light';
    }
};

/**
 * Interface for tool information
 */
export interface Tool {
    name: string;
    description: string;
}

/**
 * Process messages to remove duplicates and sort by timestamp
 * @param messages Array of client messages
 * @returns Filtered and sorted messages
 */
export const processMessages = (messages: ClientMessage[]): ClientMessage[] => {
    if (messages.length === 0) return [];

    // Group messages by message_id to handle delta/complete pairs
    const messageMap = new Map<string, ClientMessage>();

    // Process messages to ensure we only show one instance per message_id
    messages.forEach(message => {
        const messageId = message.message_id;

        // For messages with message_id (like LLM responses)
        if (messageId) {
            // If it's a complete message (not a delta), or we don't have this message yet
            if (!message.isDelta || !messageMap.has(messageId)) {
                messageMap.set(messageId, message);
            }
            // If it's a delta and we already have a message with this ID,
            // only update if the existing one is also a delta
            else if (message.isDelta) {
                const existingMessage = messageMap.get(messageId);
                if (existingMessage && existingMessage.isDelta) {
                    messageMap.set(messageId, message);
                }
            }
        }
        // For messages without message_id (like user inputs, tool calls)
        else {
            // Use the regular ID as key since these don't have message_id
            messageMap.set(message.id, message);
        }
    });

    // Convert back to array and sort by timestamp
    return Array.from(messageMap.values()).sort((a, b) => {
        // Sort by timestamp if available
        if (a.timestamp && b.timestamp) {
            return (
                new Date(a.timestamp).getTime() -
                new Date(b.timestamp).getTime()
            );
        }
        return 0;
    });
};

/**
 * Extracts image path from text content (including Markdown)
 * @param text The text to search for image paths
 * @returns Extracted image path or empty string if not found
 */
export const findImagePath = (text: string): string => {
    if (!text) return '';

    // For markdown links: [text](/magi_output/path.png)
    const markdownMatch = text.match(
        /\[([^\]]*\/magi_output\/[^\]]+\.(png|jpg|jpeg|gif))\]|\(([^)]*\/magi_output\/[^)]+\.(png|jpg|jpeg|gif))\)/i
    );
    if (markdownMatch) {
        // Return the first non-undefined group (either from brackets or parentheses)
        return markdownMatch[1] || markdownMatch[3] || '';
    }

    // Fallback to regular text search
    if (
        text.includes('/magi_output/') &&
        (text.includes('.png') ||
            text.includes('.jpg') ||
            text.includes('.jpeg') ||
            text.includes('.gif'))
    ) {
        const match = text.match(
            /\/magi_output\/[^\s)"']+\.(png|jpg|jpeg|gif)/i
        );
        if (match && typeof match[0] === 'string') {
            return match[0];
        }
    }

    return '';
};

/**
 * Get formatted content for tool result message
 * @param resultMsg The tool result message to format
 * @returns Object containing result content and image path
 */
export const getToolResultContent = (
    resultMsg: ToolResultMessage
): {
    content: string;
    imagePath: string;
} => {
    let resultContent = '';
    let imagePath = '';

    if (typeof resultMsg.result === 'string') {
        resultContent = resultMsg.result;
        imagePath = findImagePath(resultContent);
    } else if (
        typeof resultMsg.result === 'object' &&
        resultMsg.result !== null
    ) {
        // Type assertion for TypeScript
        const resultObj = resultMsg.result as Record<string, unknown>;

        // Try to extract image path from the object
        if ('output' in resultObj && typeof resultObj.output === 'string') {
            resultContent = resultObj.output;
            imagePath = findImagePath(resultContent);
        } else {
            // Just stringify the object
            resultContent = JSON.stringify(resultMsg.result, null, 4);
        }
    } else {
        resultContent = String(resultMsg.result);
    }

    try {
        // Prettify JSON output
        const jsonFormat = JSON.parse(resultContent);
        if (jsonFormat) {
            resultContent = JSON.stringify(jsonFormat, null, 4);
        }
    } catch {
        // Ignore invalid JSON
    }

    return { content: resultContent, imagePath };
};
