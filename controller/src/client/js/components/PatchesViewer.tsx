import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';

// Types for Patches
export interface Patch {
    id: number;
    process_id: string;
    project_id: string;
    branch_name: string;
    commit_message: string;
    patch_content?: string;
    metrics?: {
        filesChanged: number;
        totalLines: number;
        additions: number;
        deletions: number;
    };
    status: 'pending' | 'applied' | 'rejected' | 'superseded';
    created_at: string;
    applied_at: string | null;
    applied_by: string | null;
    rejection_reason: string | null;
}

interface PatchesViewerProps {
    compact?: boolean;
    onSelectPatch?: (patch: Patch) => void;
}

const PatchesViewer: React.FC<PatchesViewerProps> = ({
    compact = false,
    onSelectPatch,
}) => {
    const [patches, setPatches] = useState<Patch[]>([]);
    const [selectedPatch, setSelectedPatch] = useState<Patch | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const { socket } = useSocket();

    // Fetch patches on component mount and when socket events occur
    useEffect(() => {
        fetchPatches();

        // Listen for patch events
        if (socket) {
            socket.on('patch_created', fetchPatches);
            socket.on('patch_applied', fetchPatches);
            socket.on('patch_rejected', fetchPatches);

            return () => {
                socket.off('patch_created');
                socket.off('patch_applied');
                socket.off('patch_rejected');
            };
        }
    }, [socket]);

    // Fetch patches from API
    const fetchPatches = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/patches');
            const data = await response.json();

            if (data.success) {
                setPatches(data.data);
            } else {
                setError('Failed to fetch patches');
            }
        } catch (error) {
            console.error('Error fetching patches:', error);
            setError('An error occurred while fetching patches');
        } finally {
            setLoading(false);
        }
    };

    // Fetch details for a specific patch
    const fetchPatchDetails = async (id: number) => {
        try {
            const response = await fetch(`/api/patches/${id}`);
            const data = await response.json();

            if (data.success) {
                const patch = data.data;
                if (onSelectPatch) {
                    onSelectPatch(patch);
                    setSelectedPatch(null);
                } else if (!compact) {
                    setSelectedPatch(patch);
                }
            } else {
                setError(`Failed to fetch details for patch #${id}`);
            }
        } catch (error) {
            console.error(`Error fetching patch #${id}:`, error);
            setError('An error occurred while fetching patch details');
        }
    };

    // Format date for display
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return 'today';
        } else if (diffDays === 1) {
            return 'yesterday';
        } else {
            return `${diffDays} days ago`;
        }
    };

    // Simple renderer for status badge
    const renderStatus = (status: Patch['status']) => {
        switch (status) {
            case 'pending':
                return <span className="badge badge-warning">Pending</span>;
            case 'applied':
                return <span className="badge badge-success">Applied</span>;
            case 'rejected':
                return <span className="badge badge-danger">Rejected</span>;
            case 'superseded':
                return (
                    <span className="badge badge-secondary">Superseded</span>
                );
            default:
                return <span className="badge badge-light">Unknown</span>;
        }
    };

    // Render the compact view for sidebar integration
    if (compact) {
        const pendingPatches = patches;

        if (loading && pendingPatches.length === 0) {
            return <div className="compact-patches loading">Loading...</div>;
        }

        if (pendingPatches.length === 0) {
            return (
                <div className="compact-patches empty">
                    <p className="text-muted">No pending patches</p>
                </div>
            );
        }

        return (
            <div className="compact-patches">
                <h4>Pending Patches ({pendingPatches.length})</h4>
                <ul className="compact-patches-list">
                    {pendingPatches.map(patch => (
                        <li
                            key={patch.id}
                            onClick={() => fetchPatchDetails(patch.id)}
                            className="compact-patch-item"
                        >
                            <div className="compact-patch-project">
                                {patch.project_id}
                            </div>
                            <div className="compact-patch-branch">
                                {patch.branch_name}
                            </div>
                            <div className="compact-patch-message">
                                {patch.commit_message.split('\n')[0]}
                            </div>
                            {patch.metrics && (
                                <div className="compact-patch-stats">
                                    <span className="text-success">
                                        +{patch.metrics.additions}
                                    </span>{' '}
                                    <span className="text-danger">
                                        -{patch.metrics.deletions}
                                    </span>
                                </div>
                            )}
                            <div className="compact-patch-date">
                                {formatDate(patch.created_at)}
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        );
    }

    // Render the full/detailed view
    return (
        <div className="patches-container">
            <h2>Code Patches</h2>
            <p>
                Git patches generated by MAGI agents for review and application.
            </p>

            {error && (
                <div className="alert alert-danger">
                    {error}
                    <button onClick={() => setError(null)}>×</button>
                </div>
            )}

            {loading && patches.length === 0 ? (
                <div className="loading-indicator">Loading...</div>
            ) : patches.length === 0 ? (
                <div className="alert alert-info">
                    No patches found yet. Patches will appear here when agents
                    generate code changes.
                </div>
            ) : (
                <div className="patches-table">
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Project</th>
                                <th>Branch</th>
                                <th>Message</th>
                                <th>Changes</th>
                                <th>Created</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {patches.map(patch => (
                                <tr
                                    key={patch.id}
                                    onClick={() => fetchPatchDetails(patch.id)}
                                    className={
                                        selectedPatch?.id === patch.id
                                            ? 'selected'
                                            : ''
                                    }
                                >
                                    <td>{patch.id}</td>
                                    <td>{patch.project_id}</td>
                                    <td>{patch.branch_name}</td>
                                    <td className="patch-message-cell">
                                        {patch.commit_message.split('\n')[0]}
                                    </td>
                                    <td className="patch-stats-cell">
                                        {patch.metrics && (
                                            <>
                                                <span className="text-success">
                                                    +{patch.metrics.additions}
                                                </span>
                                                {' / '}
                                                <span className="text-danger">
                                                    -{patch.metrics.deletions}
                                                </span>
                                            </>
                                        )}
                                    </td>
                                    <td>{formatDate(patch.created_at)}</td>
                                    <td>{renderStatus(patch.status)}</td>
                                    <td>
                                        <button
                                            className="btn-sm"
                                            onClick={e => {
                                                e.stopPropagation();
                                                fetchPatchDetails(patch.id);
                                            }}
                                        >
                                            View
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default PatchesViewer;
