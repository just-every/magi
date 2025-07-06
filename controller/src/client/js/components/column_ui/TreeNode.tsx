import * as React from 'react';
import { AgentData, ProcessData } from '../../context/SocketContext';

interface TreeNodeProps {
    item: ProcessData | AgentData;
    isProcess?: boolean;
    isSelected: boolean;
    onSelect: (id: string) => void;
    level?: number;
}

const TreeNode: React.FC<TreeNodeProps> = ({
    item,
    isProcess = false,
    isSelected,
    onSelect,
    level = 0,
}) => {
    const id = isProcess
        ? (item as ProcessData).id
        : (item as AgentData).agent_id || '';
    const name = isProcess
        ? (item as ProcessData).name
        : (item as AgentData).name;
    const messages = (item as AgentData).messages || [];
    const workers = (item as AgentData).workers;
    const isTyping = (item as AgentData).isTyping || false;

    // Calculate if active based on isTyping or recent message (within last 10 seconds)
    const now = new Date();
    const lastMessage =
        messages.length > 0 ? messages[messages.length - 1] : null;
    const lastMessageTime = lastMessage
        ? new Date(lastMessage.timestamp)
        : null;
    const hasRecentActivity =
        lastMessageTime && now.getTime() - lastMessageTime.getTime() < 10000;

    const isActive = isTyping || hasRecentActivity;

    // Check if there was an error in the last message
    const hasError = lastMessage && lastMessage.type === 'error';

    // Get process status if this is a process
    const processStatus = isProcess ? (item as ProcessData).status : undefined;
    const isTerminated =
        processStatus === 'terminated' ||
        processStatus === 'completed' ||
        processStatus === 'failed' ||
        processStatus === 'ending';

    // Determine status indicator color
    let statusColor = 'grey'; // Default: inactive
    if (isActive) {
        statusColor = 'green'; // Active
    } else if (hasError || isTerminated) {
        statusColor = 'red'; // Error or terminated
    }

    // Get the last assistant message for displaying text snippet
    const lastAssistantMessage = [...messages]
        .reverse()
        .find(m => m.type === 'assistant');
    const lastTextSnippet = lastAssistantMessage?.content || '';

    // Truncate text to a reasonable length (~ 50 chars)
    const truncatedText =
        lastTextSnippet.length > 50
            ? lastTextSnippet.substring(0, 50) + '...'
            : lastTextSnippet;

    return (
        <div className="tree-node">
            <div
                className={'d-flex p-2 rounded-2 shadow-sm mb-2'}
                style={{
                    cursor: 'pointer',
                    marginLeft: `${level * 15}px`,
                    backgroundColor: isSelected ? 'var(--bs-primary)' : 'white',
                    border: `1px solid ${isSelected ? 'var(--bs-primary)' : '#eee'}`,
                    color: isSelected ? 'white' : 'black',
                    transition: 'all 0.2s ease-in-out',
                    fontSize: '14px',
                }}
                onClick={() => onSelect(id)}
            >
                <div className="d-flex flex-column flex-grow-1">
                    <div className="d-flex align-items-center">
                        <div
                            className="status-indicator me-2"
                            style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: statusColor,
                            }}
                        />
                        <div className={`${isSelected ? '' : 'fw-semibold'}`}>
                            {/* Show name with ID for core process */}
                            {name || `Process ${id.substring(0, 8)}`}
                        </div>
                    </div>

                    {truncatedText && (
                        <div
                            className={`text-truncate ${isSelected ? 'text-white opacity-75' : 'text-muted'}`}
                            style={{ fontSize: '12px', marginTop: '2px' }}
                        >
                            {truncatedText}
                        </div>
                    )}
                </div>
            </div>

            {/* Recursively render child workers */}
            {workers && workers.size > 0 && (
                <div className="tree-node-children">
                    {Array.from(workers.values()).map(worker => (
                        <TreeNode
                            key={worker.agent_id}
                            item={worker}
                            isProcess={false}
                            isSelected={isSelected && worker.agent_id === id}
                            onSelect={onSelect}
                            level={level + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default TreeNode;
