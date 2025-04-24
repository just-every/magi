import * as React from 'react';
import { useState, useEffect } from 'react';
import {
    ProcessData,
    AgentData,
    ClientMessage,
} from '../../context/SocketContext';
import { useSocket } from '../../context/SocketContext';
import { getStatusIcon, truncate } from '../utils/FormatUtils';
import MessageList from '../message/MessageList';
import AutoScrollContainer from '../ui/AutoScrollContainer';
import LogsViewer from '../ui/LogsViewer';
import { PRIMARY_RGB } from '../../utils/constants';
import BrowserAgentCard from '../ui/BrowserAgentCard';
import { ScreenshotEvent } from '../../../../types/shared-types';

interface OutputColumnProps {
    selectedItemId: string | null;
}

const OutputColumn: React.FC<OutputColumnProps> = ({ selectedItemId }) => {
    const { coreProcessId, processes, terminateProcess } = useSocket();
    const [selectedItem, setSelectedItem] = useState<{
        id: string;
        type: 'process' | 'agent';
        parentId?: string;
        data: ProcessData | AgentData;
    } | null>(null);

    const [tab, setTab] = useState('output');

    let name: string;
    let messages: ClientMessage[];
    let screenshots: ScreenshotEvent[];
    let logs: string;

    if (selectedItem?.type === 'process') {
        const process = selectedItem.data as ProcessData;
        if (process) {
            name = process.agent?.name;
            messages = process.agent?.messages || [];
            logs = process.logs || '';
            screenshots = process.agent?.screenshots || [];
        }
    } else if (selectedItem?.type === 'agent') {
        const agent = selectedItem ? (selectedItem.data as AgentData) : null;
        if (agent) {
            name = agent.name || '';
            messages = agent.messages || [];
            screenshots = agent.screenshots || [];
        }
    }

    // Update selected item whenever selection changes
    useEffect(() => {
        if (!selectedItemId || processes.size === 0) {
            setSelectedItem(null);
            return;
        }

        // Check if it's a process
        if (processes.has(selectedItemId)) {
            setSelectedItem({
                id: selectedItemId,
                type: 'process',
                data: processes.get(selectedItemId) as ProcessData,
            });
            return;
        }

        // If not a process, must be an agent
        for (const process of processes.values()) {
            if (
                process.agent &&
                process.agent.workers &&
                process.agent.workers.has(selectedItemId)
            ) {
                setSelectedItem({
                    id: selectedItemId,
                    type: 'agent',
                    parentId: process.id,
                    data: process.agent.workers.get(
                        selectedItemId
                    ) as AgentData,
                });
                return;
            }
        }

        // If we got here, we didn't find the item
        setSelectedItem(null);
    }, [selectedItemId, processes]);


    // The MessageList component handles formatting of messages internally

    // Render process details
    const renderProcessOutput = () => {
        if (!selectedItem || selectedItem.type !== 'process') return null;

        const process = selectedItem.data as ProcessData;
        if (!process) return null;
        const rbg =
            process.id === coreProcessId ? PRIMARY_RGB : process.colors.rgb;

        const { id, command, status } = process;
        const statusInfo = getStatusIcon(process);

        return (
            <div className="process-output h-100 d-flex flex-column">
                {/* Process Header */}
                <div className="process-header pb-4 pt-1">
                    <div className="d-flex gap-2 justify-content-between align-items-start mb-2">
                        <h4 className="mb-2">
                            {process.name || process.agent?.name || process.id}
                        </h4>
                        <div className="d-flex gap-4 justify-content-end align-items-center">
                            <div>
                                <i
                                    className={`bi ${statusInfo.icon} me-2`}
                                    style={{
                                        color: statusInfo.color,
                                        fontSize: '0.6rem',
                                    }}
                                />
                                {status}
                            </div>
                            {status === 'running' && (
                                <div>
                                    <button
                                        className="btn btn-sm btn-outline-danger"
                                        onClick={() => terminateProcess(id)}
                                    >
                                        terminate
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="d-flex gap-2 justify-content-between align-items-start">
                        <div className="text-muted small">
                            <div>
                                <i className="bi bi-hash me-1"></i> {process.id}
                            </div>
                            { screenshots &&
                                screenshots.length > 0 ? (
                                    <BrowserAgentCard
                                        screenshots={screenshots}
                                    />
                                ) : (
                                    <div className="mt-2">
                                        <i className="bi bi-code me-1"></i>{' '}
                                        {truncate(command, 200)}
                                    </div>
                                )}
                        </div>
                    </div>
                </div>

                <ul className="nav nav-tabs small border-0">
                    <li className="nav-item" onClick={() => setTab('output')}>
                        <a
                            className={
                                'nav-link border-0 m-0' +
                                (tab === 'output' ? ' active' : '')
                            }
                            style={{
                                backgroundColor: `rgba(${tab === 'output' ? rbg : '255 255 255'} / 0.1)`,
                            }}
                        >
                            Output
                        </a>
                    </li>
                    <li className="nav-item" onClick={() => setTab('llm')}>
                        <a
                            className={
                                'nav-link border-0 m-0' +
                                (tab === 'llm' ? ' active' : '')
                            }
                            style={{
                                backgroundColor: `rgba(${tab === 'llm' ? rbg : '255 255 255'} / 0.1)`,
                            }}
                        >
                            Requests
                        </a>
                    </li>
                    <li className="nav-item" onClick={() => setTab('docker')}>
                        <a
                            className={
                                'nav-link border-0 m-0' +
                                (tab === 'docker' ? ' active' : '')
                            }
                            style={{
                                backgroundColor: `rgba(${tab === 'docker' ? rbg : '255 255 255'} / 0.1)`,
                            }}
                        >
                            Container Log
                        </a>
                    </li>
                </ul>

                {/* Process Content */}
                <AutoScrollContainer
                    className="process-content flex-grow-1 p-3"
                    style={{ backgroundColor: `rgba(${rbg} / 0.1)` }}
                >
                    {tab === 'output' && <MessageList messages={messages} />}
                    {tab === 'llm' && (
                        <LogsViewer processId={process.id} inlineTab={tab} />
                    )}
                    {tab === 'docker' && (
                        <div className="logs font-monospace small">
                            <pre
                                style={{
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                }}
                            >
                                {logs || 'No logs available'}
                            </pre>
                        </div>
                    )}
                </AutoScrollContainer>
            </div>
        );
    };

    // Render agent details
    const renderAgentOutput = () => {
        if (!selectedItem || selectedItem.type !== 'agent') return null;
        if (!selectedItem.data) return null;

        const parentProcess = selectedItem.parentId
            ? (processes.get(selectedItem.parentId) as ProcessData | undefined)
            : null;
        const status = parentProcess?.status || 'unknown';
        const statusInfo = getStatusIcon(parentProcess);
        const rbg =
            parentProcess && parentProcess.id === coreProcessId
                ? PRIMARY_RGB
                : parentProcess?.colors.rgb;

        return (
            <div className="agent-output h-100 d-flex flex-column">
                {/* Agent Header */}
                <div className="agent-header py-1">
                    <div className="d-flex justify-content-between align-items-start mb-2">
                        <h5 className="mb-2">{name || selectedItem.id}</h5>
                        <div>
                            <i
                                className={`bi ${statusInfo.icon} me-2`}
                                style={{
                                    color: statusInfo.color,
                                    fontSize: '0.6rem',
                                }}
                            />
                            {status}
                        </div>
                    </div>

                    <div className="text-muted small">
                        {/*
                        <div>
                            <i className="bi bi-hash me-1"></i>{' '}
                            {selectedItem.id}
                        </div>

                        {parentProcess && (
                            <div className="mt-2">
                                <i className="bi bi-diagram-3 me-1"></i> Parent:{' '}
                                {parentProcess.name ||
                                    parentProcess.agent?.name ||
                                    'Process'}{' '}
                                ({parentProcess.id})
                            </div>
                        )}
                        */}

                        {screenshots &&
                            screenshots.length > 0 ? (
                                <BrowserAgentCard
                                    screenshots={screenshots}
                                />
                            ) : (messages.length > 0 &&
                                messages[0].content &&
                                typeof messages[0].content === 'string' && (
                                    <div className="mt-2">
                                        <i className="bi bi-code me-1"></i>{' '}
                                        {truncate(messages[0].content, 200)}
                                    </div>
                                ))}
                    </div>
                </div>

                {/* Agent Content */}
                <AutoScrollContainer
                    className="agent-content flex-grow-1 p-3"
                    style={{ backgroundColor: `rgba(${rbg} / 0.08)` }}
                >
                    <MessageList messages={messages} />
                </AutoScrollContainer>
            </div>
        );
    };

    return (
        <div className="output-column h-100">
            {selectedItem?.type === 'process' && renderProcessOutput()}
            {selectedItem?.type === 'agent' && renderAgentOutput()}
        </div>
    );
};

export default OutputColumn;
