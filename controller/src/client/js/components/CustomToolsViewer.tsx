import React, { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';

export interface CustomTool {
    name: string;
    description: string;
    parameters_json: string;
    version: number;
    source_task_id: string | null;
    is_latest: boolean;
    created_at: string;
    implementation?: string | null;
}

interface CustomToolsViewerProps {
    activeTool?: CustomTool | null;
    onSelectTool?: (tool: CustomTool) => void;
    onCountChange?: (count: number) => void;
}

const CustomToolsViewer: React.FC<CustomToolsViewerProps> = ({
    activeTool,
    onSelectTool,
    onCountChange,
}) => {
    const [tools, setTools] = useState<CustomTool[]>([]);
    const [selectedTool, setSelectedTool] = useState<CustomTool | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);
    const socket = useSocket();

    useEffect(() => {
        fetchTools();
    }, []);

    const fetchTools = async () => {
        try {
            const res = await fetch('/api/custom-tools');
            if (!res.ok) {
                throw new Error('Failed to fetch tools');
            }
            const data = await res.json();
            setTools(data);
            if (onCountChange) {
                onCountChange(data.length);
            }
        } catch (err) {
            console.error('Error fetching custom tools:', err);
            setError('Failed to fetch custom tools');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (toolName: string) => {
        if (
            !confirm(`Are you sure you want to delete the tool "${toolName}"?`)
        ) {
            return;
        }

        setDeleting(toolName);
        try {
            const res = await fetch(
                `/api/custom-tools/${encodeURIComponent(toolName)}`,
                {
                    method: 'DELETE',
                }
            );

            if (!res.ok) {
                throw new Error('Failed to delete tool');
            }

            // Refresh the tools list
            await fetchTools();

            // Clear selection if the deleted tool was selected
            if (selectedTool?.name === toolName) {
                setSelectedTool(null);
            }
        } catch (err) {
            console.error('Error deleting tool:', err);
            alert('Failed to delete tool. Please try again.');
        } finally {
            setDeleting(null);
        }
    };

    const handleModify = (tool: CustomTool) => {
        // Send a message to the chat to modify the tool
        if (socket) {
            const modifyMessage = `Please modify the custom tool "${tool.name}". Current description: ${tool.description}. What changes would you like me to make?`;
            socket.emit('user_message', { content: modifyMessage });
        }
    };

    return (
        <div className="custom-tools-viewer">
            <div className="d-flex justify-content-between align-items-center mb-2">
                <h5 className="mb-0">Custom Tools</h5>
                <button
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => {
                        setLoading(true);
                        fetchTools();
                    }}
                    disabled={loading}
                    title="Refresh tools"
                >
                    <i
                        className={`bi bi-arrow-clockwise${loading ? ' spin' : ''}`}
                    ></i>
                </button>
            </div>
            {loading && <div className="middle-title">Loading...</div>}
            {error && <div className="alert alert-danger">{error}</div>}
            {!loading && !error && !tools.length && (
                <div className="middle-title">No tools have been created</div>
            )}
            {!loading && !error && tools.length > 0 && (
                <div className="d-flex">
                    <ul
                        className="list-group flex-grow-1"
                        style={{ maxWidth: '350px' }}
                    >
                        {tools.map(tool => (
                            <li
                                key={tool.name}
                                className={`list-group-item list-group-item-action p-2${
                                    (activeTool &&
                                        activeTool.name === tool.name) ||
                                    (!onSelectTool &&
                                        selectedTool?.name === tool.name)
                                        ? ' active'
                                        : ''
                                }`}
                                onClick={() => {
                                    if (onSelectTool) {
                                        onSelectTool(tool);
                                    } else {
                                        setSelectedTool(tool);
                                    }
                                }}
                                style={{ cursor: 'pointer' }}
                            >
                                <div className="d-flex justify-content-between align-items-start">
                                    <div className="flex-grow-1">
                                        <div className="fw-bold">
                                            {tool.name}
                                        </div>
                                        <div className="small text-muted">
                                            {tool.description}
                                        </div>
                                    </div>
                                    <div
                                        className="btn-group btn-group-sm ms-2"
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <button
                                            className="btn btn-outline-primary btn-sm"
                                            onClick={() => handleModify(tool)}
                                            title="Modify tool"
                                        >
                                            <i className="bi bi-pencil"></i>
                                        </button>
                                        <button
                                            className="btn btn-outline-danger btn-sm"
                                            onClick={() =>
                                                handleDelete(tool.name)
                                            }
                                            disabled={deleting === tool.name}
                                            title="Delete tool"
                                        >
                                            {deleting === tool.name ? (
                                                <span
                                                    className="spinner-border spinner-border-sm"
                                                    role="status"
                                                >
                                                    <span className="visually-hidden">
                                                        Deleting...
                                                    </span>
                                                </span>
                                            ) : (
                                                <i className="bi bi-trash"></i>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                    {selectedTool && !onSelectTool && (
                        <div className="ms-3 flex-grow-1 overflow-auto">
                            <div className="card">
                                <div className="card-header d-flex justify-content-between align-items-center">
                                    <h5 className="mb-0">
                                        {selectedTool.name}
                                    </h5>
                                    <div className="btn-group btn-group-sm">
                                        <button
                                            className="btn btn-outline-primary"
                                            onClick={() =>
                                                handleModify(selectedTool)
                                            }
                                            title="Modify tool"
                                        >
                                            <i className="bi bi-pencil"></i>{' '}
                                            Modify
                                        </button>
                                        <button
                                            className="btn btn-outline-danger"
                                            onClick={() =>
                                                handleDelete(selectedTool.name)
                                            }
                                            disabled={
                                                deleting === selectedTool.name
                                            }
                                            title="Delete tool"
                                        >
                                            {deleting === selectedTool.name ? (
                                                <>
                                                    <span
                                                        className="spinner-border spinner-border-sm me-1"
                                                        role="status"
                                                    ></span>
                                                    Deleting...
                                                </>
                                            ) : (
                                                <>
                                                    <i className="bi bi-trash"></i>{' '}
                                                    Delete
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                                <div className="card-body">
                                    <p className="text-muted">
                                        {selectedTool.description}
                                    </p>
                                    <h6>Parameters:</h6>
                                    <pre className="bg-light p-2 rounded">
                                        {JSON.stringify(
                                            JSON.parse(
                                                selectedTool.parameters_json
                                            ),
                                            null,
                                            2
                                        )}
                                    </pre>
                                    <h6>Implementation:</h6>
                                    <pre
                                        className="bg-light p-2 rounded"
                                        style={{ whiteSpace: 'pre-wrap' }}
                                    >
                                        {selectedTool.implementation ||
                                            'No implementation found.'}
                                    </pre>
                                    <div className="text-muted small">
                                        Version: {selectedTool.version} |
                                        Created:{' '}
                                        {new Date(
                                            selectedTool.created_at
                                        ).toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default CustomToolsViewer;
