import * as React from 'react';
import { useState, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import ChatColumn from './ChatColumn';
import ProcessTreeColumn from './ProcessTreeColumn';
import OutputColumn from './OutputColumn';
import { PRIMARY_RGB } from '../../utils/constants';

interface ColumnLayoutProps {}

const ColumnLayout: React.FC<ColumnLayoutProps> = () => {
    const { processes, coreProcessId, costData, isPaused, togglePauseState } =
        useSocket();
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

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
                    className="col-md-4 h-100"
                    style={{
                        backgroundColor: `rgba(${PRIMARY_RGB} / 0.2)`,
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

                {/* Middle Column: Process Tree */}
                <div
                    className="col-md-4 h-100"
                    style={{
                        padding: '1rem',
                    }}
                >
                    <ProcessTreeColumn
                        selectedItemId={selectedItemId}
                        setSelectedItemId={setSelectedItemId}
                    />
                </div>

                {/* Right Column: Output */}
                <div
                    className="col-md-4 h-100"
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
