import React, { useState, useEffect } from 'react';
import type { Patch } from './PatchesViewer';

interface PatchDetailsProps {
    patch: Patch;
    projectId?: string;
    processId?: string;
}

// Extended patch information that we'll fetch
interface ExtendedPatchInfo {
    testResults?: {
        status: 'passed' | 'failed' | 'skipped' | 'running';
        summary: string;
        details?: string[];
        timestamp?: string;
    };
    codeQualityMetrics?: {
        entropyNormalised?: number;
        churnRatio?: number;
        cyclomaticDelta?: number;
        developerUnfamiliarity?: number;
        secretRegexHits?: number;
        apiSignatureEdits?: number;
        controlFlowEdits?: number;
    };
    affectedFiles?: {
        path: string;
        additions: number;
        deletions: number;
        hunks: number;
    }[];
    prDescription?: string;
    baseCommit?: string;
    headCommit?: string;
    conflictAnalysis?: {
        hasConflicts: boolean;
        conflictFiles?: string[];
        suggestion?: string;
    };
}

const PatchDetails: React.FC<PatchDetailsProps> = ({
    patch,
    projectId,
    processId,
}) => {
    const [isApplying, setIsApplying] = useState(false);
    const [actionResult, setActionResult] = useState<{
        success: boolean;
        message: string;
    } | null>(null);
    const [extendedInfo, setExtendedInfo] = useState<ExtendedPatchInfo | null>(
        null
    );
    const [, setLoadingExtended] = useState(true);

    // Fetch extended patch information
    useEffect(() => {
        const fetchExtendedInfo = async () => {
            try {
                setLoadingExtended(true);
                const response = await fetch(
                    `/api/patches/${patch.id}/extended`
                );
                if (response.ok) {
                    const data = await response.json();
                    setExtendedInfo(data);
                }
            } catch (error) {
                console.error('Failed to fetch extended patch info:', error);
            } finally {
                setLoadingExtended(false);
            }
        };

        if (patch.id) {
            fetchExtendedInfo();
        }
    }, [patch.id]);

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
                    projectId: projectId || patch.project_id,
                    processId: processId || patch.process_id,
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
                    <span className="patch-project">
                        Project: {patch.project_id}
                    </span>
                    <span className="patch-process">
                        Process: {patch.process_id}
                    </span>
                    <span className="patch-branch">
                        Branch: {patch.branch_name}
                    </span>
                    <span className="patch-date">
                        Created: {new Date(patch.created_at).toLocaleString()}
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

            {patch.riskAssessment && (
                <div className="patch-risk-assessment">
                    <h4>Security Assessment</h4>
                    <div className="risk-info">
                        <div className="risk-level-badge">
                            <span
                                className={`badge badge-risk-${patch.riskAssessment.riskLevel}`}
                            >
                                {patch.riskAssessment.riskLevel.toUpperCase()}{' '}
                                RISK
                            </span>
                            <span className="risk-score">
                                Score:{' '}
                                {(patch.riskAssessment.riskScore * 100).toFixed(
                                    0
                                )}
                                %
                            </span>
                        </div>
                        <div className="risk-details">
                            <p className="risk-recommendation">
                                {patch.riskAssessment.recommendation}
                            </p>
                            {patch.riskAssessment.reasons.length > 0 && (
                                <div className="risk-reasons">
                                    <h5>Risk Factors:</h5>
                                    <ul>
                                        {patch.riskAssessment.reasons.map(
                                            (reason, index) => (
                                                <li key={index}>{reason}</li>
                                            )
                                        )}
                                    </ul>
                                </div>
                            )}
                            {patch.riskAssessment.detailedAnalysis && (
                                <div className="detailed-risk-analysis">
                                    {patch.riskAssessment.detailedAnalysis
                                        .securityRisks.length > 0 && (
                                        <div className="risk-category">
                                            <h5>🔒 Security Risks</h5>
                                            <ul>
                                                {patch.riskAssessment.detailedAnalysis.securityRisks.map(
                                                    (risk, idx) => (
                                                        <li
                                                            key={idx}
                                                            className="security-risk"
                                                        >
                                                            {risk}
                                                        </li>
                                                    )
                                                )}
                                            </ul>
                                        </div>
                                    )}
                                    {patch.riskAssessment.detailedAnalysis
                                        .performanceRisks.length > 0 && (
                                        <div className="risk-category">
                                            <h5>⚡ Performance Risks</h5>
                                            <ul>
                                                {patch.riskAssessment.detailedAnalysis.performanceRisks.map(
                                                    (risk, idx) => (
                                                        <li
                                                            key={idx}
                                                            className="performance-risk"
                                                        >
                                                            {risk}
                                                        </li>
                                                    )
                                                )}
                                            </ul>
                                        </div>
                                    )}
                                    {patch.riskAssessment.detailedAnalysis
                                        .architecturalRisks.length > 0 && (
                                        <div className="risk-category">
                                            <h5>🏗️ Architectural Risks</h5>
                                            <ul>
                                                {patch.riskAssessment.detailedAnalysis.architecturalRisks.map(
                                                    (risk, idx) => (
                                                        <li
                                                            key={idx}
                                                            className="architectural-risk"
                                                        >
                                                            {risk}
                                                        </li>
                                                    )
                                                )}
                                            </ul>
                                        </div>
                                    )}
                                    {patch.riskAssessment.detailedAnalysis
                                        .testingRisks.length > 0 && (
                                        <div className="risk-category">
                                            <h5>🧪 Testing Risks</h5>
                                            <ul>
                                                {patch.riskAssessment.detailedAnalysis.testingRisks.map(
                                                    (risk, idx) => (
                                                        <li
                                                            key={idx}
                                                            className="testing-risk"
                                                        >
                                                            {risk}
                                                        </li>
                                                    )
                                                )}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}
                            {patch.riskAssessment.canAutoMerge && (
                                <p className="auto-merge-info">
                                    ✓ This patch is eligible for automatic
                                    merging
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}

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
                        {patch.metrics.score !== undefined && (
                            <span>
                                Complexity Score:{' '}
                                {(patch.metrics.score * 100).toFixed(0)}%
                            </span>
                        )}
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

            {extendedInfo?.testResults && (
                <div className="patch-test-results">
                    <h4>Test Results</h4>
                    <div className="test-info">
                        <div className="test-status">
                            <span
                                className={`test-badge test-${extendedInfo.testResults.status}`}
                            >
                                {extendedInfo.testResults.status.toUpperCase()}
                            </span>
                            <span className="test-summary">
                                {extendedInfo.testResults.summary}
                            </span>
                        </div>
                        {extendedInfo.testResults.details && (
                            <ul className="test-details">
                                {extendedInfo.testResults.details.map(
                                    (detail, idx) => (
                                        <li key={idx}>{detail}</li>
                                    )
                                )}
                            </ul>
                        )}
                    </div>
                </div>
            )}

            {extendedInfo?.codeQualityMetrics && (
                <div className="patch-quality-metrics">
                    <h4>Code Quality Metrics</h4>
                    <div className="metrics-grid">
                        {extendedInfo.codeQualityMetrics.entropyNormalised !==
                            undefined && (
                            <div className="metric-item">
                                <span className="metric-label">
                                    Change Entropy:
                                </span>
                                <span className="metric-value">
                                    {(
                                        extendedInfo.codeQualityMetrics
                                            .entropyNormalised * 100
                                    ).toFixed(1)}
                                    %
                                </span>
                            </div>
                        )}
                        {extendedInfo.codeQualityMetrics.churnRatio !==
                            undefined && (
                            <div className="metric-item">
                                <span className="metric-label">
                                    Code Churn:
                                </span>
                                <span className="metric-value">
                                    {extendedInfo.codeQualityMetrics.churnRatio.toFixed(
                                        2
                                    )}
                                    x
                                </span>
                            </div>
                        )}
                        {extendedInfo.codeQualityMetrics.cyclomaticDelta !==
                            undefined && (
                            <div className="metric-item">
                                <span className="metric-label">
                                    Complexity Δ:
                                </span>
                                <span className="metric-value">
                                    +
                                    {
                                        extendedInfo.codeQualityMetrics
                                            .cyclomaticDelta
                                    }
                                </span>
                            </div>
                        )}
                        {extendedInfo.codeQualityMetrics
                            .developerUnfamiliarity !== undefined && (
                            <div className="metric-item">
                                <span className="metric-label">
                                    Developer Unfamiliarity:
                                </span>
                                <span className="metric-value">
                                    {(
                                        extendedInfo.codeQualityMetrics
                                            .developerUnfamiliarity * 100
                                    ).toFixed(0)}
                                    %
                                </span>
                            </div>
                        )}
                        {extendedInfo.codeQualityMetrics.secretRegexHits !==
                            undefined && (
                            <div className="metric-item">
                                <span className="metric-label">
                                    Potential Secrets:
                                </span>
                                <span
                                    className={`metric-value ${extendedInfo.codeQualityMetrics.secretRegexHits > 0 ? 'metric-warning' : ''}`}
                                >
                                    {
                                        extendedInfo.codeQualityMetrics
                                            .secretRegexHits
                                    }
                                </span>
                            </div>
                        )}
                        {extendedInfo.codeQualityMetrics.apiSignatureEdits !==
                            undefined && (
                            <div className="metric-item">
                                <span className="metric-label">
                                    API Changes:
                                </span>
                                <span className="metric-value">
                                    {
                                        extendedInfo.codeQualityMetrics
                                            .apiSignatureEdits
                                    }
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {extendedInfo?.affectedFiles &&
                extendedInfo.affectedFiles.length > 0 && (
                    <div className="patch-affected-files">
                        <h4>
                            Affected Files ({extendedInfo.affectedFiles.length})
                        </h4>
                        <div className="files-list">
                            {extendedInfo.affectedFiles.map((file, idx) => (
                                <div key={idx} className="file-item">
                                    <span className="file-path">
                                        {file.path}
                                    </span>
                                    <span className="file-stats">
                                        <span className="additions">
                                            +{file.additions}
                                        </span>
                                        <span className="deletions">
                                            -{file.deletions}
                                        </span>
                                        <span className="hunks">
                                            {file.hunks} hunks
                                        </span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            {extendedInfo?.prDescription && (
                <div className="patch-pr-description">
                    <h4>Pull Request Description</h4>
                    <div className="pr-description-content">
                        {extendedInfo.prDescription}
                    </div>
                </div>
            )}

            {extendedInfo?.conflictAnalysis &&
                extendedInfo.conflictAnalysis.hasConflicts && (
                    <div className="patch-conflicts">
                        <h4>Merge Conflicts</h4>
                        <div className="conflict-info">
                            <p className="conflict-warning">
                                ⚠️ This patch has conflicts that need to be
                                resolved
                            </p>
                            {extendedInfo.conflictAnalysis.suggestion && (
                                <p className="conflict-suggestion">
                                    {extendedInfo.conflictAnalysis.suggestion}
                                </p>
                            )}
                            {extendedInfo.conflictAnalysis.conflictFiles && (
                                <div className="conflict-files">
                                    <h5>Conflicting files:</h5>
                                    <ul>
                                        {extendedInfo.conflictAnalysis.conflictFiles.map(
                                            (file, idx) => (
                                                <li key={idx}>{file}</li>
                                            )
                                        )}
                                    </ul>
                                </div>
                            )}
                        </div>
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

                .patch-risk-assessment {
                    background-color: #f8f9fa;
                    padding: 1rem;
                    border-radius: 0.5rem;
                    border: 1px solid #dee2e6;
                }

                .risk-info {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }

                .risk-level-badge {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }

                .badge-risk-low {
                    background-color: #28a745;
                    color: white;
                    padding: 0.5rem 1rem;
                    border-radius: 0.25rem;
                    font-weight: bold;
                }

                .badge-risk-moderate {
                    background-color: #ffc107;
                    color: #000;
                    padding: 0.5rem 1rem;
                    border-radius: 0.25rem;
                    font-weight: bold;
                }

                .badge-risk-high {
                    background-color: #dc3545;
                    color: white;
                    padding: 0.5rem 1rem;
                    border-radius: 0.25rem;
                    font-weight: bold;
                }

                .badge-risk-critical {
                    background-color: #343a40;
                    color: white;
                    padding: 0.5rem 1rem;
                    border-radius: 0.25rem;
                    font-weight: bold;
                }

                .risk-score {
                    font-size: 0.875rem;
                    color: #6c757d;
                }

                .risk-recommendation {
                    font-weight: 500;
                    color: #495057;
                    margin: 0;
                }

                .risk-reasons {
                    background-color: white;
                    padding: 0.75rem;
                    border-radius: 0.25rem;
                    border: 1px solid #e9ecef;
                }

                .risk-reasons h5 {
                    margin-top: 0;
                    margin-bottom: 0.5rem;
                    font-size: 0.875rem;
                    color: #6c757d;
                }

                .risk-reasons ul {
                    margin: 0;
                    padding-left: 1.5rem;
                }

                .risk-reasons li {
                    color: #6c757d;
                    font-size: 0.875rem;
                }

                .auto-merge-info {
                    color: #28a745;
                    font-weight: 500;
                    margin: 0;
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                }

                .patch-test-results,
                .patch-quality-metrics,
                .patch-affected-files,
                .patch-pr-description,
                .patch-conflicts {
                    background-color: #f8f9fa;
                    padding: 1rem;
                    border-radius: 0.5rem;
                    border: 1px solid #dee2e6;
                    margin-bottom: 1.5rem;
                }

                .test-info {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }

                .test-status {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }

                .test-badge {
                    padding: 0.25rem 0.75rem;
                    border-radius: 0.25rem;
                    font-weight: bold;
                    font-size: 0.875rem;
                }

                .test-passed {
                    background-color: #28a745;
                    color: white;
                }

                .test-failed {
                    background-color: #dc3545;
                    color: white;
                }

                .test-skipped {
                    background-color: #6c757d;
                    color: white;
                }

                .test-running {
                    background-color: #007bff;
                    color: white;
                }

                .test-details {
                    margin: 0;
                    padding-left: 1.5rem;
                    color: #6c757d;
                    font-size: 0.875rem;
                }

                .metrics-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 1rem;
                    margin-top: 0.75rem;
                }

                .metric-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 0.5rem;
                    background-color: white;
                    border-radius: 0.25rem;
                    border: 1px solid #e9ecef;
                }

                .metric-label {
                    color: #6c757d;
                    font-size: 0.875rem;
                }

                .metric-value {
                    font-weight: 600;
                    color: #495057;
                }

                .metric-warning {
                    color: #dc3545;
                }

                .files-list {
                    max-height: 300px;
                    overflow-y: auto;
                    background-color: white;
                    border-radius: 0.25rem;
                    padding: 0.5rem;
                }

                .file-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 0.5rem;
                    border-bottom: 1px solid #e9ecef;
                    font-family: monospace;
                    font-size: 0.875rem;
                }

                .file-item:last-child {
                    border-bottom: none;
                }

                .file-path {
                    color: #495057;
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .file-stats {
                    display: flex;
                    gap: 1rem;
                    flex-shrink: 0;
                }

                .additions {
                    color: #28a745;
                }

                .deletions {
                    color: #dc3545;
                }

                .hunks {
                    color: #6c757d;
                }

                .pr-description-content {
                    background-color: white;
                    padding: 1rem;
                    border-radius: 0.25rem;
                    white-space: pre-wrap;
                    color: #495057;
                }

                .conflict-info {
                    background-color: #fff3cd;
                    padding: 1rem;
                    border-radius: 0.25rem;
                    border: 1px solid #ffeaa7;
                }

                .conflict-warning {
                    color: #856404;
                    font-weight: 600;
                    margin: 0 0 0.5rem 0;
                }

                .conflict-suggestion {
                    color: #856404;
                    margin: 0.5rem 0;
                }

                .conflict-files {
                    margin-top: 1rem;
                }

                .conflict-files h5 {
                    margin: 0 0 0.5rem 0;
                    color: #856404;
                    font-size: 0.875rem;
                }

                .conflict-files ul {
                    margin: 0;
                    padding-left: 1.5rem;
                    color: #856404;
                    font-family: monospace;
                    font-size: 0.875rem;
                }

                .detailed-risk-analysis {
                    margin-top: 1rem;
                    padding-top: 1rem;
                    border-top: 1px solid #e9ecef;
                }

                .risk-category {
                    margin-bottom: 1rem;
                    background-color: white;
                    padding: 0.75rem;
                    border-radius: 0.25rem;
                    border: 1px solid #e9ecef;
                }

                .risk-category h5 {
                    margin: 0 0 0.5rem 0;
                    font-size: 0.875rem;
                    font-weight: 600;
                    color: #495057;
                }

                .risk-category ul {
                    margin: 0;
                    padding-left: 1.5rem;
                    list-style-type: disc;
                }

                .risk-category li {
                    font-size: 0.813rem;
                    line-height: 1.5;
                    margin-bottom: 0.25rem;
                }

                .security-risk {
                    color: #721c24;
                }

                .performance-risk {
                    color: #856404;
                }

                .architectural-risk {
                    color: #004085;
                }

                .testing-risk {
                    color: #155724;
                }
            `}</style>
        </div>
    );
};

export default PatchDetails;
