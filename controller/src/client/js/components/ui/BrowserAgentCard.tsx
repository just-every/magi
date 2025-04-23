import * as React from 'react';
import { useMemo } from 'react';
import { ScreenshotEvent } from '../../../../types/shared-types';
import TimelinePlayer, { TimelinePoint } from './TimelinePlayer';

/**
 * Component to display browser agent screenshots using the new TimelinePlayer component
 * Acts as an adapter between the existing API (ScreenshotEvent[]) and TimelinePlayer (TimelinePoint[])
 */
const BrowserAgentCard: React.FC<{
    screenshots: ScreenshotEvent[];
}> = ({ screenshots }) => {
    // Convert ScreenshotEvent[] to TimelinePoint[]
    const points = useMemo<TimelinePoint[]>(() => {
        if (!screenshots || screenshots.length === 0) return [];

        return screenshots.map((screenshot, index) => ({
            time: screenshot.timestamp
                ? new Date(screenshot.timestamp).getTime() / 1000 // Convert to seconds
                : index, // Fallback to index if no timestamp
            screenshot: screenshot.data,
            thumbnail: screenshot.data, // Use the same image for thumbnail
            url: screenshot.url || '…', // Default to ellipsis if URL is missing
        }));
    }, [screenshots]);

    // Don't render anything if there are no screenshots
    if (points.length === 0) return null;

    // Render the TimelinePlayer with converted points
    return <TimelinePlayer points={points} />;
};

export default BrowserAgentCard;
