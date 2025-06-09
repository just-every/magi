import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
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
import BrowserDisplay from '../ui/BrowserDisplay';
import ConsoleDisplay from '../ui/ConsoleDisplay';
import DesignDisplay from '../ui/DesignDisplay';
import type { CustomTool } from '../CustomToolsViewer';
import PullRequestFailureDetails from '../PullRequestFailureDetails';
import type { PullRequestFailure } from '../PullRequestFailures';
import {
    ScreenshotEvent,
    ConsoleEvent,
    DesignEvent,
} from '../../../../types/shared-types';

interface OutputColumnProps {
    selectedItemId: string | null;
    selectedTool?: CustomTool | null;
    selectedFailure?: PullRequestFailure | null;
}

const OutputColumn: React.FC<OutputColumnProps> = ({
    selectedItemId,
    selectedTool,
    selectedFailure,
}) => {
    const { coreProcessId, processes, terminateProcess } = useSocket();
    if (selectedTool) {
        return (
            <div className="output-column h-100 overflow-auto p-3">
                <h4>
                    {typeof selectedTool.name === 'string'
                        ? selectedTool.name
                        : JSON.stringify(selectedTool.name)}
                </h4>
                <pre style={{ whiteSpace: 'pre-wrap' }}>
                    {selectedTool.implementation || 'No implementation found.'}
                </pre>
            </div>
        );
    }

    if (selectedFailure) {
        return (
            <div className="output-column h-100 overflow-auto p-3">
                <PullRequestFailureDetails failure={selectedFailure} />
            </div>
        );
    }
    const [selectedItem, setSelectedItem] = useState<{
        id: string;
        type: 'process' | 'agent';
        parentId?: string;
        data: ProcessData | AgentData;
    } | null>(null);

    const [tab, setTab] = useState('output');
    const [isTabManuallySelected, setIsTabManuallySelected] = useState(false);

    let name: string;
    let messages: ClientMessage[];
    let screenshots: ScreenshotEvent[];
    let consoleEvents: ConsoleEvent[];
    let designEvents: DesignEvent[];
    let logs: string;

    if (selectedItem?.type === 'process') {
        const process = selectedItem.data as ProcessData;
        if (process) {
            name = process.agent?.name;
            messages = process.agent?.messages || [];
            logs = process.logs || '';
            screenshots = process.agent?.screenshots || [];
            consoleEvents = process.agent?.consoleEvents || [];
            designEvents = process.agent?.designEvents || [];
        }
    } else if (selectedItem?.type === 'agent') {
        const agent = selectedItem ? (selectedItem.data as AgentData) : null;
        if (agent) {
            name = agent.name || '';
            messages = agent.messages || [];
            screenshots = agent.screenshots || [];
            consoleEvents = agent.consoleEvents || [];
            designEvents = agent.designEvents || [];
        }
    }

    // Ref to track the previously processed selectedItemId
    const prevSelectedItemIdRef = useRef<string | null | undefined>(undefined);

    // When selected item changes, switch to output tab, unless browser/console data is present
    useEffect(() => {
        if (
            selectedItemId &&
            selectedItem &&
            selectedItem.id === selectedItemId
        ) {
            // Only proceed with initial tab setup if the selectedItemId is different
            // from the one we last fully processed
            if (prevSelectedItemIdRef.current !== selectedItemId) {
                if (screenshots && screenshots.length > 0) {
                    setTab('browser');
                } else if (designEvents && designEvents.length > 0) {
                    setTab('design');
                } else if (consoleEvents && consoleEvents.length > 0) {
                    setTab('console');
                } else {
                    setTab('output');
                }
                // Reset manual selection flag ONLY when a new item is selected
                setIsTabManuallySelected(false);
                // Store this ID as processed
                prevSelectedItemIdRef.current = selectedItemId;
            }
            // If prevSelectedItemIdRef.current === selectedItemId, it means
            // selectedItem might have just changed its reference for the SAME item.
            // In this case, we DO NOT want to reset the tab or isTabManuallySelected.
        } else if (!selectedItemId && selectedItem === null) {
            // Handle deselection - only if it was previously an item
            if (prevSelectedItemIdRef.current !== null) {
                setTab('output');
                setIsTabManuallySelected(false);
                prevSelectedItemIdRef.current = null;
            }
        }
    }, [selectedItemId, selectedItem]); // Only re-run when selectedItem or selectedItemId changes

    // If tab is not manually changed, switch to browser/console when data starts coming in
    useEffect(() => {
        if (
            !isTabManuallySelected &&
            tab === 'output' &&
            screenshots &&
            screenshots.length > 0
        ) {
            setTab('browser');
        } else if (
            !isTabManuallySelected &&
            tab === 'output' &&
            designEvents &&
            designEvents.length > 0
        ) {
            setTab('design');
        } else if (
            !isTabManuallySelected &&
            tab === 'output' &&
            consoleEvents &&
            consoleEvents.length > 0
        ) {
            setTab('console');
        }
    }, [tab, screenshots, consoleEvents, designEvents, isTabManuallySelected]);

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

        const { id, command } = process;
        const statusInfo = getStatusIcon(process);
        let status: string = process.status || 'unknown';
        let metaDataString = '';
        if (process.agent?.statusEvent) {
            if (process.agent.statusEvent.status) {
                status = process.agent.statusEvent.status;
            }
            if (
                process.agent.statusEvent.meta_data &&
                Object.keys(process.agent.statusEvent.meta_data).length > 0
            ) {
                metaDataString = ` (${Object.entries(
                    process.agent.statusEvent.meta_data
                )
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(', ')})`;
            }
        }
        status += metaDataString;

        return (
            <div className="process-output h-100 d-flex flex-column">
                {/* Process Header */}
                <div className="process-header pb-4 pt-1">
                    <div className="d-flex gap-2 justify-content-between align-items-start mb-2">
                        <h4 className="mb-2">
                            {(() => {
                                const displayName =
                                    process.name ||
                                    process.agent?.name ||
                                    process.id;
                                return typeof displayName === 'string'
                                    ? displayName
                                    : JSON.stringify(displayName);
                            })()}
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
                            <div className="mt-2">
                                <i className="bi bi-code me-1"></i>{' '}
                                {truncate(command, 200)}
                            </div>
                        </div>
                    </div>
                </div>

                <ul className="nav nav-tabs small border-0">
                    {screenshots && screenshots.length > 0 && (
                        <li
                            className="nav-item"
                            onClick={() => {
                                setTab('browser');
                                setIsTabManuallySelected(true);
                            }}
                        >
                            <a
                                className={
                                    'nav-link border-0 m-0' +
                                    (tab === 'browser' ? ' active' : '')
                                }
                                style={{
                                    backgroundColor: `rgba(${tab === 'browser' ? rbg : '255 255 255'} / 0.1)`,
                                }}
                            >
                                Browser
                            </a>
                        </li>
                    )}
                    {designEvents && designEvents.length > 0 && (
                        <li
                            className="nav-item"
                            onClick={() => {
                                setTab('design');
                                setIsTabManuallySelected(true);
                            }}
                        >
                            <a
                                className={
                                    'nav-link border-0 m-0' +
                                    (tab === 'design' ? ' active' : '')
                                }
                                style={{
                                    backgroundColor: `rgba(${tab === 'design' ? rbg : '255 255 255'} / 0.08)`,
                                }}
                            >
                                Designs
                            </a>
                        </li>
                    )}
                    {designEvents && designEvents.length > 0 && (
                        <li
                            className="nav-item"
                            onClick={() => {
                                setTab('design');
                                setIsTabManuallySelected(true);
                            }}
                        >
                            <a
                                className={
                                    'nav-link border-0 m-0' +
                                    (tab === 'design' ? ' active' : '')
                                }
                                style={{
                                    backgroundColor: `rgba(${tab === 'design' ? rbg : '255 255 255'} / 0.1)`,
                                }}
                            >
                                Designs
                            </a>
                        </li>
                    )}
                    {consoleEvents && consoleEvents.length > 0 && (
                        <li
                            className="nav-item"
                            onClick={() => {
                                setTab('console');
                                setIsTabManuallySelected(true);
                            }}
                        >
                            <a
                                className={
                                    'nav-link border-0 m-0' +
                                    (tab === 'console' ? ' active' : '')
                                }
                                style={{
                                    backgroundColor: `rgba(${tab === 'console' ? rbg : '255 255 255'} / 0.1)`,
                                }}
                            >
                                Console
                            </a>
                        </li>
                    )}
                    <li
                        className="nav-item"
                        onClick={() => {
                            setTab('output');
                            setIsTabManuallySelected(true);
                        }}
                    >
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
                    <li
                        className="nav-item"
                        onClick={() => {
                            setTab('llm');
                            setIsTabManuallySelected(true);
                        }}
                    >
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
                    <li
                        className="nav-item"
                        onClick={() => {
                            setTab('docker');
                            setIsTabManuallySelected(true);
                        }}
                    >
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
                {tab === 'console' && consoleEvents ? (
                    <div
                        className="process-content flex-grow-1 p-4"
                        style={{ backgroundColor: `rgba(${rbg} / 0.1)` }}
                    >
                        <ConsoleDisplay
                            consoleEvents={consoleEvents}
                            collapsible={false}
                        />
                    </div>
                ) : (
                    <AutoScrollContainer
                        className="process-content flex-grow-1 p-4"
                        style={{ backgroundColor: `rgba(${rbg} / 0.1)` }}
                    >
                        {tab === 'browser' && screenshots && (
                            <BrowserDisplay
                                screenshots={screenshots}
                                collapsible={false}
                            />
                        )}
                        {tab === 'design' && designEvents && (
                            <DesignDisplay
                                designEvents={designEvents}
                                collapsible={false}
                            />
                        )}
                        {tab === 'output' && (
                            <MessageList messages={messages} />
                        )}
                        {tab === 'llm' && (
                            <LogsViewer
                                processId={process.id}
                                inlineTab={tab}
                            />
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
                )}
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
        const statusInfo = getStatusIcon(parentProcess);
        const rbg =
            parentProcess && parentProcess.id === coreProcessId
                ? PRIMARY_RGB
                : parentProcess?.colors.rgb;
        let status: string = parentProcess?.status || 'unknown';
        let metaDataString = '';
        const agentData = selectedItem.data as AgentData;
        if (agentData.statusEvent) {
            if (agentData.statusEvent.status) {
                status = agentData.statusEvent.status;
            }
            if (
                agentData.statusEvent.meta_data &&
                Object.keys(agentData.statusEvent.meta_data).length > 0
            ) {
                metaDataString = ` (${Object.entries(
                    agentData.statusEvent.meta_data
                )
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(', ')})`;
            }
        }
        status += metaDataString;

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

                        <div className="mt-2">
                            <i className="bi bi-code me-1"></i>{' '}
                            {messages[0] &&
                            typeof messages[0].content === 'string'
                                ? truncate(messages[0].content, 200)
                                : messages[0] &&
                                    typeof messages[0].content === 'object'
                                  ? truncate(
                                        JSON.stringify(messages[0].content),
                                        200
                                    )
                                  : 'No content available'}
                        </div>
                    </div>
                </div>

                {/* Agent Content */}
                <ul className="nav nav-tabs small border-0">
                    {screenshots && screenshots.length > 0 && (
                        <li
                            className="nav-item"
                            onClick={() => {
                                setTab('browser');
                                setIsTabManuallySelected(true);
                            }}
                        >
                            <a
                                className={
                                    'nav-link border-0 m-0' +
                                    (tab === 'browser' ? ' active' : '')
                                }
                                style={{
                                    backgroundColor: `rgba(${tab === 'browser' ? rbg : '255 255 255'} / 0.08)`,
                                }}
                            >
                                Browser
                            </a>
                        </li>
                    )}
                    {consoleEvents && consoleEvents.length > 0 && (
                        <li
                            className="nav-item"
                            onClick={() => {
                                setTab('console');
                                setIsTabManuallySelected(true);
                            }}
                        >
                            <a
                                className={
                                    'nav-link border-0 m-0' +
                                    (tab === 'console' ? ' active' : '')
                                }
                                style={{
                                    backgroundColor: `rgba(${tab === 'console' ? rbg : '255 255 255'} / 0.08)`,
                                }}
                            >
                                Console
                            </a>
                        </li>
                    )}
                    <li
                        className="nav-item"
                        onClick={() => {
                            setTab('output');
                            setIsTabManuallySelected(true);
                        }}
                    >
                        <a
                            className={
                                'nav-link border-0 m-0' +
                                (tab === 'output' ? ' active' : '')
                            }
                            style={{
                                backgroundColor: `rgba(${tab === 'output' ? rbg : '255 255 255'} / 0.08)`,
                            }}
                        >
                            Output
                        </a>
                    </li>
                    <li
                        className="nav-item"
                        onClick={() => {
                            setTab('llm');
                            setIsTabManuallySelected(true);
                        }}
                    >
                        <a
                            className={
                                'nav-link border-0 m-0' +
                                (tab === 'llm' ? ' active' : '')
                            }
                            style={{
                                backgroundColor: `rgba(${tab === 'llm' ? rbg : '255 255 255'} / 0.08)`,
                            }}
                        >
                            Requests
                        </a>
                    </li>
                </ul>

                {tab === 'console' && consoleEvents ? (
                    <div
                        className="agent-content flex-grow-1 p-4"
                        style={{ backgroundColor: `rgba(${rbg} / 0.08)` }}
                    >
                        <ConsoleDisplay
                            consoleEvents={consoleEvents}
                            collapsible={false}
                        />
                    </div>
                ) : (
                    <AutoScrollContainer
                        className="agent-content flex-grow-1 p-4"
                        style={{ backgroundColor: `rgba(${rbg} / 0.08)` }}
                    >
                        {tab === 'browser' && screenshots && (
                            <BrowserDisplay
                                screenshots={screenshots}
                                collapsible={false}
                            />
                        )}
                        {tab === 'design' && designEvents && (
                            <DesignDisplay
                                designEvents={designEvents}
                                collapsible={false}
                            />
                        )}
                        {tab === 'output' && (
                            <MessageList messages={messages} />
                        )}
                        {tab === 'llm' && selectedItem && (
                            <LogsViewer
                                processId={selectedItem.parentId || ''}
                                agentId={selectedItem.id}
                                inlineTab={tab}
                            />
                        )}
                    </AutoScrollContainer>
                )}
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
