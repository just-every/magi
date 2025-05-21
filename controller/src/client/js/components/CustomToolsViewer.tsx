import React, { useEffect, useState } from 'react';

interface CustomTool {
    name: string;
    description: string;
    parameters_json: string;
    version: number;
    source_task_id: string | null;
    is_latest: boolean;
    created_at: string;
    implementation?: string | null;
}

const CustomToolsViewer: React.FC = () => {
    const [tools, setTools] = useState<CustomTool[]>([]);
    const [selectedTool, setSelectedTool] = useState<CustomTool | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

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
        } catch (err) {
            console.error('Error fetching custom tools:', err);
            setError('Failed to fetch custom tools');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="custom-tools-viewer">
            <h3>Custom Tools</h3>
            {loading && <div>Loading...</div>}
            {error && <div className="alert alert-danger">{error}</div>}
            {!loading && !error && (
                <div className="d-flex">
                    <ul
                        className="list-group flex-grow-1"
                        style={{ maxWidth: '250px' }}
                    >
                        {tools.map(tool => (
                            <li
                                key={tool.name}
                                className="list-group-item list-group-item-action p-2"
                                onClick={() => setSelectedTool(tool)}
                                style={{ cursor: 'pointer' }}
                            >
                                <div className="fw-bold">{tool.name}</div>
                                <div className="small text-muted">
                                    {tool.description}
                                </div>
                            </li>
                        ))}
                    </ul>
                    {selectedTool && (
                        <div className="ms-3 flex-grow-1 overflow-auto">
                            <h4>{selectedTool.name}</h4>
                            <pre style={{ whiteSpace: 'pre-wrap' }}>
                                {selectedTool.implementation ||
                                    'No implementation found.'}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default CustomToolsViewer;
