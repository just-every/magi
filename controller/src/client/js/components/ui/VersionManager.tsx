import React, { useState, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import './VersionManager.css';

interface MagiVersion {
    version: string;
    commit: string;
    tag?: string;
    date: Date;
    description?: string;
    active?: boolean;
}

interface VersionManagerProps {
    isOpen: boolean;
    onClose: () => void;
}

export const VersionManager: React.FC<VersionManagerProps> = ({
    isOpen,
    onClose,
}) => {
    const { socket } = useSocket();
    const [versions, setVersions] = useState<MagiVersion[]>([]);
    const [currentVersion, setCurrentVersion] = useState<MagiVersion | null>(
        null
    );
    const [loading, setLoading] = useState(false);
    const [updateProgress, setUpdateProgress] = useState<{
        version?: string;
        strategy?: string;
        status?: string;
        error?: string;
    }>({});
    const [selectedStrategy, setSelectedStrategy] = useState<
        'rolling' | 'immediate' | 'graceful'
    >('rolling');

    useEffect(() => {
        if (isOpen) {
            fetchVersions();
        }
    }, [isOpen]);

    useEffect(() => {
        if (!socket) return;

        // Listen for version update events
        socket.on('version:update:start', data => {
            setUpdateProgress({
                version: data.version,
                strategy: data.strategy,
                status: 'starting',
            });
        });

        socket.on('version:update:container', data => {
            setUpdateProgress(prev => ({
                ...prev,
                status: `Updating container ${data.processId}`,
            }));
        });

        socket.on('version:update:complete', data => {
            setUpdateProgress({
                version: data.version,
                status: 'complete',
            });
            // Refresh versions after update
            fetchVersions();
        });

        socket.on('version:update:error', data => {
            setUpdateProgress({
                version: data.version,
                status: 'error',
                error: data.error,
            });
        });

        return () => {
            socket.off('version:update:start');
            socket.off('version:update:container');
            socket.off('version:update:complete');
            socket.off('version:update:error');
        };
    }, [socket]);

    const fetchVersions = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/versions');
            const data = await response.json();
            if (data.success) {
                setVersions(data.versions);
                setCurrentVersion(data.current);
            }
        } catch (error) {
            console.error('Failed to fetch versions:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async (version: string) => {
        if (!confirm(`Update containers to version ${version}?`)) {
            return;
        }

        try {
            const response = await fetch('/api/versions/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    version,
                    strategy: selectedStrategy,
                }),
            });

            const data = await response.json();
            if (!data.success) {
                alert(`Update failed: ${data.error}`);
            }
        } catch (error) {
            console.error('Failed to update version:', error);
            alert('Failed to start update');
        }
    };

    const handleRollback = async (version: string) => {
        if (
            !confirm(
                `Rollback to version ${version}? This will restart all containers.`
            )
        ) {
            return;
        }

        try {
            const response = await fetch('/api/versions/rollback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ version }),
            });

            const data = await response.json();
            if (!data.success) {
                alert(`Rollback failed: ${data.error}`);
            }
        } catch (error) {
            console.error('Failed to rollback:', error);
            alert('Failed to rollback');
        }
    };

    const handleCreateTag = async () => {
        const tag = prompt('Enter new version tag (e.g., v1.0.0):');
        if (!tag) return;

        const description = prompt('Enter version description (optional):');

        try {
            const response = await fetch('/api/versions/tag', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tag, description }),
            });

            const data = await response.json();
            if (data.success) {
                fetchVersions();
            } else {
                alert(`Failed to create tag: ${data.error}`);
            }
        } catch (error) {
            console.error('Failed to create tag:', error);
            alert('Failed to create tag');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="version-manager-overlay">
            <div className="version-manager">
                <div className="version-manager-header">
                    <h2>Version Management</h2>
                    <button className="close-button" onClick={onClose}>
                        ×
                    </button>
                </div>

                <div className="version-manager-content">
                    {loading ? (
                        <div className="loading">Loading versions...</div>
                    ) : (
                        <>
                            <div className="current-version">
                                <h3>Current Version</h3>
                                {currentVersion ? (
                                    <div className="version-info">
                                        <span className="version-tag">
                                            {currentVersion.version}
                                        </span>
                                        <span className="version-date">
                                            {new Date(
                                                currentVersion.date
                                            ).toLocaleDateString()}
                                        </span>
                                    </div>
                                ) : (
                                    <div>No version information available</div>
                                )}
                            </div>

                            <div className="update-strategy">
                                <h3>Update Strategy</h3>
                                <select
                                    value={selectedStrategy}
                                    onChange={e =>
                                        setSelectedStrategy(
                                            e.target.value as
                                                | 'rolling'
                                                | 'immediate'
                                                | 'graceful'
                                        )
                                    }
                                >
                                    <option value="rolling">
                                        Rolling Update (one at a time)
                                    </option>
                                    <option value="immediate">
                                        Immediate Update (all at once)
                                    </option>
                                    <option value="graceful">
                                        Graceful Update (wait for tasks)
                                    </option>
                                </select>
                            </div>

                            {updateProgress.status && (
                                <div
                                    className={`update-progress ${updateProgress.status === 'error' ? 'error' : ''}`}
                                >
                                    <h3>Update Progress</h3>
                                    <div>Version: {updateProgress.version}</div>
                                    <div>Status: {updateProgress.status}</div>
                                    {updateProgress.error && (
                                        <div className="error-message">
                                            {updateProgress.error}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="version-list">
                                <div className="version-list-header">
                                    <h3>Available Versions</h3>
                                    <button
                                        className="create-tag-button"
                                        onClick={handleCreateTag}
                                    >
                                        Create Tag
                                    </button>
                                </div>
                                <div className="versions">
                                    {versions.map(version => (
                                        <div
                                            key={version.version}
                                            className={`version-item ${version.active ? 'active' : ''}`}
                                        >
                                            <div className="version-details">
                                                <span className="version-tag">
                                                    {version.tag ||
                                                        version.version}
                                                </span>
                                                {version.description && (
                                                    <span className="version-description">
                                                        {version.description}
                                                    </span>
                                                )}
                                                <span className="version-date">
                                                    {new Date(
                                                        version.date
                                                    ).toLocaleDateString()}
                                                </span>
                                            </div>
                                            <div className="version-actions">
                                                {!version.active && (
                                                    <>
                                                        <button
                                                            className="update-button"
                                                            onClick={() =>
                                                                handleUpdate(
                                                                    version.version
                                                                )
                                                            }
                                                        >
                                                            Update
                                                        </button>
                                                        <button
                                                            className="rollback-button"
                                                            onClick={() =>
                                                                handleRollback(
                                                                    version.version
                                                                )
                                                            }
                                                        >
                                                            Rollback
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
