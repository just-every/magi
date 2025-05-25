import * as React from 'react';
import { useSocket } from '../../context/SocketContext';
import { ProcessData } from '../../context/SocketContext';
import { PRIMARY_RGB } from '../../utils/constants';
import { getStatusIcon } from '../utils/FormatUtils';
import { TruncatedStartText } from '../utils/TextFormatComponents';
import AutoScrollContainer from '../ui/AutoScrollContainer';

import { ProcessStatus } from '../../../../types';

interface ProcessTreeColumnProps {
    selectedItemId: string | null;
    setSelectedItemId: (id: string) => void;
    statusFilter?: ProcessStatus[];
}

const ProcessTreeColumn: React.FC<ProcessTreeColumnProps> = ({
    selectedItemId,
    setSelectedItemId,
    statusFilter,
}) => {
    const { processes, coreProcessId } = useSocket();

    const showCompletedOnly =
        statusFilter &&
        statusFilter.length === 1 &&
        statusFilter[0] === 'completed';

    const processList = (Array.from(processes.values()) as ProcessData[])
        .filter(p => {
            if (!statusFilter) return true;
            if (showCompletedOnly) {
                if (p.status === 'completed') return true;
                const workers = p.agent?.workers;
                if (!workers) return false;
                return Array.from(workers.values()).some(
                    w => w.statusEvent?.status === 'completed'
                );
            }
            return statusFilter.includes(p.status as ProcessStatus);
        })
        .sort((a, b) => {
            const processA = a as ProcessData;
            const processB = b as ProcessData;
            if (processA.id === coreProcessId) return -1; // Core process first
            if (processB.id === coreProcessId) return 1; // Core process first
            return processA.id.localeCompare(processB.id);
        });

    // Select a process or agent
    const handleSelect = (itemId: string) => {
        setSelectedItemId(itemId);
    };

    // Get the most recent output text from a process or agent
    const getLastText = (
        process: ProcessData,
        defaultText: string
    ): JSX.Element => {
        if (
            !process.agent ||
            !process.agent.messages ||
            process.agent.messages.length === 0
        ) {
            return <TruncatedStartText text={defaultText} />;
        }

        // Get the most recent message (that isn't a thinking message)
        const messages = process.agent.messages;
        let lastMessage = defaultText;

        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];

            // Handle different message types
            if (msg.type === 'assistant' && !msg.thinking_content) {
                // Regular text message
                if (msg.content && typeof msg.content === 'string') {
                    lastMessage = msg.content;
                    break;
                }
            }
            // Handle tool call messages
            else if (
                msg.type === 'tool_call' &&
                msg.content &&
                typeof msg.content === 'string'
            ) {
                lastMessage = `[Tool] ${msg.content}`;
                break;
            }
            // Handle tool result messages
            else if (
                msg.type === 'tool_result' &&
                msg.content &&
                typeof msg.content === 'string'
            ) {
                lastMessage = `[Result] ${msg.content}`;
                break;
            }
        }

        return <TruncatedStartText text={lastMessage} />;
    };

    // Get the most recent output text from an agent
    const getAgentLastText = (
        process: ProcessData,
        agentId: string,
        defaultText: string
    ): JSX.Element => {
        if (!process.agent || !process.agent.workers)
            return <TruncatedStartText text={defaultText} />;

        const agent = process.agent.workers.get(agentId);
        if (!agent || !agent.messages || agent.messages.length === 0) {
            return <TruncatedStartText text={defaultText} />;
        }

        // Get the most recent message
        const messages = agent.messages;
        let lastMessage = defaultText;

        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];

            // Handle different message types
            if (msg.type === 'assistant' && !msg.thinking_content) {
                // Regular text message
                if (msg.content && typeof msg.content === 'string') {
                    lastMessage = msg.content;
                    break;
                }
            }
            // Handle tool call messages
            else if (
                msg.type === 'tool_call' &&
                msg.content &&
                typeof msg.content === 'string'
            ) {
                lastMessage = `[Tool] ${msg.content}`;
                break;
            }
            // Handle tool result messages
            else if (
                msg.type === 'tool_result' &&
                msg.content &&
                typeof msg.content === 'string'
            ) {
                lastMessage = `[Result] ${msg.content}`;
                break;
            }
        }

        return <TruncatedStartText text={lastMessage} />;
    };

    // Render the tree structure
    const renderProcessTree = () => {
        if (processList.length === 0) {
            return null;
        }

        const processClass = 'process-item rounded py-2 px-3 mb-2';

        return (
            <div className="process-tree">
                {processList.map(p => {
                    const process = p as ProcessData;
                    const hasWorkers =
                        process.agent &&
                        process.agent.workers &&
                        process.agent.workers.size > 0;
                    const statusInfo = getStatusIcon(process);

                    return (
                        <React.Fragment key={process.id}>
                            <div
                                className={`${processClass} ${process.id === coreProcessId ? '' : 'mt-4'} ${selectedItemId === process.id ? 'selected' : ''}`}
                                style={{
                                    backgroundColor: `rgba(${process.id === coreProcessId ? PRIMARY_RGB : process.colors.rgb} / ${selectedItemId === process.id ? '0.1' : '0.08'})`,
                                    border: `1px solid rgba(${process.id === coreProcessId ? PRIMARY_RGB : process.colors.rgb} / ${selectedItemId === process.id ? '1' : '0.05'})`,
                                }}
                                onClick={() => handleSelect(process.id)}
                            >
                                <div className="d-flex align-items-center">
                                    <span className="process-name fw-bold">
                                        {process.name ||
                                            process.agent?.name ||
                                            process.id}
                                    </span>
                                    <i
                                        className={`bi ${statusInfo.icon} ms-2`}
                                        style={{
                                            color: statusInfo.color,
                                            fontSize: '0.6rem',
                                        }}
                                    ></i>
                                </div>
                                <div className="process-last-text text-muted small mt-1">
                                    {getLastText(process, 'Starting...')}
                                </div>
                            </div>

                            {/* Process Workers */}
                            {hasWorkers && (
                                <div className="process-children ms-4">
                                    {Array.from(process.agent.workers.entries())
                                        .filter(([, worker]) => {
                                            const status = (worker.statusEvent
                                                ?.status ||
                                                process.status) as ProcessStatus;
                                            if (showCompletedOnly) {
                                                return status === 'completed';
                                            }
                                            return (
                                                !statusFilter ||
                                                statusFilter.includes(status)
                                            );
                                        })
                                        .map(([workerId, worker]) => {
                                            const agentStatusInfo =
                                                getStatusIcon({
                                                    status:
                                                        worker.statusEvent
                                                            ?.status ||
                                                        process.status,
                                                } as { status: string });
                                            const isTyping = worker.isTyping;
                                            return (
                                                <div
                                                    key={workerId}
                                                    className={`${processClass} agent-item ${selectedItemId === workerId ? 'selected' : ''}`}
                                                    style={{
                                                        backgroundColor: `rgba(${process.id === coreProcessId ? PRIMARY_RGB : process.colors.rgb} / ${selectedItemId === workerId ? '0.06' : '0.04'})`,
                                                        border: `1px solid rgba(${process.id === coreProcessId ? PRIMARY_RGB : process.colors.rgb} / ${selectedItemId === workerId ? '1' : '0.05'})`,
                                                    }}
                                                    onClick={() =>
                                                        handleSelect(workerId)
                                                    }
                                                >
                                                    <div className="d-flex align-items-center">
                                                        <span className="process-name fw-bold">
                                                            {worker.name ||
                                                                workerId}
                                                        </span>
                                                        <i
                                                            className={`bi ${agentStatusInfo.icon} ms-2`}
                                                            style={{
                                                                color: isTyping
                                                                    ? '#28a745'
                                                                    : agentStatusInfo.color,
                                                                fontSize:
                                                                    '0.6rem',
                                                                animation:
                                                                    isTyping
                                                                        ? 'pulsate 1.5s infinite'
                                                                        : 'none',
                                                            }}
                                                        ></i>
                                                    </div>
                                                    <div className="process-last-text text-muted small mt-1">
                                                        {getAgentLastText(
                                                            process,
                                                            workerId,
                                                            'Starting...'
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="process-tree-column h-100 d-flex flex-column">
            <AutoScrollContainer className="flex-grow-1 pe-2">
                {renderProcessTree()}
            </AutoScrollContainer>
        </div>
    );
};

export default ProcessTreeColumn;
