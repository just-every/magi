import React, { useMemo } from 'react';
import TimelinePlayer, { TimelinePoint } from './TimelinePlayer';
import { ConsoleEvent } from '../../../../types/shared-types';

const ConsoleDisplay: React.FC<{
    consoleEvents: ConsoleEvent[];
}> = ({ consoleEvents }) => {
    // Convert ScreenshotEvent[] to TimelinePoint[]
    const points = useMemo<TimelinePoint[]>(() => {
        if (!consoleEvents || consoleEvents.length === 0) return [];

        return consoleEvents.map((consoleEvent: ConsoleEvent, index) => ({
            time: consoleEvent.timestamp
                ? new Date(consoleEvent.timestamp).getTime() / 1000 // Convert to seconds
                : index, // Fallback to index if no timestamp
            console: consoleEvent.data,
            message_id: consoleEvent.message_id,
        }));
    }, [consoleEvents]);

    // Don't render anything if there are no events
    if (points.length === 0) return null;

    // Render the TimelineConsole with converted points
    return <TimelinePlayer mode="console" points={points} />;
};

export default ConsoleDisplay;
