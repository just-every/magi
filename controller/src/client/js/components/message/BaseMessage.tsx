/**
 * BaseMessage Component
 * Unified message wrapper for consistent rendering across all message types
 */
import React, { ReactNode, useState, useEffect, useRef } from 'react';
import { ClientMessage } from '../../context/SocketContext';
import { iconFromMessage } from '../utils/FormatUtils';

/**
 * Intelligently truncate message titles based on common patterns
 */
function truncateTitle(title: string): string {
    // Remove "System update:" prefix
    let processed = title.replace(/^System update:\s*/i, '');

    // Handle "Project [id] created: [id]" pattern
    const projectCreatedMatch = processed.match(
        /^Project\s+([a-zA-Z0-9-_]+)\s+created:\s*\1$/i
    );
    if (projectCreatedMatch) {
        return `Project ${projectCreatedMatch[1]} Created`;
    }

    // Handle "The file `filename` has been successfully created..." pattern
    const fileCreatedMatch = processed.match(
        /^The file\s+`([^`]+)`\s+has been successfully created/i
    );
    if (fileCreatedMatch) {
        return `File "${fileCreatedMatch[1]}" Created`;
    }

    // Handle error messages - simplify and remove details after punctuation
    if (processed.match(/^Error:/i)) {
        // Extract the main error type
        const errorMatch = processed.match(
            /^Error:\s*([^(]+?)(?:\s*\([^)]+\))?:\s*(.+)/i
        );
        if (errorMatch) {
            const errorType = errorMatch[1].trim();
            // Convert to title case and simplify
            return (
                'Error: ' +
                errorType
                    .split(/\s+/)
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ')
            );
        }
    }

    // Handle "System paused" and similar status messages
    if (processed.match(/^System\s+(paused|resumed|stopped|started)/i)) {
        const statusMatch = processed.match(/^System\s+(\w+)/i);
        if (statusMatch) {
            return (
                'System ' +
                statusMatch[1].charAt(0).toUpperCase() +
                statusMatch[1].slice(1)
            );
        }
    }

    // For other messages, truncate at common punctuation boundaries
    const punctuationIndex = processed.search(/[.!?;]|\s+-\s+|\sand\s/i);
    if (punctuationIndex > 0 && punctuationIndex < 50) {
        processed = processed.substring(0, punctuationIndex).trim();
    }

    // Convert to title case for better readability
    if (
        processed.length > 0 &&
        !processed.match(/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/)
    ) {
        processed = processed
            .split(/\s+/)
            .map((word, index) => {
                // Don't capitalize certain words unless they're first
                const lowercaseWords = [
                    'a',
                    'an',
                    'the',
                    'and',
                    'or',
                    'but',
                    'in',
                    'on',
                    'at',
                    'to',
                    'for',
                    'of',
                    'with',
                    'by',
                ];
                if (index > 0 && lowercaseWords.includes(word.toLowerCase())) {
                    return word.toLowerCase();
                }
                return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join(' ');
    }

    // Final length check - if still too long, truncate with ellipsis
    if (processed.length > 60) {
        processed = processed.substring(0, 57) + '...';
    }

    return processed;
}

interface BaseMessageProps {
    rgb: string;
    message: ClientMessage;
    defaultCollapsed: boolean;
    title: string;
    subtitle?: string;
    children: ReactNode;
    className?: string;
}

const BaseMessage: React.FC<BaseMessageProps> = ({
    rgb,
    message,
    defaultCollapsed,
    title,
    subtitle,
    children,
    className = '',
}) => {
    const messageType = message.type.replace('_', '-');
    const baseClassName = `message-wrapper ${messageType}-wrapper ${className}`;
    const [overrideCollapsed, setOverrideCollapsed] = useState(-1);
    const [isAnimating, setIsAnimating] = useState(false);
    const [shouldRenderContent, setShouldRenderContent] =
        useState(!defaultCollapsed);
    const contentRef = useRef<HTMLDivElement>(null);

    const isCollapsed =
        overrideCollapsed > -1 ? overrideCollapsed === 1 : defaultCollapsed;

    const toggleCollapsed = () => {
        if (isAnimating) return; // Prevent toggling during animation

        setIsAnimating(true);

        if (isCollapsed) {
            // Expanding: render content immediately
            setShouldRenderContent(true);
            // Small delay to ensure content is rendered before animation starts
            setTimeout(() => {
                setOverrideCollapsed(0);
            }, 10);
        } else {
            // Collapsing: start animation first
            setOverrideCollapsed(1);
        }
    };

    // Handle animation end
    useEffect(() => {
        if (!isAnimating) return;

        const timer = setTimeout(() => {
            setIsAnimating(false);
            if (isCollapsed) {
                // Remove content after collapse animation completes
                setShouldRenderContent(false);
            }
        }, 300); // Match CSS transition duration

        return () => clearTimeout(timer);
    }, [isCollapsed, isAnimating]);

    const quiet =
        message.type === 'assistant' ||
        ('toolName' in message &&
            [
                'wait_for_running_task',
                'wait_for_running_tool',
                'set_thought_delay',
            ].includes(message.toolName));

    return (
        <div
            className={`${baseClassName} ${isCollapsed ? 'collapsed' : 'expanded'} ${quiet ? 'quiet' : ''}`}
            data-message-id={message.id}
        >
            <div
                className="message-header-unified"
                onClick={toggleCollapsed}
                role={'button'}
                tabIndex={0}
                onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleCollapsed();
                    }
                }}
            >
                <div className="message-header-left">
                    <span
                        className={
                            'message-icon' +
                            (defaultCollapsed ? '' : ' animated')
                        }
                    >
                        {iconFromMessage(message, rgb)}
                    </span>
                    <div className="message-header-text">
                        <div className="message-title-unified">
                            {truncateTitle(title)}
                        </div>
                        {subtitle && (
                            <div className="message-subtitle">{subtitle}</div>
                        )}
                    </div>
                    <div
                        className="message-toggle-indicator"
                        aria-hidden="true"
                    >
                        <svg
                            width="15"
                            height="15"
                            viewBox="0 0 12 12"
                            style={{ fill: `rgba(${rgb} / 1)` }}
                        >
                            <path d="M3 3L9 3L6 7Z" />
                        </svg>
                    </div>
                </div>
            </div>
            {shouldRenderContent && (
                <div className="message-content-wrapper" ref={contentRef}>
                    {children}
                </div>
            )}
        </div>
    );
};

export default BaseMessage;
