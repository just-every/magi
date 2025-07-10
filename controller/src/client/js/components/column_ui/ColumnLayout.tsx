import * as React from 'react';
import { useState, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import ChatColumn from './ChatColumn';
import ProcessTreeColumn from './ProcessTreeColumn';
import OutputColumn from './OutputColumn';
import PatchesViewer, { Patch } from '../PatchesViewer';
import CustomToolsViewer, { CustomTool } from '../CustomToolsViewer';
import { PRIMARY_RGB } from '../../utils/constants';
import { ProcessData, ProcessStatus } from '../../context/SocketContext';

// No props for now; using explicit empty object type for clarity
type ColumnLayoutProps = Record<string, never>;

const ColumnLayout: React.FC<ColumnLayoutProps> = () => {
    const { processes, coreProcessId, costData, isPaused, togglePauseState } =
        useSocket();
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [middleTab, setMiddleTab] = useState<
        'tasks' | 'code' | 'tools' | 'complete'
    >('tasks');
    const [selectedTool, setSelectedTool] = useState<CustomTool | null>(null);
    const [selectedPatch, setSelectedPatch] = useState<Patch | null>(null);
    const [patchesCount, setPatchesCount] = useState<number>(0);
    const [toolsCount, setToolsCount] = useState<number>(0);

    useEffect(() => {
        // Focus input when visible
        if (coreProcessId && !selectedItemId) {
            setSelectedItemId(coreProcessId);
        }
    }, [coreProcessId]);

    useEffect(() => {
        if (middleTab !== 'tools') {
            setSelectedTool(null);
        }
        if (middleTab !== 'code') {
            setSelectedPatch(null);
        }
    }, [middleTab]);

    // Calculate counts for tasks and complete tabs
    const getTasksCount = () => {
        let count = 0;
        const activeStatuses: ProcessStatus[] = [
            'running',
            'failed',
            'terminated',
            'ending',
        ];

        Array.from(processes.values()).forEach((process: ProcessData) => {
            if (activeStatuses.includes(process.status as ProcessStatus)) {
                count++; // Count the process itself
            }

            // Count active workers
            if (process.agent?.workers) {
                process.agent.workers.forEach(worker => {
                    const workerStatus = worker.statusEvent
                        ?.status as ProcessStatus;
                    if (
                        !workerStatus ||
                        activeStatuses.includes(workerStatus)
                    ) {
                        count++;
                    }
                });
            }
        });

        return count;
    };

    const getCompleteCount = () => {
        let count = 0;

        Array.from(processes.values()).forEach((process: ProcessData) => {
            if (process.status === 'completed') {
                count++; // Count the process itself

                // Count all workers of completed processes
                if (process.agent?.workers) {
                    count += process.agent.workers.size;
                }
            } else {
                // For non-completed processes, count only completed workers
                if (process.agent?.workers) {
                    process.agent.workers.forEach(worker => {
                        if (worker.statusEvent?.status === 'completed') {
                            count++;
                        }
                    });
                }
            }
        });

        return count;
    };

    return (
        <div
            className="column-layout container-fluid vh-100 p-0"
            style={{ backgroundColor: '#fff' }}
        >
            <div className="row h-100 g-0">
                {/* Left Column: Chat Messages */}
                <div
                    className="col-md-3 h-100"
                    style={{
                        backgroundColor: `rgba(${PRIMARY_RGB} / 10%)`,
                        padding: '0.5rem',
                        paddingTop: '4.5rem',
                    }}
                >
                    <ChatColumn
                        processes={processes}
                        coreProcessId={coreProcessId}
                        costData={costData}
                        isPaused={isPaused}
                        togglePauseState={togglePauseState}
                    />
                </div>

                {/* Middle Column: Tasks / Code / Complete */}
                <div
                    className="col-md-3 h-100 d-flex flex-column"
                    style={{
                        padding: '0.7rem 1rem',
                    }}
                >
                    <ul className="nav nav-pills nav-fill small mb-3">
                        <li className="nav-item">
                            <button
                                className={`nav-link${
                                    middleTab === 'tasks' ? ' active' : ''
                                }`}
                                onClick={() => setMiddleTab('tasks')}
                            >
                                Tasks
                                {getTasksCount() > 0 && (
                                    <span className="ms-1">
                                        ({getTasksCount()})
                                    </span>
                                )}
                            </button>
                        </li>
                        <li className="nav-item">
                            <button
                                className={`nav-link${
                                    middleTab === 'code' ? ' active' : ''
                                }`}
                                onClick={() => setMiddleTab('code')}
                            >
                                Code
                                {patchesCount > 0 && (
                                    <span className="ms-1">
                                        ({patchesCount})
                                    </span>
                                )}
                            </button>
                        </li>
                        <li className="nav-item">
                            <button
                                className={`nav-link${
                                    middleTab === 'tools' ? ' active' : ''
                                }`}
                                onClick={() => setMiddleTab('tools')}
                            >
                                Tools
                                {toolsCount > 0 && (
                                    <span className="ms-1">({toolsCount})</span>
                                )}
                            </button>
                        </li>
                        <li className="nav-item">
                            <button
                                className={`nav-link${
                                    middleTab === 'complete' ? ' active' : ''
                                }`}
                                onClick={() => setMiddleTab('complete')}
                            >
                                Complete
                                {getCompleteCount() > 0 && (
                                    <span className="ms-1">
                                        ({getCompleteCount()})
                                    </span>
                                )}
                            </button>
                        </li>
                    </ul>
                    <div className="flex-grow-1 overflow-auto">
                        {middleTab === 'tasks' ? (
                            <ProcessTreeColumn
                                selectedItemId={selectedItemId}
                                setSelectedItemId={setSelectedItemId}
                                statusFilter={[
                                    'running',
                                    'waiting',
                                    'failed',
                                    'terminated',
                                    'ending',
                                ]}
                            />
                        ) : middleTab === 'code' ? (
                            <PatchesViewer
                                compact
                                onSelectPatch={patch => {
                                    setSelectedPatch(patch);
                                    setSelectedItemId(null);
                                }}
                                onCountChange={setPatchesCount}
                            />
                        ) : middleTab === 'tools' ? (
                            <CustomToolsViewer
                                activeTool={selectedTool}
                                onSelectTool={tool => {
                                    setSelectedTool(tool);
                                    setSelectedItemId(null);
                                }}
                                onCountChange={setToolsCount}
                            />
                        ) : (
                            <ProcessTreeColumn
                                selectedItemId={selectedItemId}
                                setSelectedItemId={setSelectedItemId}
                                statusFilter={['completed']}
                            />
                        )}
                    </div>
                </div>

                {/* Right Column: Output */}
                <div
                    className="col-md-6 h-100"
                    style={{
                        padding: '1rem',
                        paddingBottom: '0',
                    }}
                >
                    <OutputColumn
                        selectedItemId={selectedItemId}
                        selectedTool={selectedTool}
                        selectedPatch={selectedPatch}
                    />
                </div>
            </div>
        </div>
    );
};

export default ColumnLayout;
