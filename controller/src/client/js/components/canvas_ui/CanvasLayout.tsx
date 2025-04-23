import * as React from 'react';
import CommandInput from './CommandInput';
import ProcessGrid from './ProcessGrid';
import LogsViewer from '../ui/LogsViewer';
import CostDisplay from '../ui/CostDisplay';

interface CanvasLayoutProps {
    showLogs: boolean;
    activeProcess: string;
    toggleLogsViewer: (processId?: string) => void;
    setShowLogs: (show: boolean) => void;
}

const CanvasLayout: React.FC<CanvasLayoutProps> = ({
    showLogs,
    activeProcess,
    toggleLogsViewer,
    setShowLogs,
}) => {
    return (
        <>
            <div
                className="d-flex align-items-center position-fixed"
                style={{ right: '20px', top: '20px', zIndex: 1000 }}
            >
                <CostDisplay />
            </div>

            {/* Main command input */}
            <CommandInput />

            {/* Process grid */}
            <ProcessGrid onProcessSelect={toggleLogsViewer} />

            {/* Logs viewer (hidden by default) */}
            {showLogs && (
                <LogsViewer
                    processId={activeProcess}
                    onClose={() => setShowLogs(false)}
                />
            )}
        </>
    );
};

export default CanvasLayout;
