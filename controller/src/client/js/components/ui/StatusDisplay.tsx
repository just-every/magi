import * as React from 'react';
import { useSocket } from '../../context/SocketContext';
import { useState } from 'react';

interface StatusDisplayProps {
    forceExpand?: boolean;
}

/**
 * Status Display Component
 *
 * Displays system status from the current thought cycle.
 */
const StatusDisplay: React.FC<StatusDisplayProps> = ({
    forceExpand = false,
}) => {
    const { systemStatus } = useSocket();
    const [expanded, setExpanded] = useState<boolean>(forceExpand);

    if (!systemStatus) {
        return (
            <div className="text-muted">System status not yet collected.</div>
        );
    }

    return (
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {systemStatus}
        </pre>
    );
};

export default StatusDisplay;
