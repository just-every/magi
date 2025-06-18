import * as React from 'react';
import { useState, useEffect } from 'react';
import { SocketProvider, useSocket } from '../context/SocketContext';
import { AudioPlayer } from '../utils/AudioUtils';
// Import the UI layouts
import ColumnLayout from './column_ui/ColumnLayout';
import CanvasLayout from './canvas_ui/CanvasLayout';

// Content component that uses socket context
const AppContent: React.FC = () => {
    const [showLogs, setShowLogs] = useState<boolean>(false);
    const [activeProcess, setActiveProcess] = useState<string>('');
    const { uiMode, toggleUIMode } = useSocket();

    useEffect(() => {
        // Define the handler function
        const initializeAudioGlobally = () => {
            console.log(
                'First user interaction detected anywhere on the page. Initializing AudioContext...'
            );
            AudioPlayer.getInstance().initAudioContext();
        };

        // Add the event listener to the document body or window
        document.addEventListener('click', initializeAudioGlobally, {
            once: true,
        });
        document.addEventListener('keydown', initializeAudioGlobally, {
            once: true,
        });

        console.log('Global AudioContext initialization listeners attached.');
    }, []); // Empty dependency array ensures this effect runs only once

    const toggleLogsViewer = (processId?: string) => {
        if (processId) {
            setActiveProcess(processId);
            setShowLogs(true);
        } else {
            setShowLogs(!showLogs);
        }
    };

    return (
        <div className="container-fluid px-0">
            <div
                id="fixed-magi-title"
                className={
                    uiMode +
                    ' position-fixed mb-0 d-flex flex-row align-items-start'
                }
            >
                <h1 className="mb-0" onClick={() => toggleUIMode()}>
                    magi
                </h1>
                <div className="ui-settings d-flex flex-row align-items-center gap-3">
                    {/* UI Mode Toggle */}
                    <div
                        className="ui-mode-toggle d-flex flex-row align-items-center gap-2"
                        onClick={() => toggleUIMode()}
                    >
                        <i className={'bi bi-columns-gap me-1'}></i>
                        <div className="form-check form-switch">
                            <input
                                className="form-check-input"
                                type="checkbox"
                                role="switch"
                                checked={uiMode === 'column'}
                                readOnly
                            />
                        </div>
                        <i className={'bi bi-layout-three-columns'}></i>
                    </div>
                </div>
            </div>
            <div id="main-content">
                {uiMode === 'canvas' ? (
                    <CanvasLayout
                        showLogs={showLogs}
                        activeProcess={activeProcess}
                        toggleLogsViewer={toggleLogsViewer}
                        setShowLogs={setShowLogs}
                    />
                ) : (
                    <ColumnLayout />
                )}
            </div>

        </div>
    );
};

// Main App component that provides the socket context
const App: React.FC = () => {
    return (
        <SocketProvider>
            <AppContent />
        </SocketProvider>
    );
};

export default App;
