import React, { useMemo } from 'react';
import TimelinePlayer, { TimelinePoint } from './TimelinePlayer';
import { ScreenshotEvent } from '../../../../types/shared-types';

/**
 * Component to display browser agent screenshots using the new TimelinePlayer component
 * Acts as an adapter between the existing API (ScreenshotEvent[]) and TimelinePlayer (TimelinePoint[])
 */
const BrowserDisplay: React.FC<{
    screenshots: ScreenshotEvent[];
    collapsible?: boolean;
}> = ({ screenshots, collapsible }) => {
    // Convert ScreenshotEvent[] to TimelinePoint[]
    const points = useMemo<TimelinePoint[]>(() => {
        if (!screenshots || screenshots.length === 0) return [];

        return screenshots.map((screenshot: ScreenshotEvent, index) => ({
            time: screenshot.timestamp
                ? new Date(screenshot.timestamp).getTime() / 1000 // Convert to seconds
                : index, // Fallback to index if no timestamp
            screenshot: screenshot.data,
            thumbnail: screenshot.data, // Use the same image for thumbnail
            url: screenshot.url || '…', // Default to ellipsis if URL is missing
            viewport: screenshot.viewport,
            cursor: screenshot.cursor,
        }));
    }, [screenshots]);

    // Don't render anything if there are no screenshots
    if (points.length === 0) return null;

    // Render the TimelinePlayer with converted points
    return (
        <TimelinePlayer
            mode="browser"
            points={points}
            collapsible={collapsible}
        />
    );
};

export default BrowserDisplay;
