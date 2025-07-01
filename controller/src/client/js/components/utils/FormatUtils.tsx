import { ReactElement } from 'react';
import { ProcessData, ToolCallMessage, ToolResultMessage } from '../../context/SocketContext';

export const getStatusIcon = (item: ProcessData | { status: string }) => {
    const status = item.status;

    if (status === 'running' || status === 'started') {
        return { icon: 'bi-circle-fill', color: 'var(--accent-primary)' }; // Primary for active
    } else if (
        status === 'failed' ||
        status === 'terminated' ||
        status === 'error'
    ) {
        return { icon: 'bi-circle-fill', color: '#dc3545' }; // Red for failed
    } else if (status === 'completed') {
        return { icon: 'bi-check-circle-fill', color: '#28a745' }; // Green check for completed
    } else {
        return { icon: 'bi-circle-fill', color: '#6c757d' }; // Gray for other states
    }
};

export const truncate = (content: string, length: number): string => {
    if (content.length > length) {
        return (
            content.substring(0, (length - 5) / 2) +
            ' ... ' +
            content.substring(content.length - (length - 5) / 2)
        );
    }
    return content;
};

/**
 * Extract a title from message content
 * Looks for common title patterns in the content, especially "**Word:**" patterns
 * @param content The message content to extract title from
 * @returns The extracted title or a truncated version of the content
 */
export const extractTitle = (content: string): string => {
    // Handle both string and structured content
    let text = content;
    if (typeof content === 'object') {
        text = JSON.stringify(content);
    }

    // Check for **Word:** pattern (like **Task:**, **Context:**, etc.)
    const wordPattern = /\*\*(\w+):\*\*\s*(.+)/;
    const match = text.match(wordPattern);

    if (match) {
        // Get the text after the pattern
        const afterPattern = match[2];

        // Find the first sentence (ends with . ! or ?)
        const sentenceMatch = afterPattern.match(/^[^.!?]+[.!?]/);
        if (sentenceMatch) {
            // Remove backticks and return
            return sentenceMatch[0].trim().replace(/`/g, '');
        } else {
            // If no sentence ending found, take up to first newline or entire text
            const newlineIndex = afterPattern.indexOf('\n');
            const firstPart = newlineIndex > -1 ? afterPattern.substring(0, newlineIndex).trim() : afterPattern.trim();
            // Remove backticks and return
            return firstPart.replace(/`/g, '');
        }
    }

    // Check for markdown headers (# Title)
    const markdownHeaderMatch = text.match(/^#\s+(.+)$/m);
    if (markdownHeaderMatch) {
        return markdownHeaderMatch[1].trim().replace(/`/g, '');
    }

    // Check for HTML headers (<h1>Title</h1>)
    const htmlHeaderMatch = text.match(/<h[1-6]>(.+?)<\/h[1-6]>/i);
    if (htmlHeaderMatch) {
        return htmlHeaderMatch[1].trim().replace(/`/g, '');
    }

    // Check for bold text at the beginning (**Title**)
    const boldTextMatch = text.match(/^\*\*(.+?)\*\*/);
    if (boldTextMatch) {
        return boldTextMatch[1].trim().replace(/`/g, '');
    }

    // Check for first line if it's short enough to be a title
    const firstLine = text.split('\n')[0].trim();
    if (firstLine.length > 0 && firstLine.length <= 100) {
        return firstLine.replace(/`/g, '');
    }

    // Default: return truncated content
    return truncate(text, 50).replace(/`/g, '');
};

export const iconFromMessage = (message: ToolCallMessage | ToolResultMessage, rgb: string): ReactElement<any, any> => {
    const iconStyle = {
        height: '18px',
        verticalAlign: 'text-bottom',
        marginRight: '5px',
        fill: `rgba(${rgb} / 1)`,
    };
    const toolName = message.toolName?.startsWith('talk_to_') ? 'send_message' : message.toolName;
    if (!toolName) {
        return null;
    }
    switch (toolName) {
    case 'execute_command':
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" style={ iconStyle }><path d="M0 96C0 60.7 28.7 32 64 32l320 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96zm70.3 55.8c-9 9.8-8.3 25 1.5 33.9L148.5 256 71.8 326.3c-9.8 9-10.4 24.1-1.5 33.9s24.1 10.4 33.9 1.5l96-88c5-4.5 7.8-11 7.8-17.7s-2.8-13.1-7.8-17.7l-96-88c-9.8-9-25-8.3-33.9 1.5zM216 336c-13.3 0-24 10.7-24 24s10.7 24 24 24l144 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-144 0z"/></svg>
        );
    case 'list_directory':
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" style={ iconStyle }><path d="M448 96c0-35.3-28.7-64-64-64L64 32C28.7 32 0 60.7 0 96L0 416c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-320zM256 160c0 17.7-14.3 32-32 32l-96 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l96 0c17.7 0 32 14.3 32 32zm64 64c17.7 0 32 14.3 32 32s-14.3 32-32 32l-192 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l192 0zM192 352c0 17.7-14.3 32-32 32l-32 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l32 0c17.7 0 32 14.3 32 32z"/></svg>
        );
    case 'write_file':
    case 'write_source':
    case 'save_memory':
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style={ iconStyle }><path d="M471.6 21.7c-21.9-21.9-57.3-21.9-79.2 0L362.3 51.7l97.9 97.9 30.1-30.1c21.9-21.9 21.9-57.3 0-79.2L471.6 21.7zm-299.2 220c-6.1 6.1-10.8 13.6-13.5 21.9l-29.6 88.8c-2.9 8.6-.6 18.1 5.8 24.6s15.9 8.7 24.6 5.8l88.8-29.6c8.2-2.7 15.7-7.4 21.9-13.5L437.7 172.3 339.7 74.3 172.4 241.7zM96 64C43 64 0 107 0 160L0 416c0 53 43 96 96 96l256 0c53 0 96-43 96-96l0-96c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 96c0 17.7-14.3 32-32 32L96 448c-17.7 0-32-14.3-32-32l0-256c0-17.7 14.3-32 32-32l96 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L96 64z"/></svg>
        );
    case 'read_file':
    case 'read_source':
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" style={ iconStyle }><path d="M0 96C0 60.7 28.7 32 64 32l320 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96zm262.2 71.9c-8.9 9.9-8.1 25 1.8 33.9L324.1 256l-60.2 54.2c-9.9 8.9-10.7 24-1.8 33.9s24 10.7 33.9 1.8l80-72c5.1-4.6 7.9-11 7.9-17.8s-2.9-13.3-7.9-17.8l-80-72c-9.9-8.9-25-8.1-33.9 1.8zm-78.1 33.9c9.9-8.9 10.7-24 1.8-33.9s-24-10.7-33.9-1.8l-80 72c-5.1 4.6-7.9 11-7.9 17.8s2.9 13.3 7.9 17.8l80 72c9.9 8.9 25 8.1 33.9-1.8s8.1-25-1.8-33.9L123.9 256l60.2-54.2z"/></svg>
        );
    case 'CUSTOM_TOOL':
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" style={ iconStyle }><path d="M96 32l32 0 0 64L96 96c-17.7 0-32 14.3-32 32l0 32L0 160l0-32C0 75 43 32 96 32zM0 192l64 0 0 128L0 320 0 192zm384 0l64 0 0 128-64 0 0-128zm64-32l-64 0 0-32c0-17.7-14.3-32-32-32l-32 0 0-64 32 0c53 0 96 43 96 96l0 32zm0 192l0 32c0 53-43 96-96 96l-32 0 0-64 32 0c17.7 0 32-14.3 32-32l0-32 64 0zM64 352l0 32c0 17.7 14.3 32 32 32l32 0 0 64-32 0c-53 0-96-43-96-96l0-32 64 0zm96 128l0-64 128 0 0 64-128 0zm0-384l0-64 128 0 0 64L160 96z"/></svg>
        );
    case 'terminate_running_task':
    case 'terminate_running_tool':
    case 'delete_memory':
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" style={ iconStyle }><path d="M64 32C28.7 32 0 60.7 0 96L0 416c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-320c0-35.3-28.7-64-64-64L64 32zm234.1 83.6c5.8 4.7 7.6 12.9 4.3 19.6L249.9 240l70.1 0c6.8 0 12.9 4.3 15.1 10.7s.2 13.5-5.1 17.8l-160 128c-5.9 4.7-14.2 4.7-20.1-.1s-7.6-12.9-4.3-19.6L198.1 272 128 272c-6.8 0-12.8-4.3-15.1-10.7s-.2-13.5 5.1-17.8l160-128c5.9-4.7 14.2-4.7 20.1 .1z"/></svg>
        );
    case 'inspect_running_task':
    case 'inspect_running_tool':
    case 'find_memory':
    case 'web_search':
    case 'get_task_status':
    case 'check_all_task_health':
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style={ iconStyle }><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg>
        );
    case 'wait_for_running_task':
    case 'wait_for_running_task':
    case 'set_thought_delay':
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" style={ iconStyle }><path d="M32 0C14.3 0 0 14.3 0 32S14.3 64 32 64l0 11c0 42.4 16.9 83.1 46.9 113.1L146.7 256 78.9 323.9C48.9 353.9 32 394.6 32 437l0 11c-17.7 0-32 14.3-32 32s14.3 32 32 32l32 0 256 0 32 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l0-11c0-42.4-16.9-83.1-46.9-113.1L237.3 256l67.9-67.9c30-30 46.9-70.7 46.9-113.1l0-11c17.7 0 32-14.3 32-32s-14.3-32-32-32L320 0 64 0 32 0zM288 437l0 11L96 448l0-11c0-25.5 10.1-49.9 28.1-67.9L192 301.3l67.9 67.9c18 18 28.1 42.4 28.1 67.9z"/></svg>
        );
    case 'create_project':
    case 'start_task':
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style={ iconStyle }><path d="M234.5 5.7c13.9-5 29.1-5 43.1 0l192 68.6C495 83.4 512 107.5 512 134.6l0 242.9c0 27-17 51.2-42.5 60.3l-192 68.6c-13.9 5-29.1 5-43.1 0l-192-68.6C17 428.6 0 404.5 0 377.4L0 134.6c0-27 17-51.2 42.5-60.3l192-68.6zM256 66L82.3 128 256 190l173.7-62L256 66zm32 368.6l160-57.1 0-188L288 246.6l0 188z"/></svg>
        );
    case 'send_message':
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style={ iconStyle }><path d="M64 0C28.7 0 0 28.7 0 64L0 352c0 35.3 28.7 64 64 64l96 0 0 80c0 6.1 3.4 11.6 8.8 14.3s11.9 2.1 16.8-1.5L309.3 416 448 416c35.3 0 64-28.7 64-64l0-288c0-35.3-28.7-64-64-64L64 0z"/></svg>
        );
    }
    return null;
};
