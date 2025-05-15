import React, { useMemo } from 'react';
import TimelinePlayer, { TimelinePoint } from './TimelinePlayer';
import { ConsoleEvent } from '../../../../types/shared-types';

const ConsoleDisplay: React.FC<{
    consoleEvents: ConsoleEvent[];
    collapsible?: boolean;
}> = ({ consoleEvents, collapsible }) => {
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
    return (
        <TimelinePlayer
            mode="console"
            points={points}
            collapsible={collapsible}
            model={consoleEvents[consoleEvents.length - 1]?.agent?.model}
        />
    );
};

export default ConsoleDisplay;
