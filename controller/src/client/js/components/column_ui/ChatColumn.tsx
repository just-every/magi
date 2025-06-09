import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import AutoScrollContainer from '../ui/AutoScrollContainer';
import { ProcessData, ToolCallMessage } from '../../context/SocketContext';
import { GlobalCostData } from '../../../../types';
import CollapsibleSection from './CollapsibleSection';
import { useSocket } from '../../context/SocketContext'; // Import useSocket
import TextareaAutosize from 'react-textarea-autosize'; // Import TextareaAutosize
import CostDisplay from '../ui/CostDisplay'; // Import CostDisplay
import StatusDisplay from '../ui/StatusDisplay'; // Import StatusDisplay
import { parseMarkdown } from '../utils/MarkdownUtils';

// Helper function to check if a URL points to an image
// const isImageUrl = (url: string): boolean => {
//     try {
//         // Basic check for common image extensions
//         const pathname = new URL(url).pathname.toLowerCase();
//         return /\.(jpg|jpeg|png|gif|webp|svg)$/.test(pathname);
//     } catch (e) {
//         // If URL parsing fails or it doesn't have a recognized extension, treat as non-image
//         return false;
//     }
// };

interface ChatColumnProps {
    processes: Map<string, ProcessData>;
    coreProcessId: string | null;
    costData: GlobalCostData | null;
    isPaused: boolean;
    togglePauseState: () => void;
}

const ChatColumn: React.FC<ChatColumnProps> = ({
    processes,
    coreProcessId,
    costData,
    isPaused,
    togglePauseState,
}) => {
    const {
        sendCoreCommand,
        runCommand,
        isAudioEnabled,
        toggleAudioState,
        isTelegramEnabled,
        toggleTelegramState,
    } = useSocket(); // Get sendCoreCommand, runCommand, and toggle controls
    const [command, setCommand] = useState('');
    const [isMultiline, setIsMultiline] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [isFirstProcess, setIsFirstProcess] = useState(processes.size === 0);

    const coreProcess = coreProcessId
        ? (processes.get(coreProcessId) as ProcessData | undefined)
        : null;
    const agentName =
        coreProcess?.agent?.name && !coreProcess.agent.name.startsWith('AI-')
            ? coreProcess.agent.name
            : '';

    useEffect(() => {
        // Focus input when visible
        if (isFirstProcess && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isFirstProcess]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (isFirstProcess && processes.size > 0) {
                setIsFirstProcess(false);
            } else if (!isFirstProcess && processes.size === 0) {
                setIsFirstProcess(true);
            }
        }, 100);

        return () => clearTimeout(timer);
    }, [isFirstProcess, processes.size]);

    // Filter messages to only show talk_to_* results and user messages
    const messages =
        coreProcess?.agent?.messages.filter(msg => {
            // Always keep user messages
            if (msg.type === 'user') return true;

            // For tool results, only keep talk_to_* results
            if (
                msg.type === 'tool_call' &&
                (msg as ToolCallMessage).toolName.startsWith('talk_to_')
            ) {
                return true;
            }

            return false;
        }) || [];

    // Format cost to two decimal places
    const formatCost = (cost: number) => {
        return `$${cost.toFixed(2)}`;
    };

    // Extract cost values safely
    const totalCost = costData?.usage?.cost?.total || 0;
    const costPerMin = costData?.costPerMinute || 0;

    // Check if content is multiline
    useEffect(() => {
        setIsMultiline(command.includes('\n'));
    }, [command]);

    const handleSubmit = (e: React.FormEvent) => {
        if (e.preventDefault) e.preventDefault();

        if (command.trim()) {
            if (coreProcessId) {
                sendCoreCommand(command); // Send to existing core process
            } else {
                // If somehow no core process exists, maybe start a new one?
                // Or display an error? For now, let's try starting one.
                console.warn(
                    'No core process found, attempting to start a new one with the command.'
                );
                runCommand(command);
            }
            setCommand('');
            setIsMultiline(false);
            if (inputRef.current) {
                inputRef.current.style.height = 'auto'; // Reset height after submit
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Enter without shift submits the form
        if (e.key === 'Enter' && !e.shiftKey) {
            if (e.preventDefault) e.preventDefault();
            handleSubmit(e);
        }
    };

    return (
        <div
            className="chat-column h-100 d-flex flex-column overflow-scroll"
            style={{ padding: '0.5rem' }}
        >
            {/* Status Section */}
            <CollapsibleSection
                title="Status"
                className="pe-2"
                collapsedSummary={
                    <>
                        {!isPaused && !isFirstProcess && isAudioEnabled && (
                            <i
                                className={`bi bi-volume-up-fill text-primary me-3`}
                            />
                        )}
                        {!isPaused && !isFirstProcess && isTelegramEnabled && (
                            <i className={`bi bi-telegram text-primary me-3`} />
                        )}
                        <i
                            className={`bi bi-circle-fill me-3`}
                            style={{
                                color: isPaused
                                    ? '#00000'
                                    : isFirstProcess
                                      ? '#28a745'
                                      : 'var(--accent-primary)',
                            }}
                        />
                        {isPaused
                            ? 'Paused'
                            : isFirstProcess
                              ? 'Ready'
                              : 'Running'}
                    </>
                }
            >
                <div className="status-details">
                    <div className="d-flex justify-content-between align-items-center">
                        <div>
                            <span className="fw-bold me-2">Status:</span>
                            <span>
                                <i
                                    className={`bi bi-circle-fill mx-2 ${isPaused ? 'text-dark' : isFirstProcess ? 'text-success' : 'text-primary'}`}
                                />
                                {isPaused
                                    ? 'Paused'
                                    : isFirstProcess
                                      ? 'Ready'
                                      : 'Running'}
                            </span>
                        </div>
                        <button
                            className={`btn btn-sm ${isPaused ? 'btn-primary text-white' : 'btn-light'}`}
                            onClick={togglePauseState}
                        >
                            <i
                                className={`me-1 bi ${isPaused ? 'bi-play-fill' : 'bi-pause-fill'}`}
                            />{' '}
                            {isPaused ? 'Resume' : 'Pause'}
                        </button>
                    </div>

                    <div className="d-flex justify-content-between align-items-center mt-3">
                        <div>
                            <span className="fw-bold me-2">Voice:</span>
                            <span>
                                <i
                                    className={`bi ${isAudioEnabled ? 'bi-volume-up-fill' : 'bi-x'} mx-2 ${isAudioEnabled ? 'text-primary' : 'text-dark'}`}
                                />
                                {isAudioEnabled ? 'Playing' : 'Muted'}
                            </span>
                        </div>
                        <button
                            className={`btn btn-sm ${!isAudioEnabled ? 'btn-primary text-white' : 'btn-light'}`}
                            onClick={toggleAudioState}
                        >
                            <i
                                className={`me-1 bi ${isAudioEnabled ? 'bi-x' : 'bi-volume-up-fill'}`}
                            />{' '}
                            {isAudioEnabled ? 'Mute' : 'Play'}
                        </button>
                    </div>

                    <div className="d-flex justify-content-between align-items-center mt-3">
                        <div>
                            <span className="fw-bold me-2">Telegram:</span>
                            <span>
                                <i
                                    className={`bi ${isTelegramEnabled ? 'bi-telegram' : 'bi-x'} mx-2 ${isTelegramEnabled ? 'text-primary' : 'text-dark'}`}
                                />
                                {isTelegramEnabled ? 'Sending' : 'Muted'}
                            </span>
                        </div>
                        <button
                            className={`btn btn-sm ${!isTelegramEnabled ? 'btn-primary text-white' : 'btn-light'}`}
                            onClick={toggleTelegramState}
                        >
                            <i
                                className={`me-1 bi ${isTelegramEnabled ? 'bi-x' : 'bi-telegram'}`}
                            />{' '}
                            {isTelegramEnabled ? 'Mute' : 'Send'}
                        </button>
                    </div>

                    <div className="mt-4">
                        <StatusDisplay />
                    </div>
                </div>
            </CollapsibleSection>

            {/* Cost Section */}
            <CollapsibleSection
                title="Cost"
                className="pe-2"
                collapsedSummary={
                    costData
                        ? `${formatCost(totalCost)} (${formatCost(costPerMin)}/min)`
                        : ''
                }
            >
                {costData ? (
                    <CostDisplay forceExpand={true} />
                ) : (
                    <div className="text-muted">
                        Usage data not yet collected.
                    </div>
                )}
            </CollapsibleSection>

            {/* Messages */}
            <AutoScrollContainer className="chat-messages flex-grow-1 mt-3 pe-2">
                {messages.length > 0 &&
                    messages.map(message => {
                        const toolCallMessage =
                            message.type === 'tool_call'
                                ? (message as ToolCallMessage)
                                : null;

                        let document = null;
                        const media = null;
                        // Check if toolCallMessage exists before accessing its properties
                        if (
                            toolCallMessage &&
                            toolCallMessage.toolParams &&
                            toolCallMessage.toolParams.document
                        ) {
                            document = (
                                <div className={`mt-2`}>
                                    <div
                                        className={`d-inline-block p-3 rounded-top-3 bg-white text-black border border-light-subtle rounded-end-3 font-monospace`}
                                    >
                                        <div
                                            style={{
                                                textAlign: 'left',
                                                fontSize: '0.8em',
                                                backgroundColor:
                                                    'rgb(255 255 255 / 35%) !important',
                                                borderColor:
                                                    'rgb(255 255 255 / 65%) !important',
                                            }}
                                            dangerouslySetInnerHTML={parseMarkdown(
                                                toolCallMessage.toolParams
                                                    .document as string
                                            )}
                                        />
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div key={message.id} className="mb-4">
                                <div
                                    className={`${message.type === 'user' ? 'text-end' : ''}`}
                                >
                                    <div
                                        className={`d-inline-block p-3 rounded-top-3 ${
                                            message.type === 'user'
                                                ? 'bg-primary text-white rounded-start-3'
                                                : 'bg-white rounded-end-3'
                                        }`}
                                        style={{
                                            maxWidth: '85%',
                                            textAlign: 'left',
                                        }}
                                    >
                                        {toolCallMessage
                                            ? toolCallMessage.command
                                            : typeof message.content ===
                                                'string'
                                              ? message.content
                                              : typeof message.content ===
                                                  'object'
                                                ? JSON.stringify(
                                                      message.content,
                                                      null,
                                                      2
                                                  )
                                                : String(message.content)}
                                    </div>
                                </div>
                                {document}
                                {media}
                            </div>
                        );
                    })}
            </AutoScrollContainer>

            {/* Chat Input */}
            <div className="mt-auto pt-3">
                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <TextareaAutosize
                            id="chat-command-input"
                            className={`form-control chat-col-input py-2 px-3 ${isMultiline ? 'multiline' : ''}`}
                            placeholder={
                                isFirstProcess
                                    ? 'Start task...'
                                    : `Talk${agentName ? ' to ' + agentName : ''}...`
                            }
                            value={command}
                            onChange={e => setCommand(e.target.value)}
                            onKeyDown={handleKeyDown}
                            ref={inputRef}
                            autoComplete="off"
                            minRows={2}
                            maxRows={10}
                        />
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ChatColumn;
