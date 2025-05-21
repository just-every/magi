import React, { useMemo } from 'react';
import TimelinePlayer, { TimelinePoint } from './TimelinePlayer';
import { DesignEvent } from '../../../../types/shared-types';

/**
 * Display design generation events using TimelinePlayer.
 */
const DesignDisplay: React.FC<{
    designEvents: DesignEvent[];
    collapsible?: boolean;
}> = ({ designEvents, collapsible }) => {
    const points = useMemo<TimelinePoint[]>(() => {
        if (!designEvents || designEvents.length === 0) return [];
        return designEvents.map((ev, index) => ({
            time: ev.timestamp
                ? new Date(ev.timestamp).getTime() / 1000
                : index,
            screenshot: ev.data,
            thumbnail: ev.data,
            url: ev.prompt,
            selected: ev.selected_indices,
            cols: ev.cols,
            rows: ev.rows,
        }));
    }, [designEvents]);

    if (points.length === 0) return null;

    return (
        <TimelinePlayer
            mode="design"
            points={points}
            collapsible={collapsible}
        />
    );
};

export default DesignDisplay;
