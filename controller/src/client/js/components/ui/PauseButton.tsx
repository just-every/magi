import * as React from 'react';
import { useState } from 'react';
import { useSocket } from '../../context/SocketContext';

const PauseButton: React.FC = () => {
    const { socket, isPaused, togglePauseState } = useSocket();
    const [isLoading, setIsLoading] = useState(false);

    const handleClick = () => {
        if (!socket) return;

        setIsLoading(true);
        togglePauseState();

        // Reset loading state after a brief delay to show feedback
        setTimeout(() => setIsLoading(false), 500);
    };

    return (
        <button
            className={`btn btn btn-sm ${isPaused ? 'btn-success' : 'btn-light'} pause-button`}
            onClick={handleClick}
            disabled={isLoading || !socket}
        >
            {isLoading ? (
                <span
                    className="spinner-border spinner-border-sm"
                    role="status"
                    aria-hidden="true"
                ></span>
            ) : (
                <span>{isPaused ? 'Resume' : 'Pause'}</span>
            )}
        </button>
    );
};

export default PauseButton;
