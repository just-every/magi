import * as React from 'react';
import { useState, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import ChatColumn from './ChatColumn';
import ProcessTreeColumn from './ProcessTreeColumn';
import OutputColumn from './OutputColumn';
import PullRequestFailures from '../PullRequestFailures';
import { PRIMARY_RGB } from '../../utils/constants';

interface ColumnLayoutProps {}

const ColumnLayout: React.FC<ColumnLayoutProps> = () => {
    const { processes, coreProcessId, costData, isPaused, togglePauseState } =
        useSocket();
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [middleTab, setMiddleTab] =
        useState<'tasks' | 'code' | 'complete'>('tasks');

    useEffect(() => {
        // Focus input when visible
        if (coreProcessId && !selectedItemId) {
            setSelectedItemId(coreProcessId);
        }
    }, [coreProcessId]);

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
                        backgroundColor: `rgb(209 238 255)`,
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
                        padding: '1rem',
                    }}
                >
                    <ul className="nav nav-tabs small mb-2">
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
                                statusFilter={['running', 'failed', 'terminated', 'ending']}
                            />
                        ) : middleTab === 'code' ? (
                            <PullRequestFailures />
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
                    <OutputColumn selectedItemId={selectedItemId} />
                </div>
            </div>
        </div>
    );
};

export default ColumnLayout;
