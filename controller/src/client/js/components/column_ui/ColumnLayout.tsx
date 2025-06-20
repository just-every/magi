import * as React from 'react';
import { useState, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import ChatColumn from './ChatColumn';
import ProcessTreeColumn from './ProcessTreeColumn';
import OutputColumn from './OutputColumn';
import PatchesViewer, { Patch } from '../PatchesViewer';
import CustomToolsViewer, { CustomTool } from '../CustomToolsViewer';
import { PRIMARY_RGB } from '../../utils/constants';

interface ColumnLayoutProps {}

const ColumnLayout: React.FC<ColumnLayoutProps> = () => {
    const { processes, coreProcessId, costData, isPaused, togglePauseState } =
        useSocket();
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [middleTab, setMiddleTab] = useState<
        'tasks' | 'code' | 'tools' | 'complete'
    >('tasks');
    const [selectedTool, setSelectedTool] = useState<CustomTool | null>(null);
    const [selectedPatch, setSelectedPatch] = useState<Patch | null>(null);

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
                            />
                        ) : middleTab === 'tools' ? (
                            <CustomToolsViewer
                                activeTool={selectedTool}
                                onSelectTool={tool => {
                                    setSelectedTool(tool);
                                    setSelectedItemId(null);
                                }}
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
