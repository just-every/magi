import { ProcessData } from '../../context/SocketContext';

export const getStatusIcon = (item: ProcessData | { status: string }) => {
    const status = item.status;

    if (status === 'running' || status === 'started') {
        return { icon: 'bi-circle-fill', color: 'var(--accent-primary)' }; // Primary for active
    } else if (
        status === 'failed' ||
        status === 'terminated' ||
        status === 'error'
    ) {
        return { icon: 'bi-circle-fill', color: '#dc3545' }; // Red for failed
    } else if (status === 'completed') {
        return { icon: 'bi-check-circle-fill', color: '#28a745' }; // Green check for completed
    } else {
        return { icon: 'bi-circle-fill', color: '#6c757d' }; // Gray for other states
    }
};

export const truncate = (content: string, length: number): string => {
    if (content.length > length) {
        return (
            content.substring(0, (length - 5) / 2) +
            ' ... ' +
            content.substring(content.length - (length - 5) / 2)
        );
    }
    return content;
};
