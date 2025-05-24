import React from 'react';
import type { PullRequestFailure } from './PullRequestFailures';

interface PullRequestFailureDetailsProps {
    failure: PullRequestFailure;
}

const PullRequestFailureDetails: React.FC<PullRequestFailureDetailsProps> = ({
    failure,
}) => {
    return (
        <div className="pr-details-panel">
            <div className="pr-details-header">
                <h3>Pull Request Failure #{failure.id}</h3>
            </div>
            <div className="pr-details-content">
                <div className="pr-overview">
                    <h4>Overview</h4>
                    <p>
                        <strong>Project:</strong> {failure.project_id}
                    </p>
                    <p>
                        <strong>Branch:</strong> {failure.branch_name}
                    </p>
                    <p>
                        <strong>Created:</strong>{' '}
                        {new Date(failure.created_at).toLocaleString()}
                    </p>
                    <div className="commit-message">
                        <h4>Commit Message:</h4>
                        <pre>{failure.commit_msg}</pre>
                    </div>
                    <div className="error-message">
                        <h4>Error Message:</h4>
                        <pre>{failure.error_message}</pre>
                    </div>
                    {failure.metrics && (
                        <div className="pr-metrics">
                            <h4>Risk Metrics</h4>
                            <pre>
                                {JSON.stringify(failure.metrics, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PullRequestFailureDetails;
