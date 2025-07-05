import * as React from 'react';
import { useState, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';

interface CostLimitSettingsProps {
    onClose?: () => void;
}

const CostLimitSettings: React.FC<CostLimitSettingsProps> = ({ onClose }) => {
    const { socket, costData } = useSocket();
    const [dailyLimit, setDailyLimit] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [showSuccess, setShowSuccess] = useState<boolean>(false);

    // Load current cost limit when component mounts
    useEffect(() => {
        if (socket) {
            // Request current cost limit from server
            socket.emit('CLIENT_GET_COST_LIMIT');

            // Listen for response
            const handleCostLimit = (data: { dailyLimit: number | null }) => {
                setDailyLimit(
                    data.dailyLimit ? data.dailyLimit.toString() : ''
                );
                setIsLoading(false);
            };

            socket.on('COST_LIMIT_DATA', handleCostLimit);

            return () => {
                socket.off('COST_LIMIT_DATA', handleCostLimit);
            };
        }
    }, [socket]);

    const handleSave = () => {
        if (!socket) return;

        setIsSaving(true);

        const limitValue = dailyLimit === '' ? null : parseFloat(dailyLimit);

        // Validate input
        if (limitValue !== null && (isNaN(limitValue) || limitValue <= 0)) {
            alert(
                'Please enter a valid positive number or leave empty to disable limit'
            );
            setIsSaving(false);
            return;
        }

        // Send update to server
        socket.emit('CLIENT_SET_COST_LIMIT', { dailyLimit: limitValue });

        // Listen for confirmation
        const handleSaveComplete = () => {
            setIsSaving(false);
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 2000);
        };

        socket.once('COST_LIMIT_SAVED', handleSaveComplete);
    };

    const currentSpend = costData?.usage.cost.total || 0;
    const limitNum = parseFloat(dailyLimit);
    const isOverLimit =
        dailyLimit && !isNaN(limitNum) && currentSpend > limitNum;
    const percentUsed =
        dailyLimit && !isNaN(limitNum) ? (currentSpend / limitNum) * 100 : 0;

    return (
        <div className="cost-limit-settings p-3 bg-white rounded shadow-sm">
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="mb-0">Daily Cost Limit</h5>
                {onClose && (
                    <button
                        className="btn btn-sm btn-outline-secondary"
                        onClick={onClose}
                    >
                        <i className="bi bi-x"></i>
                    </button>
                )}
            </div>

            {isLoading ? (
                <div className="text-center py-3">
                    <div
                        className="spinner-border spinner-border-sm"
                        role="status"
                    >
                        <span className="visually-hidden">Loading...</span>
                    </div>
                </div>
            ) : (
                <>
                    <div className="mb-3">
                        <label
                            htmlFor="dailyLimit"
                            className="form-label small"
                        >
                            Set daily spending limit (USD)
                        </label>
                        <div className="input-group">
                            <span className="input-group-text">$</span>
                            <input
                                type="number"
                                className={`form-control ${isOverLimit ? 'border-danger' : ''}`}
                                id="dailyLimit"
                                value={dailyLimit}
                                onChange={e => setDailyLimit(e.target.value)}
                                placeholder="No limit"
                                step="0.01"
                                min="0"
                                disabled={isSaving}
                            />
                        </div>
                        <small className="text-muted">
                            Leave empty to disable limit
                        </small>
                    </div>

                    {dailyLimit && !isNaN(limitNum) && (
                        <div className="mb-3">
                            <div className="d-flex justify-content-between small mb-1">
                                <span>Current spend:</span>
                                <span
                                    className={
                                        isOverLimit ? 'text-danger fw-bold' : ''
                                    }
                                >
                                    ${currentSpend.toFixed(2)} / $
                                    {limitNum.toFixed(2)}
                                </span>
                            </div>
                            <div className="progress" style={{ height: '8px' }}>
                                <div
                                    className={`progress-bar ${
                                        isOverLimit
                                            ? 'bg-danger'
                                            : percentUsed > 80
                                              ? 'bg-warning'
                                              : 'bg-success'
                                    }`}
                                    role="progressbar"
                                    style={{
                                        width: `${Math.min(percentUsed, 100)}%`,
                                    }}
                                    aria-valuenow={percentUsed}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                />
                            </div>
                            {isOverLimit && (
                                <small className="text-danger mt-1 d-block">
                                    <i className="bi bi-exclamation-triangle-fill me-1"></i>
                                    Daily limit exceeded!
                                </small>
                            )}
                        </div>
                    )}

                    <div className="d-flex gap-2">
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={handleSave}
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <>
                                    <span
                                        className="spinner-border spinner-border-sm me-1"
                                        role="status"
                                    >
                                        <span className="visually-hidden">
                                            Saving...
                                        </span>
                                    </span>
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <i className="bi bi-check-lg me-1"></i>
                                    Save
                                </>
                            )}
                        </button>

                        {showSuccess && (
                            <span className="text-success small align-self-center">
                                <i className="bi bi-check-circle-fill me-1"></i>
                                Saved!
                            </span>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default CostLimitSettings;
