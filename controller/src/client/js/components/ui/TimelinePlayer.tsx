import React, {
    useEffect,
    useMemo,
    useRef,
    useState,
    useCallback,
} from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit'; // Import FitAddon
import '@xterm/xterm/css/xterm.css';

/** -------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------*/
export interface TimelinePoint {
    time: number; // seconds (monotonic, ascending preferred but not required)
    console?: string; // optional console output (for console mode)
    message_id?: string; // optional message ID (for console mode)
    screenshot?: string; // full-size image (data URL or remote URL)
    thumbnail?: string; // optional smaller preview shown on hover
    url?: string; // url displayed in the header bar
    viewport?: {
        // Optional viewport rectangle for cropping/highlighting
        x: number;
        y: number;
        width: number;
        height: number;
    };
    cursor?: {
        x: number;
        y: number;
        button?: 'none' | 'left' | 'middle' | 'right';
    };
}

interface TimelinePlayerProps {
    mode: 'browser' | 'console'; // new points may be pushed in over time
    points: TimelinePoint[]; // new points may be pushed in over time
    collapsible?: boolean; // whether the player can be collapsed
    model?: string; // optional model name for console mode
    initialTime?: number; // optional starting time; defaults to latest
    className?: string; // extra wrapper classes for the main card
    style?: React.CSSProperties; // inline styles on the card
    onTimeChange?: (pt: TimelinePoint | null) => void; // emit when user scrubs or time changes, can be null
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
    mode,
    points,
    collapsible,
    model,
    initialTime,
    onTimeChange,
    className,
    style,
}) => {
    // --- State ---
    const [collapsed, setCollapsed] = useState(false);
    const [currentIndex, setCurrentIndex] = useState<number>(-1);
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [isLive, setIsLive] = useState<boolean>(true);
    const [isDragging, setIsDragging] = useState(false);
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);

    // --- Refs ---
    const trackRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);
    const userHasManuallySelectedRef = useRef(false);
    const screenshotContainerRef = useRef<HTMLDivElement>(null);
    const terminalContainerRef = useRef<HTMLDivElement>(null);

    const terminalInstanceRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null); // Ref for FitAddon instance
    const isUserScrolledUpRef = useRef<boolean>(false);
    const terminalViewportRef = useRef<HTMLElement | null>(null);
    const prevTerminalPointDataRef = useRef<{
        message_id?: string;
        time: number;
    } | null>(null);

    // --- Memoized Derived Data ---
    const sortedPoints: TimelinePoint[] = useMemo(
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

    const currentPoint: TimelinePoint | null = useMemo(
        () =>
            currentIndex >= 0 && currentIndex < sortedPoints.length
                ? sortedPoints[currentIndex]
                : null,
        [currentIndex, sortedPoints]
    );

    const calculateAndScroll = useCallback(
        (
            container: HTMLDivElement,
            img: HTMLImageElement,
            point: TimelinePoint
        ) => {
            if (!point.cursor) return;
            const containerHeight = container.clientHeight;
            const naturalHeight = point.viewport?.height ?? img.naturalHeight;
            if (naturalHeight === 0) return;
            const displayedHeight = img.clientHeight || containerHeight;
            const scale = displayedHeight / naturalHeight;
            const displayedY = point.cursor.y * scale;
            const targetScrollTop = Math.max(
                0,
                displayedY - containerHeight / 2
            );
            container.scrollTo({
                top: targetScrollTop,
                behavior: 'smooth',
            });
        },
        []
    );

    // --- Effects ---

    // Initialize and manage terminal instance with FitAddon
    useEffect(() => {
        if (mode !== 'console') {
            if (terminalInstanceRef.current) {
                terminalInstanceRef.current.dispose();
                terminalInstanceRef.current = null;
                fitAddonRef.current = null; // FitAddon is disposed with terminal
                prevTerminalPointDataRef.current = null;
            }
            return;
        }

        if (!terminalContainerRef.current || terminalInstanceRef.current) {
            return;
        }

        const term = new Terminal({
            cursorBlink: false,
            cursorInactiveStyle: 'none',
            cursorStyle: 'underline',
            disableStdin: true,
            scrollback: 5000,
            convertEol: true,
            fontSize: 13,
            // Removed 'rows' option, FitAddon will handle it
        });
        const addon = new FitAddon();
        fitAddonRef.current = addon; // Store addon instance

        term.loadAddon(addon); // Load addon into terminal
        term.open(terminalContainerRef.current);
        terminalInstanceRef.current = term;
        prevTerminalPointDataRef.current = null;

        // Initial fit after terminal is open and container is likely sized
        // Using requestAnimationFrame to ensure DOM is ready for measurement
        requestAnimationFrame(() => {
            if (
                fitAddonRef.current &&
                terminalContainerRef.current &&
                terminalContainerRef.current.clientHeight > 0
            ) {
                fitAddonRef.current.fit();
            }
        });

        let cleanupViewportScroll: (() => void) | undefined;
        const attemptToSetupViewport = () => {
            const viewport = terminalContainerRef.current?.querySelector(
                '.xterm-viewport'
            ) as HTMLElement;
            if (viewport) {
                terminalViewportRef.current = viewport;
                const handleScroll = () => {
                    if (terminalViewportRef.current) {
                        const { scrollTop, scrollHeight, clientHeight } =
                            terminalViewportRef.current;
                        isUserScrolledUpRef.current =
                            scrollHeight - scrollTop - clientHeight > 5;
                    }
                };
                viewport.addEventListener('scroll', handleScroll);
                handleScroll();
                return () => {
                    viewport.removeEventListener('scroll', handleScroll);
                    terminalViewportRef.current = null;
                };
            }
            return undefined;
        };

        cleanupViewportScroll = attemptToSetupViewport();
        if (!cleanupViewportScroll) {
            const timeoutId = setTimeout(() => {
                cleanupViewportScroll = attemptToSetupViewport();
            }, 100);
            // Main cleanup for the useEffect
            return () => {
                clearTimeout(timeoutId);
                if (cleanupViewportScroll) cleanupViewportScroll();
                if (terminalInstanceRef.current) {
                    terminalInstanceRef.current.dispose();
                    terminalInstanceRef.current = null;
                }
                fitAddonRef.current = null;
                prevTerminalPointDataRef.current = null;
            };
        }

        // Main cleanup for the useEffect
        return () => {
            if (cleanupViewportScroll) cleanupViewportScroll();
            if (terminalInstanceRef.current) {
                terminalInstanceRef.current.dispose(); // Disposes addons too
                terminalInstanceRef.current = null;
            }
            fitAddonRef.current = null;
            prevTerminalPointDataRef.current = null;
        };
    }, [mode]);

    // Effect to call fit() when terminal becomes visible (un-collapsed) or on window resize
    useEffect(() => {
        const handleResize = () => {
            if (
                mode === 'console' &&
                !collapsed &&
                fitAddonRef.current &&
                terminalInstanceRef.current?.element
            ) {
                // Ensure terminal is attached and visible
                if (
                    terminalContainerRef.current &&
                    terminalContainerRef.current.clientHeight > 0
                ) {
                    fitAddonRef.current.fit();
                }
            }
        };

        if (mode === 'console' && !collapsed) {
            // Call fit when uncollapsing, after a brief delay for layout to settle
            const timerId = setTimeout(handleResize, 50); // 50ms delay
            window.addEventListener('resize', handleResize);
            return () => {
                clearTimeout(timerId);
                window.removeEventListener('resize', handleResize);
            };
        }
        // Clean up resize listener if mode changes or component collapses
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, [mode, collapsed]);

    // Update terminal content
    useEffect(() => {
        const terminal = terminalInstanceRef.current;
        if (mode !== 'console' || !terminal) return;

        if (!sortedPoints.length) {
            if (prevTerminalPointDataRef.current !== null) {
                terminal.reset();
                prevTerminalPointDataRef.current = null;
            }
            return;
        }
        if (!currentPoint) {
            if (prevTerminalPointDataRef.current !== null) {
                terminal.reset();
                prevTerminalPointDataRef.current = null;
            }
            return;
        }

        const { message_id: currentMessageId, time: currentTimeValue } =
            currentPoint;
        const prevData = prevTerminalPointDataRef.current;
        const needsReset =
            !prevData ||
            prevData.message_id !== currentMessageId ||
            (prevData.message_id === currentMessageId &&
                currentTimeValue < prevData.time);

        if (needsReset) {
            terminal.reset();
            const pointsToDisplay = sortedPoints.filter(
                p =>
                    p.message_id === currentMessageId &&
                    p.time <= currentTimeValue
            );
            const fullLog = pointsToDisplay.map(p => p.console || '').join('');
            if (fullLog) terminal.write(fullLog);
            // Check if terminal is scrollable and at the bottom before forcing scroll
            if (
                terminal.buffer.active.baseY +
                    (fitAddonRef.current ? terminal.rows : 40) >=
                terminal.buffer.active.length
            ) {
                terminal.scrollToBottom();
            }
            isUserScrolledUpRef.current = false;
        } else if (
            prevData &&
            prevData.message_id === currentMessageId &&
            currentTimeValue > prevData.time
        ) {
            const newPoints = sortedPoints.filter(
                p =>
                    p.message_id === currentMessageId &&
                    p.time > prevData.time &&
                    p.time <= currentTimeValue
            );
            const newData = newPoints.map(p => p.console || '').join('');
            if (newData) {
                const userWasAtBottom = !isUserScrolledUpRef.current;
                terminal.write(newData);
                if (userWasAtBottom) terminal.scrollToBottom();
            }
        }
        prevTerminalPointDataRef.current = {
            message_id: currentMessageId,
            time: currentTimeValue,
        };
    }, [mode, currentPoint, sortedPoints]);

    // Center cursor in browser mode
    useEffect(() => {
        if (
            mode !== 'browser' ||
            !currentPoint ||
            !currentPoint.screenshot ||
            !screenshotContainerRef.current
        )
            return;
        const container = screenshotContainerRef.current;
        const img = container.querySelector('img');
        if (!img) return;
        const attemptScroll = () => {
            if (img.complete && img.naturalHeight > 0)
                calculateAndScroll(container, img, currentPoint);
        };
        if (img.complete && img.naturalHeight > 0) {
            attemptScroll();
        } else {
            const handleImageLoad = () => {
                attemptScroll();
                img.removeEventListener('load', handleImageLoad);
                img.removeEventListener('error', handleImageError);
            };
            const handleImageError = () => {
                img.removeEventListener('load', handleImageLoad);
                img.removeEventListener('error', handleImageError);
            };
            img.addEventListener('load', handleImageLoad);
            img.addEventListener('error', handleImageError);
            return () => {
                img.removeEventListener('load', handleImageLoad);
                img.removeEventListener('error', handleImageError);
            };
        }
    }, [currentPoint, mode, calculateAndScroll]);

    // Live follow logic
    useEffect(() => {
        if (sortedPoints.length === 0) {
            setCurrentTime(0);
            setCurrentIndex(-1);
            setIsLive(true);
            userHasManuallySelectedRef.current = false;
            if (onTimeChange) onTimeChange(null);
            return;
        }
        const newLatestTime = sortedPoints[sortedPoints.length - 1].time;
        if (isLive && !userHasManuallySelectedRef.current) {
            // Only auto-follow the latest point if the user hasn't manually selected a position
            const newIndex = sortedPoints.length - 1;
            if (currentTime !== newLatestTime || currentIndex !== newIndex) {
                setCurrentTime(newLatestTime);
                setCurrentIndex(newIndex);
                if (onTimeChange && sortedPoints[newIndex])
                    onTimeChange(sortedPoints[newIndex]);
            }
        } else {
            // User has either explicitly set isLive=false or manually positioned the timeline
            let foundIndex = -1;
            let minDiff = Infinity;
            sortedPoints.forEach((p, i) => {
                const diff = Math.abs(p.time - currentTime);
                if (diff < minDiff) {
                    minDiff = diff;
                    foundIndex = i;
                } else if (
                    diff === minDiff &&
                    p.time > (sortedPoints[foundIndex]?.time ?? -Infinity)
                ) {
                    foundIndex = i;
                }
            });
            if (foundIndex !== -1) {
                const closestPoint = sortedPoints[foundIndex];
                if (
                    currentTime !== closestPoint.time ||
                    currentIndex !== foundIndex
                ) {
                    setCurrentTime(closestPoint.time);
                    setCurrentIndex(foundIndex);
                }
                // Don't auto-update isLive state if user has manually positioned the timeline
                if (!userHasManuallySelectedRef.current) {
                    setIsLive(closestPoint.time === newLatestTime);
                }
            } else {
                // This is a fallback that should rarely occur - only if we can't find the current time
                // in the sorted points array, which might happen during data updates
                if (!userHasManuallySelectedRef.current) {
                    setCurrentTime(newLatestTime);
                    setCurrentIndex(sortedPoints.length - 1);
                    setIsLive(true);
                    if (onTimeChange && sortedPoints[sortedPoints.length - 1])
                        onTimeChange(sortedPoints[sortedPoints.length - 1]);
                }
            }
        }
    }, [sortedPoints, isLive, currentTime, currentIndex, onTimeChange]);

    // Set initial time
    useEffect(() => {
        // Skip if the user has manually positioned the timeline or there are no points
        if (userHasManuallySelectedRef.current || sortedPoints.length === 0)
            return;

        let targetTime: number;
        let targetIndex = -1;
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
            targetIndex = closestIndex;
            targetTime = sortedPoints[targetIndex]?.time ?? 0;
        } else {
            targetIndex = sortedPoints.length - 1;
            targetTime = sortedPoints[targetIndex]?.time ?? 0;
        }
        setCurrentTime(targetTime);
        setCurrentIndex(targetIndex);
        setIsLive(targetTime === endTime);
        if (onTimeChange && targetIndex !== -1 && sortedPoints[targetIndex]) {
            onTimeChange(sortedPoints[targetIndex]);
        }
    }, [initialTime, points, onTimeChange, endTime, sortedPoints]); // endTime added as it's used for setIsLive

    // --- Slider Calculation Helpers ---
    const timeToPercentage = useCallback(
        (t: number): number => {
            if (duration <= 0) return t >= endTime ? 100 : 0;
            const relativeTime = t - startTime;
            const percentage = (relativeTime / duration) * 100;
            return Math.max(0, Math.min(percentage, 100));
        },
        [startTime, duration, endTime]
    );

    const findClosestPointIndex = useCallback(
        (targetTime: number): number => {
            if (sortedPoints.length === 0) return -1;
            if (sortedPoints.length === 1) return 0;
            let closestIndex = 0;
            let minDifference = Infinity;
            sortedPoints.forEach((point, index) => {
                const difference = Math.abs(point.time - targetTime);
                if (difference < minDifference) {
                    minDifference = difference;
                    closestIndex = index;
                } else if (
                    difference === minDifference &&
                    point.time > (sortedPoints[closestIndex]?.time ?? -Infinity)
                ) {
                    closestIndex = index;
                }
            });
            return closestIndex;
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
            const closestIndex = findClosestPointIndex(calculatedTime);
            return closestIndex !== -1
                ? sortedPoints[closestIndex].time
                : currentTime;
        },
        [startTime, duration, sortedPoints, currentTime, findClosestPointIndex]
    );

    // --- Event Handlers ---
    const handleGlobalMouseMove = useCallback(
        (event: MouseEvent | TouchEvent) => {
            if (!isDraggingRef.current) return;
            if (event.type === 'touchmove' && event.cancelable)
                event.preventDefault();
            const clientX =
                'touches' in event ? event.touches[0].clientX : event.clientX;
            const newTime = getTimeFromClientX(clientX);
            if (currentTime !== newTime) {
                const newIndex = sortedPoints.findIndex(
                    p => p.time === newTime
                );
                if (newIndex !== -1) {
                    setCurrentTime(newTime);
                    setCurrentIndex(newIndex);
                    setIsLive(newTime === endTime);
                    if (onTimeChange && sortedPoints[newIndex])
                        onTimeChange(sortedPoints[newIndex]);
                }
            }
        },
        [getTimeFromClientX, sortedPoints, endTime, onTimeChange, currentTime]
    );

    const handleInteractionEnd = useCallback(() => {
        if (isDraggingRef.current) {
            isDraggingRef.current = false;
            setIsDragging(false);
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('touchmove', handleGlobalMouseMove);
        }
    }, [handleGlobalMouseMove]);

    const handleInteractionStart = useCallback(
        (clientX: number) => {
            if (sortedPoints.length === 0) return;
            isDraggingRef.current = true;
            setIsDragging(true);
            document.body.style.userSelect = 'none';

            // User is manually interacting with the timeline
            userHasManuallySelectedRef.current = true;

            const newTime = getTimeFromClientX(clientX);
            if (newTime !== currentTime) {
                const newIndex = sortedPoints.findIndex(
                    p => p.time === newTime
                );
                if (newIndex !== -1) {
                    setCurrentTime(newTime);
                    setCurrentIndex(newIndex);
                    setIsLive(newTime === endTime);
                    if (onTimeChange && sortedPoints[newIndex])
                        onTimeChange(sortedPoints[newIndex]);
                }
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
                if (
                    sortedPoints[i].time < currentTime ||
                    (i === 0 &&
                        hoverTime < (sortedPoints[0]?.time ?? -Infinity))
                ) {
                    if (sortedPoints[i].thumbnail) targetHoverIndex = i;
                }
                break;
            }
        }
        if (
            targetHoverIndex === null &&
            hoverTime < (sortedPoints[0]?.time ?? startTime) &&
            sortedPoints.length > 0 &&
            sortedPoints[0].thumbnail &&
            (sortedPoints[0]?.time ?? -Infinity) < currentTime
        ) {
            targetHoverIndex = 0;
        }
        setHoverIndex(targetHoverIndex);
    };

    const handleTrackMouseLeave = () => setHoverIndex(null);
    const toggleCollapse = () => (collapsible ? setCollapsed(c => !c) : null);

    // --- Render Calculations ---
    const progressPercentage = timeToPercentage(currentTime);

    function renderScreenshot() {
        return (
            <div
                ref={screenshotContainerRef}
                className="display-container position-relative border-start border-end bg-white"
                style={{ overflowY: 'auto' }}
            >
                {currentPoint && currentPoint.screenshot ? (
                    <img
                        key={
                            currentPoint.time + (currentPoint.screenshot || '')
                        }
                        src={currentPoint.screenshot}
                        className="img-fluid w-100 d-block"
                        alt={`Screenshot at ${formatTime(currentPoint.time)} for ${currentPoint.url || 'current view'}`}
                        onError={e => {
                            console.error(
                                'Failed to load screenshot:',
                                currentPoint.screenshot
                            );
                            (e.target as HTMLImageElement).src =
                                `https://placehold.co/600x400/CCCCCC/4F4F4F?text=Error+Loading+Image`;
                        }}
                    />
                ) : (
                    <div
                        className="py-3 text-center text-muted small"
                        style={{
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {points.length > 0
                            ? 'Loading screenshot...'
                            : 'No timeline data'}
                    </div>
                )}
            </div>
        );
    }

    function renderConsole() {
        return (
            <div
                ref={terminalContainerRef}
                className="display-container position-relative border-start border-end px-3"
            >
                {/* Terminal is mounted here by its useEffect. CSS needed for height.
                e.g., .timeline-player-console .display-container { height: 300px; background-color: #1e1e1e; } */}
            </div>
        );
    }

    // --- JSX ---
    return (
        <div
            className={`timeline-player shadow-sm ${mode === 'browser' ? 'timeline-player-browser' : 'timeline-player-console'} ${className || ''}`}
            style={style}
        >
            <div
                className="url-bar d-flex align-items-center py-2 px-3 text-center bg-light border rounded-top"
                onClick={toggleCollapse}
                style={{ cursor: 'pointer' }}
            >
                {mode === 'browser' && (
                    <div
                        className="url-text mx-auto text-truncate small font-monospace text-start flex-grow-1"
                        title={currentPoint?.url ?? ''}
                    >
                        {currentPoint?.url || '…'}
                    </div>
                )}
                {mode === 'console' && (
                    <div className="url-text mx-auto text-truncate small font-monospace text-start flex-grow-1">
                        Console Output{' '}
                        {model || currentPoint?.message_id
                            ? `(${model || currentPoint.message_id})`
                            : ''}
                    </div>
                )}
                {collapsible && (
                    <button
                        type="button"
                        className="btn btn-sm p-0 ms-2 border-0 text-secondary"
                        aria-label={collapsed ? 'Expand' : 'Collapse'}
                        title={collapsed ? 'Expand' : 'Collapse'}
                        aria-expanded={!collapsed}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            width="18"
                            height="18"
                            fill="currentColor"
                            className="tsp-collapse-icon"
                            style={{
                                transition: 'transform 0.2s ease-in-out',
                                transform: collapsed
                                    ? 'rotate(-90deg)'
                                    : 'rotate(0deg)',
                            }}
                        >
                            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                        </svg>
                    </button>
                )}
            </div>

            {!collapsed && (
                <>
                    {mode === 'browser' ? renderScreenshot() : renderConsole()}
                    <div className="control-bar d-flex align-items-center p-2 bg-light border rounded-bottom">
                        {sortedPoints.length > 0 ? (
                            <div className="d-flex flex-column w-100">
                                <div className="px-1">
                                    <div
                                        ref={trackRef}
                                        className="tsp-track-container"
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
                                        style={{
                                            cursor: 'pointer',
                                            padding: '8px 0',
                                        }}
                                    >
                                        <div className="tsp-track">
                                            <div
                                                className="tsp-track-bar-active"
                                                style={{
                                                    width: `${progressPercentage}%`,
                                                }}
                                            />
                                        </div>
                                        <div
                                            className="tsp-knob-container"
                                            style={{
                                                left: `${progressPercentage}%`,
                                            }}
                                        >
                                            <div
                                                className={`tsp-knob ${isDragging ? 'tsp-knob--dragging' : ''}`}
                                                role="slider"
                                                aria-valuemin={startTime}
                                                aria-valuemax={endTime}
                                                aria-valuenow={currentTime}
                                                aria-valuetext={formatTime(
                                                    currentTime - startTime
                                                )}
                                                tabIndex={0}
                                                onKeyDown={e => {
                                                    let newIndex = currentIndex;
                                                    if (e.key === 'ArrowLeft')
                                                        newIndex = Math.max(
                                                            0,
                                                            currentIndex - 1
                                                        );
                                                    else if (
                                                        e.key === 'ArrowRight'
                                                    )
                                                        newIndex = Math.min(
                                                            sortedPoints.length -
                                                                1,
                                                            currentIndex + 1
                                                        );

                                                    if (
                                                        newIndex !==
                                                            currentIndex &&
                                                        sortedPoints[newIndex]
                                                    ) {
                                                        const newPoint =
                                                            sortedPoints[
                                                                newIndex
                                                            ];
                                                        setCurrentTime(
                                                            newPoint.time
                                                        );
                                                        setCurrentIndex(
                                                            newIndex
                                                        );
                                                        setIsLive(
                                                            newPoint.time ===
                                                                endTime
                                                        );
                                                        if (onTimeChange)
                                                            onTimeChange(
                                                                newPoint
                                                            );
                                                    }
                                                }}
                                            />
                                        </div>
                                        {hoverIndex !== null &&
                                            sortedPoints[hoverIndex]
                                                ?.thumbnail && (
                                                <div
                                                    className="tsp-thumbnail-preview"
                                                    style={{
                                                        left: `${timeToPercentage(sortedPoints[hoverIndex].time)}%`,
                                                    }}
                                                >
                                                    <img
                                                        src={
                                                            sortedPoints[
                                                                hoverIndex
                                                            ].thumbnail
                                                        }
                                                        className="tsp-thumbnail-image"
                                                        alt="Timeline preview"
                                                        onError={e => {
                                                            (
                                                                e.target as HTMLImageElement
                                                            ).style.display =
                                                                'none';
                                                        }}
                                                    />
                                                    <div className="tsp-thumbnail-time">
                                                        {formatTime(
                                                            sortedPoints[
                                                                hoverIndex
                                                            ].time - startTime
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                    </div>
                                </div>
                                <div className="tsp-labels d-flex justify-content-between small mt-1 px-1">
                                    <span>
                                        {formatTime(currentTime - startTime)}
                                    </span>
                                    <span
                                        className={
                                            isLive ? 'tsp-labels-live' : ''
                                        }
                                    >
                                        {isLive
                                            ? 'LIVE'
                                            : `-${formatTime(endTime - currentTime)}`}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="text-muted small w-100 text-center py-2">
                                No time data available
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default TimelinePlayer;
