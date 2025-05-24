import React, { useState, useEffect } from 'react';
import type { Metrics } from '../../../types';
import { useSocket } from '../context/SocketContext';

// Types for PR Failures
export interface PullRequestFailure {
    id: number;
    process_id: string;
    project_id: string;
    branch_name: string;
    commit_msg: string;
    metrics?: Metrics | Record<string, unknown>;
    error_message: string;
    created_at: string;
    resolved_at: string | null;
    resolved_by: string | null;
    resolution: 'merged' | 'ignored' | 'retry_failed' | null;
}

/**
 * Component for displaying and managing PR failures
 *
 * This is a simplified implementation using only basic HTML elements
 * without dependencies on bootstrap components.
 *
 * @param compact When true, renders a compact list view suitable for sidebar
 * @param onSelectFailure Optional callback when a failure is selected in compact mode
 */
interface PullRequestFailuresProps {
    compact?: boolean;
    onSelectFailure?: (failure: PullRequestFailure) => void;
}

const PullRequestFailures: React.FC<PullRequestFailuresProps> = ({
    compact = false,
    onSelectFailure,
}) => {
    // State for PR failures
    const [failures, setFailures] = useState<PullRequestFailure[]>([]);
    const [selectedFailure, setSelectedFailure] =
        useState<PullRequestFailure | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [actionResult, setActionResult] = useState<{
        success: boolean;
        message: string;
    } | null>(null);
    const [isWorking, setIsWorking] = useState<boolean>(false);
    const { socket } = useSocket();

    // Fetch PR failures on component mount and when socket events occur
    useEffect(() => {
        fetchFailures();

        // Listen for PR failure events
        if (socket) {
            socket.on('pull_request_waiting', fetchFailures);
            socket.on('pull_request_resolved', fetchFailures);

            return () => {
                socket.off('pull_request_waiting');
                socket.off('pull_request_resolved');
            };
        }
    }, [socket]);

    // Fetch PR failures from API
    const fetchFailures = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/pr-failures');
            const data = await response.json();

            if (data.success) {
                setFailures(data.data);
            } else {
                setError('Failed to fetch PR failures');
            }
        } catch (error) {
            console.error('Error fetching PR failures:', error);
            setError('An error occurred while fetching data');
        } finally {
            setLoading(false);
        }
    };

    // Fetch details for a specific PR failure
    const fetchFailureDetails = async (id: number) => {
        try {
            const response = await fetch(`/api/pr-failures/${id}`);
            const data = await response.json();

            if (data.success) {
                const failure = data.data;
                if (onSelectFailure) {
                    onSelectFailure(failure);
                    setSelectedFailure(null);
                } else if (!compact) {
                    setSelectedFailure(failure);
                }
            } else {
                setError(`Failed to fetch details for PR failure #${id}`);
            }
        } catch (error) {
            console.error(`Error fetching PR failure #${id}:`, error);
            setError('An error occurred while fetching failure details');
        }
    };

    // Handle merge button click
    const handleMerge = async (id: number) => {
        try {
            setIsWorking(true);
            setActionResult(null);

            const response = await fetch(`/api/pr-failures/${id}/merge`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({}),
            });
            const data = await response.json();

            if (data.success) {
                const result = data.data;
                setActionResult({
                    success: result.mergeSucceeded,
                    message: result.mergeSucceeded
                        ? 'Merge successful! The changes are now in the default branch.'
                        : 'Merge failed. Please check the repository for conflicts or other issues.',
                });
                // Refresh the failures list
                await fetchFailures();
            } else {
                setActionResult({
                    success: false,
                    message: data.error || 'Failed to merge PR',
                });
            }
        } catch (error) {
            console.error(`Error merging PR failure #${id}:`, error);
            setActionResult({
                success: false,
                message: 'An error occurred while attempting to merge',
            });
        } finally {
            setIsWorking(false);
        }
    };

    // Handle ignore button click
    const handleIgnore = async (id: number) => {
        try {
            setIsWorking(true);
            setActionResult(null);

            const response = await fetch(`/api/pr-failures/${id}/ignore`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({}),
            });
            const data = await response.json();

            if (data.success) {
                setActionResult({
                    success: true,
                    message:
                        'PR has been marked as ignored and will no longer appear in the list.',
                });
                // Refresh the failures list
                await fetchFailures();
            } else {
                setActionResult({
                    success: false,
                    message: data.error || 'Failed to ignore PR',
                });
            }
        } catch (error) {
            console.error(`Error ignoring PR failure #${id}:`, error);
            setActionResult({
                success: false,
                message: 'An error occurred while ignoring the PR',
            });
        } finally {
            setIsWorking(false);
        }
    };

    // Format date for display
    const formatDate = (dateString: string) => {
        // Simple formatting without dependencies
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
    const renderStatus = (
        resolution: 'merged' | 'ignored' | 'retry_failed' | null
    ) => {
        if (resolution === null)
            return <span className="badge badge-warning">Pending</span>;

        switch (resolution) {
            case 'merged':
                return <span className="badge badge-success">Merged</span>;
            case 'ignored':
                return <span className="badge badge-secondary">Ignored</span>;
            case 'retry_failed':
                return <span className="badge badge-danger">Retry Failed</span>;
            default:
                return <span className="badge badge-light">Unknown</span>;
        }
    };

    // Render the details panel when a failure is selected
    const renderDetailsPanel = () => {
        if (!selectedFailure) return null;

        return (
            <div className="pr-details-panel">
                <div className="pr-details-header">
                    <h3>Pull Request Failure #{selectedFailure.id}</h3>
                    <button onClick={() => setSelectedFailure(null)}>
                        Close
                    </button>
                </div>

                {actionResult && (
                    <div
                        className={`alert ${actionResult.success ? 'alert-success' : 'alert-danger'}`}
                    >
                        {actionResult.message}
                    </div>
                )}

                <div className="pr-details-content">
                    <div className="pr-overview">
                        <h4>Overview</h4>
                        <p>
                            <strong>Project:</strong>{' '}
                            {selectedFailure.project_id}
                        </p>
                        <p>
                            <strong>Branch:</strong>{' '}
                            {selectedFailure.branch_name}
                        </p>
                        <p>
                            <strong>Created:</strong>{' '}
                            {new Date(
                                selectedFailure.created_at
                            ).toLocaleString()}
                        </p>
                        <p>
                            <strong>Status:</strong>{' '}
                            {renderStatus(selectedFailure.resolution)}
                        </p>

                        <div className="commit-message">
                            <h4>Commit Message:</h4>
                            <pre>{selectedFailure.commit_msg}</pre>
                        </div>

                        <div className="error-message">
                            <h4>Error Message:</h4>
                            <pre>{selectedFailure.error_message}</pre>
                        </div>
                    </div>

                    {selectedFailure.metrics && (
                        <div className="pr-metrics">
                            <h4>Risk Metrics</h4>
                            <pre>
                                {JSON.stringify(
                                    selectedFailure.metrics,
                                    null,
                                    2
                                )}
                            </pre>
                        </div>
                    )}
                </div>

                {!selectedFailure.resolution && (
                    <div className="pr-actions">
                        <button
                            onClick={() => handleMerge(selectedFailure.id)}
                            disabled={isWorking}
                            className="btn-primary"
                        >
                            {isWorking ? 'Working...' : 'Attempt Merge'}
                        </button>
                        <button
                            onClick={() => handleIgnore(selectedFailure.id)}
                            disabled={isWorking}
                            className="btn-secondary"
                        >
                            Ignore
                        </button>
                    </div>
                )}
            </div>
        );
    };

    // Render the compact view for sidebar integration
    if (compact) {
        // Return early if no failures or they're all resolved
        const pendingFailures = failures.filter(f => f.resolution === null);
        if (loading && pendingFailures.length === 0) {
            return (
                <div className="compact-pr-failures loading">Loading...</div>
            );
        }

        if (pendingFailures.length === 0) {
            return null; // Don't show anything in compact mode if there are no pending failures
        }

        return (
            <div className="compact-pr-failures">
                <h4>Pull Request Issues ({pendingFailures.length})</h4>
                <ul className="compact-failures-list">
                    {pendingFailures.map(failure => (
                        <li
                            key={failure.id}
                            onClick={() => fetchFailureDetails(failure.id)}
                            className="compact-failure-item"
                        >
                            <div className="compact-failure-project">
                                {failure.project_id}
                            </div>
                            <div className="compact-failure-branch">
                                {failure.branch_name}
                            </div>
                            <div className="compact-failure-date">
                                {formatDate(failure.created_at)}
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        );
    }

    // Render the full/detailed view
    return (
        <div className="pr-failures-container">
            <h2>Pull Request Failures</h2>
            <p>
                Git pull requests that failed to merge automatically and need
                human intervention.
            </p>

            {error && (
                <div className="alert alert-danger">
                    {error}
                    <button onClick={() => setError(null)}>×</button>
                </div>
            )}

            {loading && failures.length === 0 ? (
                <div className="loading-indicator">Loading...</div>
            ) : failures.length === 0 ? (
                <div className="alert alert-info">
                    No pending pull request failures found. Everything is
                    working well!
                </div>
            ) : (
                <div className="pr-failures-table">
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Project</th>
                                <th>Branch</th>
                                <th>Error</th>
                                <th>Created</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {failures.map(failure => (
                                <tr
                                    key={failure.id}
                                    onClick={() =>
                                        fetchFailureDetails(failure.id)
                                    }
                                >
                                    <td>{failure.id}</td>
                                    <td>{failure.project_id}</td>
                                    <td>{failure.branch_name}</td>
                                    <td className="error-message-cell">
                                        {failure.error_message.substring(
                                            0,
                                            100
                                        )}
                                        {failure.error_message.length > 100 &&
                                            '...'}
                                    </td>
                                    <td>{formatDate(failure.created_at)}</td>
                                    <td>{renderStatus(failure.resolution)}</td>
                                    <td>
                                        <button
                                            className="btn-sm"
                                            onClick={e => {
                                                e.stopPropagation();
                                                fetchFailureDetails(failure.id);
                                            }}
                                        >
                                            Details
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {selectedFailure && renderDetailsPanel()}
        </div>
    );
};

export default PullRequestFailures;
