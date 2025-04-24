import React, {
    useEffect,
    useMemo,
    useRef,
    useState,
    useCallback,
} from 'react';
import '../../../css/components/timeline-player.css'; // Import from centralized CSS folder

/** -------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------*/
export interface TimelinePoint {
    time: number; // seconds (monotonic, ascending preferred but not required)
    screenshot: string; // full-size image (data URL or remote URL)
    thumbnail?: string; // optional smaller preview shown on hover
    url: string; // url displayed in the header bar
}

interface TimelinePlayerProps {
    points: TimelinePoint[]; // new points may be pushed in over time
    initialTime?: number; // optional starting time; defaults to latest
    className?: string; // extra wrapper classes for the main card
    style?: React.CSSProperties; // inline styles on the card
    onTimeChange?: (pt: TimelinePoint) => void; // emit when user scrubs or time changes
}

/** -------------------------------------------------------------------------
 * Utility helpers
 * --------------------------------------------------------------------------*/
const formatTime = (secs: number): string => {
    if (!Number.isFinite(secs)) return '0:00';
    const nonNegativeSecs = Math.max(0, secs);
    const s = Math.floor(nonNegativeSecs % 60)
        .toString()
        .padStart(2, '0');
    const m = Math.floor((nonNegativeSecs / 60) % 60)
        .toString()
        .padStart(2, '0');
    const h = Math.floor(nonNegativeSecs / 3600);
    return h > 0 ? `${h}:${m}:${s}` : `${m.substring(m.length - 2)}:${s}`;
};

/** -------------------------------------------------------------------------
 * TimelinePlayer Component
 * --------------------------------------------------------------------------*/
const TimelinePlayer: React.FC<TimelinePlayerProps> = ({
    points,
    initialTime,
    className = '',
    style,
    onTimeChange,
}) => {
    // --- State ---
    const [collapsed, setCollapsed] = useState(false);
    const [currentIndex, setCurrentIndex] = useState<number>(-1);
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [isLive, setIsLive] = useState<boolean>(true);
    const [isDragging, setIsDragging] = useState(false); // State to control dragging class
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);

    // --- Refs ---
    const trackRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false); // Ref to track dragging state for listeners

    // --- Memoized Derived Data ---
    const sortedPoints = useMemo(
        () => [...points].sort((a, b) => a.time - b.time),
        [points]
    );
    const startTime = useMemo(() => sortedPoints[0]?.time ?? 0, [sortedPoints]);
    const endTime = useMemo(
        () => sortedPoints[sortedPoints.length - 1]?.time ?? 0,
        [sortedPoints]
    );
    const duration = useMemo(
        () => Math.max(1, endTime - startTime),
        [startTime, endTime]
    );

    // --- Effects ---

    // Effect to initialize or update state when points array changes (Live follow logic)
    useEffect(() => {
        if (sortedPoints.length === 0) {
            setCurrentTime(0);
            setCurrentIndex(-1);
            setIsLive(true);
            return;
        }
        const newLatestTime = sortedPoints[sortedPoints.length - 1].time;
        if (isLive) {
            if (currentTime !== newLatestTime) {
                setCurrentTime(newLatestTime);
                const newIndex = sortedPoints.length - 1;
                setCurrentIndex(newIndex);
                if (onTimeChange && sortedPoints[newIndex]) {
                    onTimeChange(sortedPoints[newIndex]);
                }
            } else {
                setCurrentIndex(sortedPoints.length - 1);
            }
        } else {
            let foundIndex = -1;
            let minDiff = Infinity;
            sortedPoints.forEach((p, i) => {
                const diff = Math.abs(p.time - currentTime);
                if (diff < minDiff) {
                    minDiff = diff;
                    foundIndex = i;
                }
            });
            if (foundIndex !== -1) {
                const closestTime = sortedPoints[foundIndex].time;
                if (currentTime !== closestTime) {
                    setCurrentTime(closestTime);
                }
                setCurrentIndex(foundIndex);
                setIsLive(closestTime === newLatestTime);
            } else {
                setCurrentTime(newLatestTime);
                setCurrentIndex(sortedPoints.length - 1);
                setIsLive(true);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sortedPoints, isLive]); // Removed currentTime from deps to avoid loops when not live

    // Effect to set initial time (runs once or if initialTime/points change)
    useEffect(() => {
        if (sortedPoints.length === 0) return;
        let targetTime: number;
        if (initialTime !== undefined) {
            let closestIndex = 0;
            let minDiff = Infinity;
            sortedPoints.forEach((p, i) => {
                const diff = Math.abs(p.time - initialTime);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIndex = i;
                }
            });
            targetTime = sortedPoints[closestIndex].time;
        } else {
            targetTime = sortedPoints[sortedPoints.length - 1].time;
        }
        setCurrentTime(targetTime);
        const targetIndex = sortedPoints.findIndex(p => p.time === targetTime);
        setCurrentIndex(targetIndex);
        setIsLive(targetTime === endTime);
        if (onTimeChange && targetIndex !== -1) {
            onTimeChange(sortedPoints[targetIndex]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialTime, sortedPoints, endTime, onTimeChange]);

    // --- Slider Calculation Helpers ---
    const timeToPercentage = useCallback(
        (t: number): number => {
            if (duration <= 1) return t >= endTime ? 100 : 0;
            const percentage = ((t - startTime) / duration) * 100;
            return Math.max(0, Math.min(percentage, 100));
        },
        [startTime, duration, endTime]
    );

    const findClosestTime = useCallback(
        (targetTime: number): number => {
            if (sortedPoints.length === 0) return 0;
            if (sortedPoints.length === 1) return sortedPoints[0].time;
            let closestIndex = 0;
            let minDifference = Infinity;
            sortedPoints.forEach((point, index) => {
                const difference = Math.abs(point.time - targetTime);
                if (difference < minDifference) {
                    minDifference = difference;
                    closestIndex = index;
                }
            });
            return sortedPoints[closestIndex].time;
        },
        [sortedPoints]
    );

    const getTimeFromClientX = useCallback(
        (clientX: number): number => {
            if (!trackRef.current || sortedPoints.length === 0)
                return currentTime;
            const trackRect = trackRef.current.getBoundingClientRect();
            const relativeX = Math.max(
                0,
                Math.min(clientX - trackRect.left, trackRect.width)
            );
            const percentage =
                trackRect.width > 0 ? relativeX / trackRect.width : 0;
            const calculatedTime = startTime + percentage * duration;
            return findClosestTime(calculatedTime);
        },
        [startTime, duration, sortedPoints, currentTime, findClosestTime]
    );

    // --- Event Handlers ---

    // Use useCallback for the move handler to ensure stable reference for listeners
    const handleGlobalMouseMove = useCallback(
        (event: MouseEvent | TouchEvent) => {
            if (!isDraggingRef.current) return;
            if (event.type === 'touchmove') event.preventDefault(); // Prevent scroll

            const clientX =
                'touches' in event ? event.touches[0].clientX : event.clientX;
            const newTime = getTimeFromClientX(clientX);

            setCurrentTime(prevTime => {
                if (prevTime !== newTime) {
                    const newIndex = sortedPoints.findIndex(
                        p => p.time === newTime
                    );
                    setCurrentIndex(newIndex);
                    setIsLive(newTime === endTime);
                    if (onTimeChange && newIndex !== -1)
                        onTimeChange(sortedPoints[newIndex]);
                    return newTime;
                }
                return prevTime;
            });
        },
        [getTimeFromClientX, sortedPoints, endTime, onTimeChange]
    );

    // Use useCallback for the end handler
    const handleInteractionEnd = useCallback(() => {
        if (isDraggingRef.current) {
            isDraggingRef.current = false;
            setIsDragging(false); // Update state to remove dragging class
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('touchmove', handleGlobalMouseMove);
        }
    }, [handleGlobalMouseMove]);

    const handleInteractionStart = useCallback(
        (clientX: number) => {
            if (sortedPoints.length === 0) return;
            isDraggingRef.current = true;
            setIsDragging(true); // Update state to add dragging class
            document.body.style.userSelect = 'none';

            const newTime = getTimeFromClientX(clientX);
            if (newTime !== currentTime) {
                setCurrentTime(newTime);
                const newIndex = sortedPoints.findIndex(
                    p => p.time === newTime
                );
                setCurrentIndex(newIndex);
                setIsLive(newTime === endTime);
                if (onTimeChange && newIndex !== -1)
                    onTimeChange(sortedPoints[newIndex]);
            }

            window.addEventListener('mousemove', handleGlobalMouseMove);
            window.addEventListener('touchmove', handleGlobalMouseMove, {
                passive: false,
            });
            window.addEventListener('mouseup', handleInteractionEnd, {
                once: true,
            });
            window.addEventListener('touchend', handleInteractionEnd, {
                once: true,
            });
        },
        [
            sortedPoints,
            getTimeFromClientX,
            currentTime,
            endTime,
            onTimeChange,
            handleGlobalMouseMove,
            handleInteractionEnd,
        ]
    );

    // Handle hover for thumbnail preview
    const handleTrackMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
        if (
            isDraggingRef.current ||
            !trackRef.current ||
            sortedPoints.length < 1
        ) {
            setHoverIndex(null);
            return;
        }
        const trackRect = trackRef.current.getBoundingClientRect();
        const clientX = event.clientX;
        const relativeX = Math.max(
            0,
            Math.min(clientX - trackRect.left, trackRect.width)
        );
        const hoverRatio =
            trackRect.width > 0 ? relativeX / trackRect.width : 0;
        const hoverTime = startTime + hoverRatio * duration;

        let targetHoverIndex: number | null = null;
        for (let i = sortedPoints.length - 1; i >= 0; i--) {
            if (sortedPoints[i].time <= hoverTime) {
                if (sortedPoints[i].time < currentTime) targetHoverIndex = i;
                break;
            }
        }
        if (
            targetHoverIndex === null &&
            hoverTime < (sortedPoints[0]?.time ?? startTime) &&
            sortedPoints.length > 0 &&
            sortedPoints[0].time < currentTime
        ) {
            targetHoverIndex = 0;
        }
        setHoverIndex(targetHoverIndex);
    };

    const handleTrackMouseLeave = () => setHoverIndex(null);
    const toggleCollapse = () => setCollapsed(c => !c);

    // --- Current Item Data ---
    const currentPoint = useMemo(
        () =>
            currentIndex >= 0 && currentIndex < sortedPoints.length
                ? sortedPoints[currentIndex]
                : null,
        [currentIndex, sortedPoints]
    );

    // --- Render Calculations ---
    const progressPercentage = timeToPercentage(currentTime);

    // --- JSX ---
    return (
        <div
            className={`browser-agent-card mt-2 mb-3 ${className}`}
            style={style}
        >
            {/* --- URL BAR (Bootstrap) --- */}
            <div className="url-bar d-flex align-items-center py-1 px-2 text-center bg-light border rounded-top text-secondary" onClick={toggleCollapse}>
                <div
                    className="url-text mx-auto text-truncate small font-monospace text-start flex-grow-1"
                    title={currentPoint?.url ?? ''}
                >
                    {currentPoint?.url || '…'}
                </div>
                <button
                    type="button"
                    className="btn btn-sm p-0 ms-2 border-0"
                    aria-label={collapsed ? 'Expand' : 'Collapse'}
                    title={collapsed ? 'Expand' : 'Collapse'}
                    aria-expanded={!collapsed}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="currentColor"
                        className="tsp-collapse-icon"
                        style={{
                            transform: collapsed
                                ? 'rotate(180deg)'
                                : 'rotate(0deg)',
                        }}
                    >
                        <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
                    </svg>
                </button>
            </div>
            {/* --- COLLAPSIBLE CONTENT --- */}
            {!collapsed && (
                <>
                    {/* --- Screenshot Area (Bootstrap) --- */}
                    <div className="screenshot-container position-relative border-start border-end bg-white">
                        {currentPoint ? (
                            <img
                                key={currentPoint.time}
                                src={currentPoint.screenshot}
                                className="img-fluid w-100 d-block"
                                alt={`Screenshot for ${currentPoint.url}`}
                                onError={e => {
                                    e.currentTarget.style.display = 'none';
                                }}
                            />
                        ) : (
                            <div className="py-3 text-center text-muted small">
                                {points.length > 0
                                    ? 'Loading...'
                                    : 'No timeline data'}
                            </div>
                        )}
                    </div>
                    {/* --- Control Bar (Bootstrap layout, custom slider inside) --- */}
                    <div className="control-bar d-flex align-items-center p-2 bg-light border rounded-bottom">
                        {sortedPoints.length > 0 ? (
                            <div className="d-flex flex-column w-100">

                                {/* --- Custom TimeSlider Implementation --- */}
                                <div className="px-2">
                                    <div
                                        ref={trackRef}
                                        className="tsp-track-container" // Use prefixed class
                                        onMouseDown={e =>
                                            handleInteractionStart(e.clientX)
                                        }
                                        onTouchStart={e =>
                                            handleInteractionStart(
                                                e.touches[0].clientX
                                            )
                                        }
                                        onMouseMove={handleTrackMouseMove}
                                        onMouseLeave={handleTrackMouseLeave}
                                    >
                                        {/* Track Background */}
                                        <div className="tsp-track">
                                            {' '}
                                            {/* Use prefixed class */}
                                            {/* Active Track Bar (width set inline) */}
                                            <div
                                                className="tsp-track-bar-active"
                                                style={{
                                                    width: `${progressPercentage}%`,
                                                }}
                                            />{' '}
                                            {/* Use prefixed class */}
                                        </div>

                                        {/* Knob Container (position calculated inline) */}
                                        <div
                                            className="tsp-knob-container"
                                            style={{
                                                left: `${progressPercentage}%`,
                                            }}
                                        >
                                            {' '}
                                            {/* Use prefixed class */}
                                            {/* The Knob (dragging class applied conditionally) */}
                                            <div
                                                className={`tsp-knob ${isDragging ? 'tsp-knob--dragging' : ''}`} // Use prefixed classes
                                                role="slider"
                                                aria-valuemin={startTime}
                                                aria-valuemax={endTime}
                                                aria-valuenow={currentTime}
                                                aria-valuetext={formatTime(
                                                    currentTime
                                                )}
                                                tabIndex={0}
                                            />
                                        </div>

                                        {/* Thumbnail Preview (conditionally rendered) */}
                                        {hoverIndex !== null &&
                                            sortedPoints[hoverIndex]?.thumbnail && (
                                                <div
                                                    className="tsp-thumbnail-preview"
                                                    style={{
                                                        left: `${timeToPercentage(sortedPoints[hoverIndex].time)}%`,
                                                    }}
                                                >
                                                    {' '}
                                                    {/* Use prefixed class */}
                                                    <img
                                                        src={
                                                            sortedPoints[hoverIndex]
                                                                .thumbnail
                                                        }
                                                        className="tsp-thumbnail-image"
                                                        alt="Preview"
                                                    />{' '}
                                                    {/* Use prefixed class */}
                                                </div>
                                            )}
                                    </div>{' '}
                                    {/* End tsp-track-container */}
                                </div>

                                {/* Time Labels */}
                                <div className="tsp-labels">
                                    {' '}
                                    {/* Use prefixed class */}
                                    <span>
                                        {formatTime(currentTime - startTime)}
                                    </span>
                                    <span className={isLive ? 'tsp-labels-live' : ''}>
                                        {isLive
                                            ? 'LIVE'
                                            : `-${formatTime(endTime - currentTime)}`}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="text-muted small w-100 text-center">
                                No time data
                            </div>
                        )}
                    </div>{' '}
                    {/* End control-bar */}
                </>
            )}{' '}
            {/* End !collapsed */}
        </div> /* End browser-agent-card */
    );
};

export default TimelinePlayer;
