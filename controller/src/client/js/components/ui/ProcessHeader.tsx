/**
 * ProcessHeader Component
 * Renders the header for a process box with status and controls
 */
import * as React from 'react';
import { ProcessStatus } from '@types';
import { getStatusClass } from '../utils/ProcessBoxUtils';

interface ProcessHeaderProps {
    processName?: string;
    agentName?: string;
    status?: ProcessStatus;
    colors: {
        rgb: string;
        bgColor: string;
        textColor: string;
    };
    onTerminate?: () => void;
    onViewLogs?: () => void;
}

const ProcessHeader: React.FC<ProcessHeaderProps> = ({
    processName,
    agentName,
    status,
    colors,
    onTerminate,
    onViewLogs
}) => {
    agentName = (agentName || '').replace(/Agent$/, '')
    return (
        <div className="card-header d-flex justify-content-between align-items-center border-0 py-2">
            <div className="d-flex align-items-center">
                {/* Process name/ID */}
                <span className="process-id fw-bold" style={{color: colors.textColor}}>
                    {processName || agentName} {agentName && processName && agentName != processName ? ` (${agentName})` : ''}
                </span>
            </div>
            {status && <div className="d-flex align-items-center gap-2">
                {status !== 'running' && (
                    <span className={`process-status status-label btn-sm ${getStatusClass(status)}`}>
                        {status}
                    </span>
                )}
                {onViewLogs && (
                    <button className="process-btn btn btn-sm btn-outline me-1"
                        style={{color: `rgba(${colors.rgb} / var(--btn-color-opacity))`, borderColor: `rgba(${colors.rgb} / var(--btn-border-opacity))`}}
                        onClick={(e) => {
                            e.stopPropagation(); // Prevent click from bubbling to container
                            onViewLogs();
                        }}>
                        logs
                    </button>
                )}
                {status !== 'ending' && status !== 'terminated' && status !== 'completed' && onTerminate && (
                    <button className="process-btn btn btn-sm btn-outline"
                        style={{color: `rgba(${colors.rgb} / var(--btn-color-opacity))`, borderColor: `rgba(${colors.rgb} / var(--btn-border-opacity))`}}
                        onClick={(e) => {
                            e.stopPropagation(); // Prevent click from bubbling to container
                            onTerminate();
                        }}>
                        terminate
                    </button>
                )}
            </div>}
        </div>
    );
};

export default ProcessHeader;
