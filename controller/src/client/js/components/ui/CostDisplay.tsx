import * as React from 'react';
import { useSocket } from '../../context/SocketContext';
import { useState, useEffect } from 'react';
import CostLimitSettings from './CostLimitSettings';

// No props needed
interface CostDisplayProps {
    forceExpand?: boolean;
}

/**
 * Cost Display Component
 *
 * Displays real-time LLM cost information using the updated GlobalCostData structure.
 */
const CostDisplay: React.FC<CostDisplayProps> = ({ forceExpand = false }) => {
    // Assume useSocket returns data conforming to GlobalCostData | null
    const { costData, socket } = useSocket();
    const [expanded, setExpanded] = useState<boolean>(forceExpand);
    const [showSettings, setShowSettings] = useState<boolean>(false);
    const [dailyLimit, setDailyLimit] = useState<number | null>(null);

    // Load cost limit
    useEffect(() => {
        if (socket) {
            socket.emit('CLIENT_GET_COST_LIMIT');

            const handleCostLimit = (data: { dailyLimit: number | null }) => {
                setDailyLimit(data.dailyLimit);
            };

            socket.on('COST_LIMIT_DATA', handleCostLimit);

            return () => {
                socket.off('COST_LIMIT_DATA', handleCostLimit);
            };
        }
    }, [socket]);

    // Render nothing if cost data is not yet available
    if (!costData) {
        return null;
    }

    // Formatter for detailed costs (e.g., total cost, model costs)
    const costFormatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 4, // Show more precision for small costs
        maximumFractionDigits: 4,
    });

    // Formatter for cost per minute (less precision needed)
    const costPerMinFormatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    // Formatter for tokens (integer)
    const tokenFormatter = new Intl.NumberFormat('en-US');

    // Formatter for dates/times
    const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

    // Convert the models object into a sorted array for display
    const sortedModelCosts = Object.entries(costData.usage.models || {})
        .map(([modelName, data]) => {
            // Type assertion to ensure data is treated as a record with cost and calls
            const modelData = data as { cost: number; calls: number };
            return {
                model: modelName,
                cost: modelData.cost,
                calls: modelData.calls,
            };
        })
        .sort((a, b) => b.cost - a.cost); // Sort by cost, highest first

    // Safely format dates, handling potential invalid date strings
    const formatDateTime = (dateString: string): string => {
        try {
            return dateTimeFormatter.format(new Date(dateString));
        } catch (e) {
            return 'Invalid Date';
        }
    };

    const expandedContent = expanded && (
        <div className="mt-2 border-top pt-2">
            {/* --- Model Details --- */}
            <div className="fw-bold mb-1 text-dark">Models:</div>
            {sortedModelCosts.length > 0 ? (
                sortedModelCosts.map(model => (
                    <div
                        key={model.model}
                        className="d-flex justify-content-between align-items-center small mb-1"
                    >
                        <span
                            title={model.model}
                            className="text-muted me-2"
                            style={{
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: '150px',
                            }}
                        >
                            {model.model}:
                        </span>
                        <span className="text-dark">
                            {costFormatter.format(model.cost)} ({model.calls}{' '}
                            calls)
                        </span>
                    </div>
                ))
            ) : (
                <div className="small text-muted fst-italic">
                    No model usage yet.
                </div>
            )}

            {/* --- Token Details --- */}
            <div className="fw-bold mb-1 mt-2 text-dark">Tokens:</div>
            <div className="d-flex justify-content-between align-items-center small">
                <span className="text-muted">Input:</span>
                {/* Access input tokens via usage.tokens.input */}
                <span className="text-dark">
                    {tokenFormatter.format(costData.usage.tokens.input)}
                </span>
            </div>
            <div className="d-flex justify-content-between align-items-center small">
                <span className="text-muted">Output:</span>
                {/* Access output tokens via usage.tokens.output */}
                <span className="text-dark">
                    {tokenFormatter.format(costData.usage.tokens.output)}
                </span>
            </div>

            {/* --- System Info --- */}
            <div className="fw-bold mb-1 mt-2 text-dark">System:</div>
            <div className="d-flex justify-content-between align-items-center small">
                <span className="text-muted">Processes:</span>
                {/* numProcesses is directly available */}
                <span className="text-dark">{costData.numProcesses}</span>
            </div>
            <div className="d-flex justify-content-between align-items-center small">
                <span className="text-muted">Tracking Since:</span>
                {/* systemStartTime is directly available */}
                <span className="text-dark">
                    {formatDateTime(costData.systemStartTime)}
                </span>
            </div>
            <div className="d-flex justify-content-between align-items-center small">
                <span className="text-muted">Last Update Inc.:</span>
                {/* Access last update time via usage.time.now */}
                <span className="text-dark">
                    {formatDateTime(costData.usage.time.now)}
                </span>
            </div>

            <div className="d-flex justify-content-between align-items-center small">
                <span className="text-muted">Cost (Last Min*):</span>
                <span className="text-dark">
                    {costFormatter.format(costData.usage.cost.last_min)}
                </span>
            </div>

            {/* Settings button */}
            <div className="mt-2 text-center">
                <button
                    className="btn btn-sm btn-outline-secondary"
                    onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowSettings(prev => !prev);
                    }}
                    onMouseDown={e => e.stopPropagation()}
                >
                    <i className="bi bi-gear me-1"></i>
                    Cost Settings
                </button>
            </div>

            {!forceExpand && (
                <div className="text-center small text-muted mt-2 fst-italic">
                    Click to collapse
                </div>
            )}
        </div>
    );

    // Calculate limit status
    const currentSpend = costData.usage.cost.total;
    const isOverLimit = dailyLimit !== null && currentSpend > dailyLimit;
    const isNearLimit = dailyLimit !== null && currentSpend > dailyLimit * 0.8;
    const limitPercentage =
        dailyLimit !== null ? (currentSpend / dailyLimit) * 100 : 0;

    const costHeader = (
        <div>
            {/* Limit warning if applicable */}
            {dailyLimit !== null &&
                (isOverLimit || isNearLimit) &&
                !expanded && (
                    <div
                        className={`text-center mb-2 small ${isOverLimit ? 'text-danger' : 'text-warning'}`}
                    >
                        <i
                            className={`bi ${isOverLimit ? 'bi-exclamation-triangle-fill' : 'bi-exclamation-triangle'} me-1`}
                        ></i>
                        {isOverLimit ? 'Over daily limit!' : 'Near daily limit'}
                    </div>
                )}
            {/* Mini progress bar in collapsed view */}
            {!expanded && dailyLimit !== null && (
                <div className="mb-2" style={{ padding: '0 4px' }}>
                    <div
                        className="progress"
                        style={{
                            height: '3px',
                            backgroundColor: 'rgba(255,255,255,0.2)',
                        }}
                    >
                        <div
                            className={`progress-bar ${
                                isOverLimit
                                    ? 'bg-danger'
                                    : isNearLimit
                                      ? 'bg-warning'
                                      : 'bg-success'
                            }`}
                            role="progressbar"
                            style={{
                                width: `${Math.min(limitPercentage, 100)}%`,
                            }}
                            aria-valuenow={limitPercentage}
                            aria-valuemin={0}
                            aria-valuemax={100}
                        />
                    </div>
                </div>
            )}
            <div
                className={
                    'd-flex align-items-center mb-1 ' +
                    (expanded
                        ? 'justify-content-between'
                        : 'justify-content-end')
                }
            >
                {expanded && <span className="fw-bold">Total Cost:</span>}
                <span
                    className={
                        'fw-bold ' + (expanded ? 'text-dark' : 'text-white')
                    }
                >
                    {(costData.usage.cost.total < 0.1
                        ? costFormatter
                        : costPerMinFormatter
                    ).format(costData.usage.cost.total)}
                    {/* Show limit in collapsed view */}
                    {!expanded && dailyLimit !== null && (
                        <span
                            className="text-white-50 ms-1"
                            style={{ fontSize: '0.75em' }}
                        >
                            / ${dailyLimit.toFixed(0)}
                        </span>
                    )}
                </span>
            </div>
            <div
                className={
                    'd-flex align-items-center mb-1 ' +
                    (expanded
                        ? 'justify-content-between'
                        : 'justify-content-end')
                }
            >
                {expanded && <span className="fw-bold">Current Rate:</span>}
                <span className={expanded ? 'text-dark' : 'text-white'}>
                    {costPerMinFormatter.format(costData.costPerMinute)}/min
                </span>
            </div>
            {/* Daily limit progress in expanded view */}
            {expanded && dailyLimit !== null && (
                <div className="mt-2">
                    <div className="d-flex justify-content-between small mb-1">
                        <span>Daily Limit:</span>
                        <span
                            className={isOverLimit ? 'text-danger fw-bold' : ''}
                        >
                            ${currentSpend.toFixed(2)} / $
                            {dailyLimit.toFixed(2)}
                        </span>
                    </div>
                    <div className="progress" style={{ height: '6px' }}>
                        <div
                            className={`progress-bar ${
                                isOverLimit
                                    ? 'bg-danger'
                                    : isNearLimit
                                      ? 'bg-warning'
                                      : 'bg-success'
                            }`}
                            role="progressbar"
                            style={{
                                width: `${Math.min(limitPercentage, 100)}%`,
                            }}
                            aria-valuenow={limitPercentage}
                            aria-valuemin={0}
                            aria-valuemax={100}
                        />
                    </div>
                </div>
            )}
        </div>
    );

    if (forceExpand) {
        return (
            <>
                {costHeader}
                {expandedContent}

                {/* Settings Panel for forceExpand mode */}
                {showSettings && (
                    <div
                        className="mt-3"
                        style={{
                            position: 'relative',
                            zIndex: 10,
                        }}
                    >
                        <CostLimitSettings
                            onClose={() => setShowSettings(false)}
                        />
                    </div>
                )}
            </>
        );
    }

    return (
        <>
            {/* Main cost display */}
            <div
                className={
                    'position-fixed p-2 ' +
                    (expanded ? 'bg-light border rounded shadow-sm' : '')
                } // Added background/shadow
                style={{
                    top: '10px',
                    right: '10px', // Adjusted position slightly
                    zIndex: 1050, // Ensure it's above most elements
                    fontSize: '0.8rem', // Slightly smaller font
                    minWidth: '160px', // Set a min-width
                    maxWidth: expanded ? '350px' : '160px', // Adjust max-width for expanded state
                    transition: 'max-width 0.3s ease-in-out',
                    cursor: 'pointer',
                    userSelect: 'none', // Prevent text selection on click
                }}
                onClick={e => {
                    // Don't toggle if clicking on a button or if forceExpand is true
                    const target = e.target as HTMLElement;
                    if (
                        forceExpand ||
                        target.closest('button') ||
                        target.closest('.btn')
                    ) {
                        return;
                    }
                    setExpanded(!expanded);
                }}
                title={expanded ? 'Click to collapse' : 'Click to expand'} // Add tooltip
            >
                {/* Always Visible Section */}
                {costHeader}

                {/* Expanded Section */}
                {expandedContent}
            </div>

            {/* Settings Panel */}
            {showSettings && (
                <div
                    className="position-fixed"
                    style={{
                        top: expanded ? '420px' : '100px',
                        right: '10px',
                        zIndex: 1051,
                        minWidth: '280px',
                    }}
                >
                    <CostLimitSettings onClose={() => setShowSettings(false)} />
                </div>
            )}
        </>
    );
};

export default CostDisplay;
