/**
 * ToolCallMessage Component - compact JSON-first view (June 2025)
 * ------------------------------------------------------------------
 * • Parameters are now shown ONLY as an interactive JSON tree.
 * • The tool/function name wraps the tree with "name(" … ")" lines so it
 *   still reads like a function call.
 * • If params fail to parse as JSON, falls back to Markdown or plain text.
 * ------------------------------------------------------------------
 */

import React, { useMemo } from 'react';
import type { FC } from 'react';

// ── Libraries ────────────────────────────────────────────────────────────────
import { JSONTree } from 'react-json-tree';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ── Types ────────────────────────────────────────────────────────────────────
import {
    ToolCallMessage as ToolCallMessageType,
    ToolResultMessage as ToolResultMessageType,
} from '../../context/SocketContext';
import BaseMessage from './BaseMessage';
import { getToolResultContent } from '../utils/ProcessBoxUtils';

const theme = {
    base00: '#0c0d0e',
    base01: '#2e2f30',
    base02: '#515253',
    base03: '#737475',
    base04: '#959697',
    base05: '#b7b8b9',
    base06: '#dadbdc',
    base07: '#fcfdfe', // Function title
    base08: '#e31a1c',
    base09: '#ff8900', // Numbers
    base0A: '#dca060',
    base0B: '#00b9ff', // Strings
    base0C: '#80b1d3',
    base0D: '#c2c2c2', // Headings
    base0E: '#756bb1',
    base0F: '#b15928',
};

interface ToolCallMessageProps {
    rgb: string;
    message: ToolCallMessageType;
    complete: boolean;
    callFollows: boolean;
    defaultCollapsed?: boolean;
    result?: ToolResultMessageType;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const isMarkdowny = (s: string) => /[*_[#`>|~-]/.test(s) && s.includes('\n');

const titleify = (name: string) =>
    name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// Extract a meaningful identifier from tool params for the title
function extractIdentifier(toolName: string, params: unknown): string | null {
    if (!params || typeof params !== 'object') return null;

    const p = params as Record<string, unknown>;

    // Common identifier field names in priority order
    const identifierFields = [
        'name',
        'id',
        'project_id',
        'process_id',
        'agent_id',
        'title',
        'filename',
        'path',
        'file_path',
        'url',
        'query',
        'command',
        'message',
        'description',
    ];

    // Try to find a suitable identifier
    for (const field of identifierFields) {
        if (field in p && p[field]) {
            const value = String(p[field]);
            // Truncate if too long
            if (value.length > 40) {
                return value.substring(0, 37) + '...';
            }
            return value;
        }
    }

    // For specific tools, try to create meaningful identifiers
    if (toolName === 'create_project' && p.simple_description) {
        const desc = String(p.simple_description);
        return desc.length > 40 ? desc.substring(0, 37) + '...' : desc;
    }

    return null;
}

function parseParams(raw: unknown): { obj: unknown | null; txt: string } {
    if (raw == null) return { obj: null, txt: '' };
    if (typeof raw === 'object')
        return { obj: raw, txt: JSON.stringify(raw, null, 2) };
    const str = String(raw).trim();
    if (str.startsWith('{') && str.endsWith('}')) {
        try {
            const parsed = JSON.parse(str);
            return { obj: parsed, txt: JSON.stringify(parsed, null, 2) };
        } catch {
            /* ignore – fallback to string */
        }
    }
    return { obj: null, txt: str };
}

// ── Component ────────────────────────────────────────────────────────────────
const ToolCallMessage: FC<ToolCallMessageProps> = ({
    rgb,
    message,
    complete,
    callFollows,
    defaultCollapsed = false,
    result,
}) => {
    // Memoised params
    const { obj: paramsObj, txt: paramsTxt } = useMemo(
        () => parseParams(message.toolParams),
        [message.toolParams]
    );

    // Extract identifier for enhanced title
    const identifier = useMemo(
        () => extractIdentifier(message.toolName, message.toolParams),
        [message.toolName, message.toolParams]
    );

    // Process result if available
    const resultData = useMemo(() => {
        if (!result) return null;
        return getToolResultContent(result);
    }, [result]);

    // Custom renderer for JSONTree string values → Markdown when useful
    // Custom renderer for JSONTree primitive values (string/number/boolean)
    const valueRenderer = (display: string, value: unknown) => {
        if (typeof value !== 'string') return <>{display}</>;

        const trimmed = value.trim();

        // 👉 Parse embedded JSON objects/arrays that are stored as strings
        const looksLikeJson =
            (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'));

        if (looksLikeJson) {
            try {
                const parsed = JSON.parse(trimmed);
                return (
                    <JSONTree
                        data={parsed}
                        hideRoot
                        theme={theme}
                        shouldExpandNodeInitially={kp => kp.length < 6}
                        /* reuse the same renderer so nested strings also benefit */
                        valueRenderer={valueRenderer}
                    />
                );
            } catch {
                /* fall through to markdown/plain */
            }
        }

        // Render markdown if the string looks Markdown‑ish
        if (isMarkdowny(value)) {
            return (
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{ p: p => <span {...p} /> }}
                >
                    {value}
                </ReactMarkdown>
            );
        }

        // Plain string fall‑back
        return <>{display}</>;
    };

    // Fallback visual when params are not an object
    const renderFallback = () => {
        if (!paramsTxt) return null; // toolName() – no params

        if (isMarkdowny(paramsTxt)) {
            return (
                <div className="pt-1">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {paramsTxt}
                    </ReactMarkdown>
                </div>
            );
        }

        return (
            <pre className="pt-1 whitespace-pre-wrap text-sm">{paramsTxt}</pre>
        );
    };

    const enhancedTitle = identifier
        ? `${titleify(message.toolName)}: ${identifier}`
        : titleify(message.toolName);

    const status = complete ? '' : ' (Running...)';

    return (
        <BaseMessage
            rgb={rgb}
            message={message}
            defaultCollapsed={defaultCollapsed}
            title={enhancedTitle + status}
            subtitle={message.agent?.model}
            className={`tool-message ${callFollows ? 'call-follows' : ''}`}
        >
            <div
                className="tool-call-block"
                style={{
                    backgroundColor: theme.base00,
                    color: theme.base07,
                }}
            >
                <div className="function-header">
                    {`${message.toolName}`}&nbsp;(
                </div>

                {/* Parameters core */}
                {paramsObj ? (
                    <JSONTree
                        data={paramsObj}
                        shouldExpandNodeInitially={kp => kp.length < 6}
                        valueRenderer={valueRenderer}
                        hideRoot
                        theme={theme}
                    />
                ) : (
                    renderFallback()
                )}

                <div className="function-footer">)</div>

                {/* Render result if available */}
                {resultData && (
                    <div className="tool-result-section">
                        <div className="tool-result-content">
                            {resultData.content && (
                                <pre>{resultData.content}</pre>
                            )}
                            {/* Display image if an image path was found */}
                            {resultData.imagePath && (
                                <div className="magi-output-image">
                                    {resultData.imagePath.startsWith(
                                        'data:image/'
                                    ) ? (
                                        <img
                                            src={resultData.imagePath}
                                            alt={`Result from ${message.toolName}`}
                                            className="img-fluid"
                                        />
                                    ) : (
                                        <a
                                            href={resultData.imagePath}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <img
                                                src={resultData.imagePath}
                                                alt={`Result from ${message.toolName}`}
                                                className="img-fluid"
                                            />
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </BaseMessage>
    );
};

export default ToolCallMessage;
