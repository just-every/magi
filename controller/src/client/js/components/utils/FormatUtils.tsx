import { ReactElement } from 'react';
import {
    ProcessData,
    ToolCallMessage,
    ToolResultMessage,
} from '../../context/SocketContext';

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
            const firstPart =
                newlineIndex > -1
                    ? afterPattern.substring(0, newlineIndex).trim()
                    : afterPattern.trim();
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

export const iconFromMessage = (
    message: ToolCallMessage | ToolResultMessage,
    rgb: string
): ReactElement => {
    const iconStyle = {
        height: '18px',
        verticalAlign: 'text-bottom',
        marginRight: '5px',
        fill: `rgba(${rgb} / 1)`,
    };
    const toolName = message.toolName?.startsWith('talk_to_')
        ? 'send_message'
        : message.toolName;
    if (!toolName) {
        return null as unknown as ReactElement;
    }
    switch (toolName) {
        case 'CodeAgent':
            return (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 448 512"
                    style={iconStyle}
                >
                    <path d="M0 96C0 60.7 28.7 32 64 32l320 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96zm262.2 71.9c-8.9 9.9-8.1 25 1.8 33.9L324.1 256l-60.2 54.2c-9.9 8.9-10.7 24-1.8 33.9s24 10.7 33.9 1.8l80-72c5.1-4.6 7.9-11 7.9-17.8s-2.9-13.3-7.9-17.8l-80-72c-9.9-8.9-25-8.1-33.9 1.8zm-78.1 33.9c9.9-8.9 10.7-24 1.8-33.9s-24-10.7-33.9-1.8l-80 72c-5.1 4.6-7.9 11-7.9 17.8s2.9 13.3 7.9 17.8l80 72c9.9 8.9 25 8.1 33.9-1.8s8.1-25-1.8-33.9L123.9 256l60.2-54.2z" />
                </svg>
            );
        case 'BrowserAgent':
            return (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 512 512"
                    style={iconStyle}
                >
                    <path d="M0 96C0 60.7 28.7 32 64 32l384 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96zm64 32a32 32 0 1 0 64 0 32 32 0 1 0 -64 0zm384 0c0-13.3-10.7-24-24-24l-240 0c-13.3 0-24 10.7-24 24s10.7 24 24 24l240 0c13.3 0 24-10.7 24-24z" />
                </svg>
            );
        case 'ReasoningAgent':
            return (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 512 512"
                    style={iconStyle}
                >
                    <path d="M512 224c0-35.3-28.7-64-64-64L64 160c-35.3 0-64 28.7-64 64L0 448c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-224zM440 80L72 80c-13.3 0-24 10.7-24 24s10.7 24 24 24l368 0c13.3 0 24-10.7 24-24s-10.7-24-24-24zM392 0L120 0C106.7 0 96 10.7 96 24s10.7 24 24 24l272 0c13.3 0 24-10.7 24-24s-10.7-24-24-24z" />
                </svg>
            );
        case 'SearchAgent':
        case 'web_search':
            return (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 512 512"
                    style={iconStyle}
                >
                    <path d="M352 256c0 22.2-1.2 43.6-3.3 64l-66.8 0 12.6-42.8c10.7-36.4-23.1-70.3-59.6-59.6l-74.6 21.9c.4-16.3 1.5-32.2 3.1-47.5l185.3 0c2.2 20.4 3.3 41.8 3.3 64zM20.4 280.6c-7.1 2.1-13.1 5.5-18.1 9.9C.8 279.2 0 267.7 0 256c0-22.1 2.8-43.5 8.1-64l123.1 0c-1.9 18.4-2.9 37.4-3.1 57L20.4 280.6zM231.4 491.6L272.4 352l71.9 0c-6.1 36.4-15.5 68.6-27 94.6c-10.5 23.6-22.2 40.7-33.5 51.5C272.6 508.8 263.3 512 256 512c-7.2 0-16.3-3.1-27.3-13.4c1-2.2 1.9-4.6 2.7-7.1zM380.8 192l123.1 0c5.3 20.5 8.1 41.9 8.1 64s-2.8 43.5-8.1 64l-123.1 0c2.1-20.6 3.2-42 3.2-64s-1.1-43.4-3.2-64zm112.6-32l-116.7 0c-10-63.9-29.8-117.4-55.3-151.6c78.3 20.7 142 77.5 171.9 151.6zm-325.7 0c6.1-36.4 15.5-68.6 27-94.7c10.5-23.6 22.2-40.7 33.5-51.5C239.4 3.2 248.7 0 256 0s16.6 3.2 27.8 13.8c11.3 10.8 23 27.9 33.5 51.5c11.6 26 20.9 58.2 27 94.7l-176.6 0zm-32.4 0L18.6 160C48.6 85.9 112.2 29.1 190.6 8.4C165.1 42.6 145.3 96.1 135.3 160zM493.4 352c-30 74.1-93.6 130.9-171.9 151.6c25.5-34.2 45.2-87.7 55.3-151.6l116.7 0zM39 308.5l204.8-60.2c12.1-3.6 23.4 7.7 19.9 19.9L203.5 473c-4.1 13.9-23.2 15.6-29.7 2.6l-28.7-57.3c-.7-1.3-1.5-2.6-2.5-3.7l-88 88c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l88-88c-1.1-1-2.3-1.9-3.7-2.5L36.4 338.2c-13-6.5-11.3-25.6 2.6-29.7z" />
                </svg>
            );
        case 'ShellAgent':
        case 'execute_command':
            return (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 448 512"
                    style={iconStyle}
                >
                    <path d="M0 96C0 60.7 28.7 32 64 32l320 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96zm70.3 55.8c-9 9.8-8.3 25 1.5 33.9L148.5 256 71.8 326.3c-9.8 9-10.4 24.1-1.5 33.9s24.1 10.4 33.9 1.5l96-88c5-4.5 7.8-11 7.8-17.7s-2.8-13.1-7.8-17.7l-96-88c-9.8-9-25-8.3-33.9 1.5zM216 336c-13.3 0-24 10.7-24 24s10.7 24 24 24l144 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-144 0z" />
                </svg>
            );
        case 'list_directory':
            return (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 448 512"
                    style={iconStyle}
                >
                    <path d="M448 96c0-35.3-28.7-64-64-64L64 32C28.7 32 0 60.7 0 96L0 416c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-320zM256 160c0 17.7-14.3 32-32 32l-96 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l96 0c17.7 0 32 14.3 32 32zm64 64c17.7 0 32 14.3 32 32s-14.3 32-32 32l-192 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l192 0zM192 352c0 17.7-14.3 32-32 32l-32 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l32 0c17.7 0 32 14.3 32 32z" />
                </svg>
            );
        case 'write_file':
        case 'write_source':
        case 'save_memory':
            return (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 512 512"
                    style={iconStyle}
                >
                    <path d="M471.6 21.7c-21.9-21.9-57.3-21.9-79.2 0L362.3 51.7l97.9 97.9 30.1-30.1c21.9-21.9 21.9-57.3 0-79.2L471.6 21.7zm-299.2 220c-6.1 6.1-10.8 13.6-13.5 21.9l-29.6 88.8c-2.9 8.6-.6 18.1 5.8 24.6s15.9 8.7 24.6 5.8l88.8-29.6c8.2-2.7 15.7-7.4 21.9-13.5L437.7 172.3 339.7 74.3 172.4 241.7zM96 64C43 64 0 107 0 160L0 416c0 53 43 96 96 96l256 0c53 0 96-43 96-96l0-96c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 96c0 17.7-14.3 32-32 32L96 448c-17.7 0-32-14.3-32-32l0-256c0-17.7 14.3-32 32-32l96 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L96 64z" />
                </svg>
            );
        case 'read_file':
        case 'read_source':
            return (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 448 512"
                    style={iconStyle}
                >
                    <path d="M0 96C0 60.7 28.7 32 64 32l320 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96zm262.2 71.9c-8.9 9.9-8.1 25 1.8 33.9L324.1 256l-60.2 54.2c-9.9 8.9-10.7 24-1.8 33.9s24 10.7 33.9 1.8l80-72c5.1-4.6 7.9-11 7.9-17.8s-2.9-13.3-7.9-17.8l-80-72c-9.9-8.9-25-8.1-33.9 1.8zm-78.1 33.9c9.9-8.9 10.7-24 1.8-33.9s-24-10.7-33.9-1.8l-80 72c-5.1 4.6-7.9 11-7.9 17.8s2.9 13.3 7.9 17.8l80 72c9.9 8.9 25 8.1 33.9-1.8s8.1-25-1.8-33.9L123.9 256l60.2-54.2z" />
                </svg>
            );
        case 'CUSTOM_TOOL':
            return (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 448 512"
                    style={iconStyle}
                >
                    <path d="M96 32l32 0 0 64L96 96c-17.7 0-32 14.3-32 32l0 32L0 160l0-32C0 75 43 32 96 32zM0 192l64 0 0 128L0 320 0 192zm384 0l64 0 0 128-64 0 0-128zm64-32l-64 0 0-32c0-17.7-14.3-32-32-32l-32 0 0-64 32 0c53 0 96 43 96 96l0 32zm0 192l0 32c0 53-43 96-96 96l-32 0 0-64 32 0c17.7 0 32-14.3 32-32l0-32 64 0zM64 352l0 32c0 17.7 14.3 32 32 32l32 0 0 64-32 0c-53 0-96-43-96-96l0-32 64 0zm96 128l0-64 128 0 0 64-128 0zm0-384l0-64 128 0 0 64L160 96z" />
                </svg>
            );
        case 'terminate_running_task':
        case 'terminate_running_tool':
        case 'delete_memory':
            return (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 448 512"
                    style={iconStyle}
                >
                    <path d="M64 32C28.7 32 0 60.7 0 96L0 416c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-320c0-35.3-28.7-64-64-64L64 32zm234.1 83.6c5.8 4.7 7.6 12.9 4.3 19.6L249.9 240l70.1 0c6.8 0 12.9 4.3 15.1 10.7s.2 13.5-5.1 17.8l-160 128c-5.9 4.7-14.2 4.7-20.1-.1s-7.6-12.9-4.3-19.6L198.1 272 128 272c-6.8 0-12.8-4.3-15.1-10.7s-.2-13.5 5.1-17.8l160-128c5.9-4.7 14.2-4.7 20.1 .1z" />
                </svg>
            );
        case 'find_memory':
            return (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 512 512"
                    style={iconStyle}
                >
                    <path d="M448 480L64 480c-35.3 0-64-28.7-64-64L0 96C0 60.7 28.7 32 64 32l128 0c20.1 0 39.1 9.5 51.2 25.6l19.2 25.6c6 8.1 15.5 12.8 25.6 12.8l160 0c35.3 0 64 28.7 64 64l0 256c0 35.3-28.7 64-64 64zM336 272c0-53-43-96-96-96s-96 43-96 96s43 96 96 96c17.8 0 34.4-4.8 48.7-13.2L327 393.1c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-38.3-38.3c8.5-14.3 13.3-31 13.3-48.9zm-96-48a48 48 0 1 1 0 96 48 48 0 1 1 0-96z" />
                </svg>
            );
        case 'inspect_running_task':
        case 'inspect_running_tool':
        case 'get_task_status':
        case 'check_all_task_health':
            return (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 512 512"
                    style={iconStyle}
                >
                    <path d="M64 32C28.7 32 0 60.7 0 96L0 416c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-320c0-35.3-28.7-64-64-64L64 32zM96 96l320 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L96 160c-17.7 0-32-14.3-32-32s14.3-32 32-32z" />
                </svg>
            );

        case 'wait_for_running_task':
        case 'wait_for_running_tool':
        case 'set_thought_delay':
            return (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 512 512"
                    style={iconStyle}
                >
                    <path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM224 192l0 128c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-128c0-17.7 14.3-32 32-32s32 14.3 32 32zm128 0l0 128c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-128c0-17.7 14.3-32 32-32s32 14.3 32 32z" />
                </svg>
            );
        case 'start_task':
            return (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 512 512"
                    style={iconStyle}
                >
                    <path d="M234.5 5.7c13.9-5 29.1-5 43.1 0l192 68.6C495 83.4 512 107.5 512 134.6l0 242.9c0 27-17 51.2-42.5 60.3l-192 68.6c-13.9 5-29.1 5-43.1 0l-192-68.6C17 428.6 0 404.5 0 377.4L0 134.6c0-27 17-51.2 42.5-60.3l192-68.6zM256 66L82.3 128 256 190l173.7-62L256 66zm32 368.6l160-57.1 0-188L288 246.6l0 188z" />
                </svg>
            );
        case 'create_project':
            return (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 576 512"
                    style={iconStyle}
                >
                    <path d="M290.8 48.6l78.4 29.7L288 109.5 206.8 78.3l78.4-29.7c1.8-.7 3.8-.7 5.7 0zM136 92.5l0 112.2c-1.3 .4-2.6 .8-3.9 1.3l-96 36.4C14.4 250.6 0 271.5 0 294.7L0 413.9c0 22.2 13.1 42.3 33.5 51.3l96 42.2c14.4 6.3 30.7 6.3 45.1 0L288 457.5l113.5 49.9c14.4 6.3 30.7 6.3 45.1 0l96-42.2c20.3-8.9 33.5-29.1 33.5-51.3l0-119.1c0-23.3-14.4-44.1-36.1-52.4l-96-36.4c-1.3-.5-2.6-.9-3.9-1.3l0-112.2c0-23.3-14.4-44.1-36.1-52.4l-96-36.4c-12.8-4.8-26.9-4.8-39.7 0l-96 36.4C150.4 48.4 136 69.3 136 92.5zM392 210.6l-82.4 31.2 0-89.2L392 121l0 89.6zM154.8 250.9l78.4 29.7L152 311.7 70.8 280.6l78.4-29.7c1.8-.7 3.8-.7 5.7 0zm18.8 204.4l0-100.5L256 323.2l0 95.9-82.4 36.2zM421.2 250.9c1.8-.7 3.8-.7 5.7 0l78.4 29.7L424 311.7l-81.2-31.1 78.4-29.7zM523.2 421.2l-77.6 34.1 0-100.5L528 323.2l0 90.7c0 3.2-1.9 6-4.8 7.3z" />
                </svg>
            );
        case 'task_complete':
            return (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 448 512"
                    style={iconStyle}
                >
                    <path d="M64 32C28.7 32 0 60.7 0 96L0 416c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-320c0-35.3-28.7-64-64-64L64 32zM337 209L209 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L303 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z" />
                </svg>
            );
        case 'task_fatal_error':
            return (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 448 512"
                    style={iconStyle}
                >
                    <path d="M64 32C28.7 32 0 60.7 0 96L0 416c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-320c0-35.3-28.7-64-64-64L64 32zm160 96c13.3 0 24 10.7 24 24l0 112c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-112c0-13.3 10.7-24 24-24zM192 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z" />
                </svg>
            );
        case 'send_message':
            return (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 512 512"
                    style={iconStyle}
                >
                    <path d="M64 0C28.7 0 0 28.7 0 64L0 352c0 35.3 28.7 64 64 64l96 0 0 80c0 6.1 3.4 11.6 8.8 14.3s11.9 2.1 16.8-1.5L309.3 416 448 416c35.3 0 64-28.7 64-64l0-288c0-35.3-28.7-64-64-64L64 0z" />
                </svg>
            );
    }

    return null as unknown as ReactElement;
};
