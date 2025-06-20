import * as React from 'react';
import { useSocket } from '../../context/SocketContext';

// No props needed for StatusDisplay
interface StatusDisplayProps {}

/**
 * Status Display Component
 *
 * Displays system status from the current thought cycle.
 */
const StatusDisplay: React.FC<StatusDisplayProps> = () => {
    const { systemStatus } = useSocket();

    if (!systemStatus) {
        return (
            <div className="text-muted">System status not yet collected.</div>
        );
    }

    return (
        <pre
            style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
            }}
        >
            {systemStatus}
        </pre>
    );
};

export default StatusDisplay;
