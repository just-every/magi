import React, { useState } from 'react';
import type { Patch } from './PatchesViewer';

interface PatchDetailsProps {
    patch: Patch;
}

const PatchDetails: React.FC<PatchDetailsProps> = ({ patch }) => {
    const [isApplying, setIsApplying] = useState(false);
    const [actionResult, setActionResult] = useState<{
        success: boolean;
        message: string;
    } | null>(null);

    // Parse diff to add syntax highlighting
    const renderDiff = (content: string) => {
        const lines = content.split('\n');

        return lines.map((line, index) => {
            let className = 'diff-line';

            if (line.startsWith('+++') || line.startsWith('---')) {
                className += ' diff-file-header';
            } else if (line.startsWith('@@')) {
                className += ' diff-hunk-header';
            } else if (line.startsWith('+')) {
                className += ' diff-addition';
            } else if (line.startsWith('-')) {
                className += ' diff-deletion';
            } else if (line.startsWith('diff --git')) {
                className += ' diff-header';
            }

            return (
                <div key={index} className={className}>
                    {line || '\u00A0'}
                </div>
            );
        });
    };

    const handleApply = async () => {
        setIsApplying(true);
        setActionResult(null);

        try {
            const response = await fetch(`/api/patches/${patch.id}/apply`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    projectPath: `/magi_output/projects/${patch.project_id}`,
                }),
            });

            const data = await response.json();

            setActionResult({
                success: data.success,
                message: data.success
                    ? 'Patch applied successfully!'
                    : data.error || 'Failed to apply patch',
            });
        } catch (error) {
            setActionResult({
                success: false,
                message: `Error: ${error.message}`,
            });
        } finally {
            setIsApplying(false);
        }
    };

    const handleReject = async () => {
        const reason = prompt('Reason for rejecting this patch (optional):');

        try {
            const response = await fetch(`/api/patches/${patch.id}/reject`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ reason }),
            });

            const data = await response.json();

            setActionResult({
                success: data.success,
                message: data.success
                    ? 'Patch rejected'
                    : data.error || 'Failed to reject patch',
            });
        } catch (error) {
            setActionResult({
                success: false,
                message: `Error: ${error.message}`,
            });
        }
    };

    return (
        <div className="patch-details">
            <div className="patch-details-header">
                <h3>Patch #{patch.id}</h3>
                <div className="patch-meta">
                    <span className="patch-project">{patch.project_id}</span>
                    <span className="patch-branch">{patch.branch_name}</span>
                    <span className="patch-date">
                        {new Date(patch.created_at).toLocaleString()}
                    </span>
                </div>
            </div>

            {actionResult && (
                <div
                    className={`alert ${actionResult.success ? 'alert-success' : 'alert-danger'}`}
                >
                    {actionResult.message}
                </div>
            )}

            <div className="patch-commit-message">
                <h4>Commit Message</h4>
                <pre>{patch.commit_message}</pre>
            </div>

            {patch.metrics && (
                <div className="patch-stats">
                    <h4>Statistics</h4>
                    <div className="stats-row">
                        <span>Files Changed: {patch.metrics.filesChanged}</span>
                        <span>
                            Lines Added:{' '}
                            <span className="text-success">
                                +{patch.metrics.additions}
                            </span>
                        </span>
                        <span>
                            Lines Deleted:{' '}
                            <span className="text-danger">
                                -{patch.metrics.deletions}
                            </span>
                        </span>
                        <span>Total Changes: {patch.metrics.totalLines}</span>
                    </div>
                </div>
            )}

            {patch.status === 'pending' && (
                <div className="patch-actions">
                    <button
                        className="btn btn-primary"
                        onClick={handleApply}
                        disabled={isApplying}
                    >
                        {isApplying ? 'Applying...' : 'Apply Patch'}
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={handleReject}
                        disabled={isApplying}
                    >
                        Reject
                    </button>
                </div>
            )}

            {patch.status !== 'pending' && (
                <div className="patch-status-info">
                    <h4>Status: {patch.status}</h4>
                    {patch.applied_at && (
                        <p>
                            Applied at:{' '}
                            {new Date(patch.applied_at).toLocaleString()}
                        </p>
                    )}
                    {patch.rejection_reason && (
                        <p>Rejection reason: {patch.rejection_reason}</p>
                    )}
                </div>
            )}

            <div className="patch-diff">
                <h4>Changes</h4>
                <div className="diff-content">
                    {patch.patch_content ? (
                        renderDiff(patch.patch_content)
                    ) : (
                        <p>Loading diff...</p>
                    )}
                </div>
            </div>

            <style jsx>{`
                .patch-details {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                }

                .patch-details-header {
                    padding-bottom: 1rem;
                    border-bottom: 1px solid #dee2e6;
                    margin-bottom: 1rem;
                }

                .patch-meta {
                    display: flex;
                    gap: 1rem;
                    margin-top: 0.5rem;
                    font-size: 0.875rem;
                    color: #6c757d;
                }

                .patch-commit-message,
                .patch-stats,
                .patch-actions,
                .patch-status-info,
                .patch-diff {
                    margin-bottom: 1.5rem;
                }

                .patch-commit-message pre {
                    background-color: #f8f9fa;
                    padding: 1rem;
                    border-radius: 0.25rem;
                    white-space: pre-wrap;
                }

                .stats-row {
                    display: flex;
                    gap: 2rem;
                    font-family: monospace;
                }

                .patch-actions {
                    display: flex;
                    gap: 1rem;
                }

                .diff-content {
                    background-color: #f8f9fa;
                    border: 1px solid #dee2e6;
                    border-radius: 0.25rem;
                    padding: 1rem;
                    overflow-x: auto;
                    flex: 1;
                    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                    font-size: 0.875rem;
                    line-height: 1.4;
                }

                .diff-line {
                    white-space: pre;
                    word-wrap: normal;
                    margin: 0;
                }

                .diff-header {
                    color: #6f42c1;
                    font-weight: bold;
                    background-color: #f3f0ff;
                    margin: 0.5rem -1rem;
                    padding: 0.25rem 1rem;
                }

                .diff-file-header {
                    color: #0969da;
                    background-color: #ddf4ff;
                    margin: 0.25rem -1rem;
                    padding: 0.25rem 1rem;
                }

                .diff-hunk-header {
                    color: #636e7b;
                    background-color: #eff2f5;
                    margin: 0.25rem -1rem;
                    padding: 0.25rem 1rem;
                }

                .diff-addition {
                    background-color: #ccffd8;
                    color: #055d20;
                }

                .diff-deletion {
                    background-color: #ffd7cc;
                    color: #82071e;
                }

                .alert {
                    padding: 0.75rem 1.25rem;
                    margin-bottom: 1rem;
                    border: 1px solid transparent;
                    border-radius: 0.25rem;
                }

                .alert-success {
                    color: #155724;
                    background-color: #d4edda;
                    border-color: #c3e6cb;
                }

                .alert-danger {
                    color: #721c24;
                    background-color: #f8d7da;
                    border-color: #f5c6cb;
                }

                .btn {
                    display: inline-block;
                    font-weight: 400;
                    text-align: center;
                    vertical-align: middle;
                    user-select: none;
                    border: 1px solid transparent;
                    padding: 0.375rem 0.75rem;
                    font-size: 1rem;
                    line-height: 1.5;
                    border-radius: 0.25rem;
                    transition: all 0.15s ease-in-out;
                    cursor: pointer;
                }

                .btn-primary {
                    color: #fff;
                    background-color: #007bff;
                    border-color: #007bff;
                }

                .btn-primary:hover {
                    background-color: #0056b3;
                    border-color: #004085;
                }

                .btn-secondary {
                    color: #fff;
                    background-color: #6c757d;
                    border-color: #6c757d;
                }

                .btn-secondary:hover {
                    background-color: #545b62;
                    border-color: #424649;
                }

                .btn:disabled {
                    opacity: 0.65;
                    cursor: not-allowed;
                }
            `}</style>
        </div>
    );
};

export default PatchDetails;
