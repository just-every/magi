import * as React from 'react';
import { parseMarkdown } from '@components/utils/MarkdownUtils';
/**
 * UserMessage Component
 * Renders messages from the user
 */

interface ContentItem {
    type: 'input_text' | 'input_image' | 'input_file';
    text?: string;
    image_url?: string;
    filename?: string;
    file_id?: string;
    detail?: string;
}

interface MessageContentProps {
    content: string | ContentItem[] | any;
}

const MessageContent: React.FC<MessageContentProps> = ({ content }) => {
    // If content is a string, check if it's JSON
    if (typeof content === 'string') {
        // Try to parse JSON that contains contentArray
        try {
            const parsed = JSON.parse(content);
            if (parsed.contentArray && Array.isArray(parsed.contentArray)) {
                return <MessageContent content={parsed.contentArray} />;
            }
        } catch (e) {
            // Not JSON, render as text
        }

        // Regular string content
        return <div dangerouslySetInnerHTML={parseMarkdown(content)} />;
    }

    // If content is an array of content items
    if (Array.isArray(content)) {
        return (
            <div className="structured-content">
                {content.map((item, index) => {
                    if (item.type === 'input_text') {
                        return (
                            <div key={index}>
                                {item.text}
                            </div>
                        );
                    } else if (item.type === 'input_image') {
                        return (
                            <div key={index}>
                                <img
                                    src={item.image_url}
                                    alt="Uploaded image"
                                    style={{
                                        maxWidth: '100%',
                                        maxHeight: '400px',
                                        borderRadius: '8px',
                                    }}
                                    className="d-block"
                                />
                            </div>
                        );
                    } else if (item.type === 'input_file') {
                        return (
                            <div key={index}>
                                <div className="d-inline-flex align-items-center bg-light rounded p-2">
                                    <i className="bi bi-file-earmark me-2"></i>
                                    <span>{item.filename || item.file_id}</span>
                                </div>
                            </div>
                        );
                    }
                    return null;
                })}
            </div>
        );
    }

    // For other object types, stringify them
    if (typeof content === 'object') {
        return <pre>{JSON.stringify(content, null, 2)}</pre>;
    }

    // Default: convert to string
    return <>{String(content)}</>;
};

export default MessageContent;