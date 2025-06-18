import * as React from 'react';
import { useState } from 'react';

interface CollapsibleSectionProps {
    title: string;
    collapsedSummary: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    defaultExpanded?: boolean;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
    title,
    collapsedSummary,
    children,
    className = '',
    defaultExpanded = false,
}) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    return (
        <div className={className + ' collapsible-section mb-3'}>
            <div
                className={
                    'collapsible-header d-flex justify-content-between align-items-center p-3 bg-white cursor-pointer ' +
                    (isExpanded ? 'rounded-top' : 'rounded')
                }
                onClick={() => setIsExpanded(!isExpanded)}
                style={{ cursor: 'pointer' }}
            >
                <div className="d-flex align-items-center">
                    <i
                        className={`bi bi-chevron-${isExpanded ? 'down' : 'right'} me-2`}
                        style={{ opacity: '0.2' }}
                    ></i>
                    <span className="fw-bold">{title}</span>
                </div>
                {!isExpanded && (
                    <div className="text-muted small pe-2">
                        {collapsedSummary}
                    </div>
                )}
            </div>

            {isExpanded && (
                <div className="collapsible-content p-3 rounded-bottom bg-white">
                    {children}
                </div>
            )}
        </div>
    );
};

export default CollapsibleSection;
