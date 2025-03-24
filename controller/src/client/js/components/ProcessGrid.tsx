import * as React from 'react';
import {useState, useEffect, useRef} from 'react';
import ProcessBox from './ProcessBox';
import {useSocket, ProcessData} from '../context/SocketContext';

const ProcessGrid: React.FC = () => {
    const {processes} = useSocket();
    const [focusedProcess, setFocusedProcess] = useState<string | null>(null);
    const [zoomLevel, setZoomLevel] = useState<number>(1);
    const [translateX, setTranslateX] = useState<number>(0);
    const [translateY, setTranslateY] = useState<number>(0);
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [startDragX, setStartDragX] = useState<number>(0);
    const [startDragY, setStartDragY] = useState<number>(0);
    // Used for tracking mouse movement
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [wasDragged, setWasDragged] = useState<boolean>(false);
    const [containerSize, setContainerSize] = useState({width: 0, height: 0});

    const containerRef = useRef<HTMLDivElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const dotBackgroundRef = useRef<HTMLDivElement>(null);
    const gap = 40; // Gap between process boxes

    // Calculate the best grid layout based on number of processes
    const getGridLayout = () => {
        const count = processes.size;

        if (count === 0) return {boxesPerRow: 0, rows: 0};

        // Special case for 2 processes - force side by side layout
        if (count === 2) {
            // Check if one is a parent of the other
            const processArray = Array.from(processes.entries());
            if (processArray[0][1].childProcessIds.includes(processArray[1][0]) ||
                processArray[1][1].childProcessIds.includes(processArray[0][0])) {
                // Parent-child relationship, stack them
                return {boxesPerRow: 1, rows: 2};
            } else {
                // No parent-child relationship, side by side
                return {boxesPerRow: 2, rows: 1};
            }
        }

        // Group parent processes and their children
        const parentProcesses = new Map();
        const subAgents = new Map();

        // First identify parent processes and standalone processes
         
        for (const [id, process] of processes.entries()) {
            if (process.isSubAgent) {
                subAgents.set(id, process);
            } else {
                parentProcesses.set(id, process);
            }
        }

        // Determine number of "main" processes (parent + standalone)
        const mainProcessCount = parentProcesses.size;

        // For a small number of parent processes, arrange them in a single row
        if (mainProcessCount <= 3) {
            return {boxesPerRow: Math.max(mainProcessCount, 1), rows: 1};
        }

        // Otherwise arrange in a roughly square grid
        const boxesPerRow = Math.ceil(Math.sqrt(mainProcessCount));
        const rows = Math.ceil(mainProcessCount / boxesPerRow);

        return {boxesPerRow, rows};
    };

    // Calculate max dimensions for process boxes
    const getBoxDimensions = () => {
        if (!containerRef.current) return {width: 1000, height: 1000};

        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;

        const maxWidth = 1000;
        const maxHeight = Math.min(1500, Math.max(500, Math.round(maxWidth * (containerHeight / containerWidth))));
        const boxWidth = Math.min(containerWidth, maxWidth);
        const boxHeight = Math.min(containerHeight, maxHeight);

        return {width: boxWidth, height: boxHeight};
    };

    // Update container size on window resize
    useEffect(() => {
        const updateContainerSize = () => {
            if (containerRef.current) {
                setContainerSize({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight
                });
            }
        };

        updateContainerSize();
        window.addEventListener('resize', updateContainerSize);

        return () => {
            window.removeEventListener('resize', updateContainerSize);
        };
    }, []);

    // Auto-zoom to fit all processes when processes change
    useEffect(() => {
        autoZoomToFit();
    }, [processes, containerSize]);

    // Update transform when zoom or position changes
    useEffect(() => {
        updateTransform();
    }, [zoomLevel, translateX, translateY]);

    // Set up mouse events for dragging
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;

            // Consider it a drag if moved more than 5px in any direction
            const moveX = Math.abs(e.clientX - (startDragX + translateX));
            const moveY = Math.abs(e.clientY - (startDragY + translateY));

            if (moveX > 5 || moveY > 5) {
                setWasDragged(true);
            }

            setTranslateX(e.clientX - startDragX);
            setTranslateY(e.clientY - startDragY);
        };

        const handleMouseUp = () => {
            setIsDragging(false);

            // Clear the drag flag after a short delay
            setTimeout(() => {
                setWasDragged(false);
            }, 100);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, startDragX, startDragY, translateX, translateY]);

    // Handle mouse down for dragging
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button === 0) { // Left mouse button
            setIsDragging(true);
            setWasDragged(false);
            setStartDragX(e.clientX - translateX);
            setStartDragY(e.clientY - translateY);

            if (containerRef.current) {
                containerRef.current.style.cursor = 'grabbing';
            }
        }
    };

    // Handle wheel for zooming
    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        // Check if modifier key is pressed (Command on Mac, Ctrl on Windows/Linux)
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const modifierKeyPressed = isMac ? e.metaKey : e.ctrlKey;

        if (modifierKeyPressed) {
            e.preventDefault();

            // Normalize the delta across different browsers/devices
            const normalizedDelta = Math.abs(e.deltaY) > 100
                ? e.deltaY / 100 // For browsers that use pixels
                : e.deltaY;      // For browsers that use lines

            const delta = -Math.sign(normalizedDelta) * 0.1;

            // Apply the delta with a smoother curve based on current zoom level
            // Logarithmic scaling to make zoom feel consistent at all levels
            let zoomFactor = delta * (0.1 + 0.05 * Math.log(zoomLevel + 0.5));

            // Apply stronger dampening when zoomed out
            zoomFactor *= zoomLevel;

            const oldZoom = zoomLevel;
            const newZoom = Math.min(Math.max(0.6, zoomLevel + zoomFactor), 2.8); // Limit zoom between 0.1x and 3x

            // Adjust translateX and translateY to zoom toward mouse position
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                setZoomLevel(newZoom);
                setTranslateX(mouseX - (mouseX - translateX) * (newZoom / oldZoom));
                setTranslateY(mouseY - (mouseY - translateY) * (newZoom / oldZoom));
            }
        }
    };

    // Update transform CSS
    const updateTransform = () => {
        if (wrapperRef.current && dotBackgroundRef.current) {
            const transform = `translate(${translateX}px, ${translateY}px) scale(${zoomLevel})`;

            wrapperRef.current.style.transform = transform;
            dotBackgroundRef.current.style.transform = transform;
        }
    };

    // Automatically zoom to fit all processes
    const autoZoomToFit = () => {
        if (processes.size === 0 || !containerRef.current) return;

        // Get grid layout
        const {boxesPerRow, rows} = getGridLayout();
        const {width: boxWidth, height: boxHeight} = getBoxDimensions();

        // Calculate total grid size
        const wrapperWidth = boxesPerRow * (boxWidth + gap) - gap;
        const wrapperHeight = rows * (boxHeight + gap) - gap;

        // Get viewport dimensions
        const viewportWidth = containerRef.current.clientWidth;
        const header = document.getElementById('main-header');
        const headerHeight = header ? header.offsetHeight : 0;
        const viewportHeight = containerRef.current.clientHeight - headerHeight;

        // Calculate zoom level needed to fit the content
        const zoomX = ((viewportWidth - (gap * 2)) / wrapperWidth);
        const zoomY = ((viewportHeight - (gap * 2)) / wrapperHeight);

        // Use the smaller of the two zoom levels to ensure everything fits
        let newZoom = Math.min(zoomX, zoomY);

        // Apply final limits to avoid extreme zooming
        newZoom = Math.min(Math.max(newZoom, 0.1), 1);

        // Set the new zoom level
        setZoomLevel(newZoom);

        // Calculate position to center the content
        setTranslateX((viewportWidth - wrapperWidth * newZoom) / 2);

        // Add headerHeight to the Y translation to position content below the header
        setTranslateY(headerHeight + (viewportHeight - wrapperHeight * newZoom) / 2);
    };

    // Focus on a specific process
    const focusOnProcess = (processId: string) => {
        if (!containerRef.current || !wrapperRef.current) return;

        // Get process element and dimensions
        const processElements = Array.from(processes.entries());
        const processIndex = processElements.findIndex(([id]) => id === processId);
        if (processIndex === -1) return;

        setFocusedProcess(processId);

        // Get grid layout and box dimensions
        const {boxesPerRow} = getGridLayout();
        const {width: boxWidth, height: boxHeight} = getBoxDimensions();

        // Calculate position of the process box in the grid
        const row = Math.floor(processIndex / boxesPerRow);
        const col = processIndex % boxesPerRow;
        const boxLeft = col * (boxWidth + gap);
        const boxTop = row * (boxHeight + gap);

        // Get viewport dimensions
        const viewportWidth = containerRef.current.clientWidth;
        const header = document.getElementById('main-header');
        const headerHeight = header ? header.offsetHeight : 0;
        const viewportHeight = containerRef.current.clientHeight - headerHeight;

        // Set zoom to 100%
        setZoomLevel(1);

        // Center the box in the viewport, accounting for header
        setTranslateX((viewportWidth - boxWidth) / 2 - boxLeft);
        setTranslateY(headerHeight + (viewportHeight - boxHeight) / 2 - boxTop);

        // Apply smooth transition
        if (wrapperRef.current && dotBackgroundRef.current) {
            wrapperRef.current.style.transition = 'transform 0.5s ease-out';
            dotBackgroundRef.current.style.transition = 'transform 0.5s ease-out';

            // Reset the transition after it completes
            setTimeout(() => {
                if (wrapperRef.current && dotBackgroundRef.current) {
                    wrapperRef.current.style.transition = 'transform 0.1s ease-out';
                    dotBackgroundRef.current.style.transition = 'transform 0.1s ease-out';
                }
            }, 500);
        }
    };

    // Reset zoom and position
    const resetZoom = () => {
        if (processes.size === 1) {
            // If only one process, focus on it
            const processId = processes.keys().next().value;
            focusOnProcess(processId);
        } else {
            // Otherwise fit all processes
            autoZoomToFit();
        }
    };

    // Render the process boxes
    const renderProcessBoxes = () => {
        if (processes.size === 0) return null;

        // Get grid layout and box dimensions
        const {boxesPerRow} = getGridLayout();
        const {width: boxWidth, height: boxHeight} = getBoxDimensions();
        const processElements: React.ReactNode[] = [];
        const connectionElements: React.ReactNode[] = [];

        // Organize processes by relationship: main processes and sub-agents
        const mainProcesses: [string, ProcessData][] = [];
        const subAgentProcesses: Map<string, [string, ProcessData][]> = new Map();

        // Sort processes into main processes and sub-agents grouped by parent
            Array.from(processes.entries()).forEach(entry => {
                    const [, process] = entry;

            if (process.isSubAgent && process.parentId) {
                // Group sub-agents by parent ID
                if (!subAgentProcesses.has(process.parentId)) {
                    subAgentProcesses.set(process.parentId, []);
                }
                subAgentProcesses.get(process.parentId)?.push(entry);
            } else {
                // This is a main process (not a sub-agent)
                mainProcesses.push(entry);
            }
        });

        // Calculate positions for main processes in a grid
        mainProcesses.forEach((entry, index) => {
             
            const [id, process] = entry;

            // Calculate position in grid for main processes
            const row = Math.floor(index / boxesPerRow);
            const col = index % boxesPerRow;

            // Calculate position coordinates for the main process
            const left = col * (boxWidth + gap);
            const top = row * (boxHeight + gap);

            // Store the position for this process (for future reference)
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const position = {left, top, width: boxWidth, height: boxHeight};

            // Create style for position and size
            const style = {
                position: 'absolute' as const,
                width: `${boxWidth}px`,
                height: `${boxHeight}px`,
                left: `${left}px`,
                top: `${top}px`,
                opacity: process.status === 'terminated' ? '0.2' : '1',
                transition: 'opacity 0.3s ease, transform 0.3s ease'
            };

            // Add the main process box
            processElements.push(
                <div key={id} style={style} className="process-wrapper">
                    <ProcessBox
                        id={id}
                        command={process.command}
                        status={process.status}
                        colors={process.colors}
                        logs={process.logs}
                        focused={focusedProcess === id}
                        onFocus={focusOnProcess}
                    />
                </div>
            );

            // Position sub-agents for this parent process
            const childProcesses = subAgentProcesses.get(id) || [];

            if (childProcesses.length > 0) {
                // Position child processes in a cluster around the parent
                childProcesses.forEach((childEntry, childIndex) => {
                    const [childId, childProcess] = childEntry;

                    // Calculate offsets for child processes:
                    // Place them in a circle or semi-circle around the parent
                    const childCount = childProcesses.length;

                    // Calculate angle based on index (distribute evenly around the bottom of the parent)
                    const startAngle = -60; // Start from bottom-left
                    const endAngle = 240; // End at bottom-right
                    const angleRange = endAngle - startAngle;
                    const angle = startAngle + (angleRange / (childCount + 1)) * (childIndex + 1);
                    const radian = (angle * Math.PI) / 180;

                    // radius for placement (based on parent box dimensions)
                    const radius = Math.max(boxWidth, boxHeight) * 0.8;

                    // Calculate position based on angle and radius
                    // Center of the parent box
                    const centerX = left + (boxWidth / 2);
                    const centerY = top + (boxHeight / 2);

                    // Calculate position for child
                    const childLeft = centerX - (boxWidth / 2) + (radius * Math.cos(radian));
                    const childTop = centerY - (boxHeight / 2) + (radius * Math.sin(radian));

                    // Create style for the child process
                    const childStyle = {
                        position: 'absolute' as const,
                        width: `${boxWidth}px`,
                        height: `${boxHeight}px`,
                        left: `${childLeft}px`,
                        top: `${childTop}px`,
                        opacity: childProcess.status === 'terminated' ? '0.2' : '1',
                        transition: 'opacity 0.3s ease, transform 0.3s ease'
                    };

                    // Add the child process box
                    processElements.push(
                        <div key={childId} style={childStyle} className="process-wrapper">
                            <ProcessBox
                                id={childId}
                                command={childProcess.command}
                                status={childProcess.status}
                                colors={childProcess.colors}
                                logs={childProcess.logs}
                                focused={focusedProcess === childId}
                                onFocus={focusOnProcess}
                            />
                        </div>
                    );

                    // Create connection line between parent and child
                    // Start from bottom of parent and go to top of child
                    const connectionStyle = {
                        position: 'absolute' as const,
                        left: `${centerX}px`,
                        top: `${centerY}px`,
                        width: '2px',
                        height: `${Math.sqrt(
                            Math.pow(childLeft - left, 2) +
                            Math.pow(childTop - top, 2)
                        )}px`,
                        transform: `rotate(${angle}deg)`,
                        transformOrigin: 'top left',
                        backgroundColor: 'rgba(44, 161, 229, 0.5)'
                    };

                    connectionElements.push(
                        <div
                            key={`connection-${id}-${childId}`}
                            className="process-connection"
                            style={connectionStyle}
                        />
                    );
                });
            }
        });

        return [...connectionElements, ...processElements];
    };

    // Calculate total width and height of the grid
    const getWrapperStyles = () => {
        if (processes.size === 0) {
            return {
                minWidth: '100vw',
                minHeight: '100vh'
            };
        }

        // Find the min/max coordinates of all process boxes including sub-agents
        let minLeft = Number.MAX_SAFE_INTEGER;
        let minTop = Number.MAX_SAFE_INTEGER;
        let maxRight = 0;
        let maxBottom = 0;

        const {boxesPerRow} = getGridLayout();
        const {width: boxWidth, height: boxHeight} = getBoxDimensions();

        // Organize processes by relationship: main processes and sub-agents
        const mainProcesses: [string, ProcessData][] = [];
        const subAgentProcesses: Map<string, [string, ProcessData][]> = new Map();

        // Sort processes into main processes and sub-agents grouped by parent
            Array.from(processes.entries()).forEach(entry => {
                    const [, process] = entry;

            if (process.isSubAgent && process.parentId) {
                // Group sub-agents by parent ID
                if (!subAgentProcesses.has(process.parentId)) {
                    subAgentProcesses.set(process.parentId, []);
                }
                subAgentProcesses.get(process.parentId)?.push(entry);
            } else {
                // This is a main process (not a sub-agent)
                mainProcesses.push(entry);
            }
        });

        // Calculate positions for main processes in a grid
        mainProcesses.forEach((entry, index) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const [id, process] = entry;

            // Calculate position in grid
            const row = Math.floor(index / boxesPerRow);
            const col = index % boxesPerRow;

            // Calculate position coordinates
            const left = col * (boxWidth + gap);
            const top = row * (boxHeight + gap);
            const right = left + boxWidth;
            const bottom = top + boxHeight;

            // Update min/max coordinates
            minLeft = Math.min(minLeft, left);
            minTop = Math.min(minTop, top);
            maxRight = Math.max(maxRight, right);
            maxBottom = Math.max(maxBottom, bottom);

            // Also check sub-agents for this parent
            const childProcesses = subAgentProcesses.get(id) || [];

            if (childProcesses.length > 0) {
                childProcesses.forEach((childEntry, childIndex) => {
                    const childCount = childProcesses.length;

                    // Calculate angle based on index
                    const startAngle = -60;
                    const endAngle = 240;
                    const angleRange = endAngle - startAngle;
                    const angle = startAngle + (angleRange / (childCount + 1)) * (childIndex + 1);
                    const radian = (angle * Math.PI) / 180;

                    // Radius for placement
                    const radius = Math.max(boxWidth, boxHeight) * 0.8;

                    // Center of the parent box
                    const centerX = left + (boxWidth / 2);
                    const centerY = top + (boxHeight / 2);

                    // Calculate position for child
                    const childLeft = centerX - (boxWidth / 2) + (radius * Math.cos(radian));
                    const childTop = centerY - (boxHeight / 2) + (radius * Math.sin(radian));
                    const childRight = childLeft + boxWidth;
                    const childBottom = childTop + boxHeight;

                    // Update min/max coordinates
                    minLeft = Math.min(minLeft, childLeft);
                    minTop = Math.min(minTop, childTop);
                    maxRight = Math.max(maxRight, childRight);
                    maxBottom = Math.max(maxBottom, childBottom);
                });
            }
        });

        // Calculate the total width and height needed
        const totalWidth = maxRight - minLeft + gap;
        const totalHeight = maxBottom - minTop + gap;

        return {
            width: `${Math.max(totalWidth, window.innerWidth)}px`,
            height: `${Math.max(totalHeight, window.innerHeight)}px`,
            minWidth: '100vw',
            minHeight: '100vh'
        };
    };

    return <>
        {(zoomLevel !== 1 || translateX !== 0 || translateY !== 0) && (
            <button
                className="reset-zoom-button btn btn-sm btn-light"
                onClick={resetZoom}
                style={{display: 'block', pointerEvents: 'auto'}} // Make sure it's visible and clickable
            >
                Show All
            </button>
        )}
        <div
            className="infinite-canvas-container"
            ref={(el) => {
                containerRef.current = el;
                if (el) {
                    // Only prevent default for wheel events with modifier key pressed
                    el.addEventListener('wheel', (e) => {
                        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
                        const modifierKeyPressed = isMac ? e.metaKey : e.ctrlKey;
                        if (modifierKeyPressed) {
                            e.preventDefault();
                        }
                    }, {passive: false});
                }
            }}
            onMouseDown={handleMouseDown}
            onWheel={handleWheel}
            style={{cursor: isDragging ? 'grabbing' : 'grab'}}
        >
            <div className="dot-background" ref={dotBackgroundRef}></div>

            <div
                className="process-container-wrapper"
                ref={wrapperRef}
                style={getWrapperStyles()}
            >
                {renderProcessBoxes()}
            </div>

            <div className="zoom-hint" style={{opacity: processes.size > 0 ? '1' : '0'}}>
                <div><span className="zoom-hint-icon">👆</span> Click to focus on a process</div>
                <div><span className="zoom-hint-icon">👋</span> Drag to pan view</div>
                <div>
                    <span className="zoom-hint-icon">🔍</span>
                    {navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘ Cmd' : 'Ctrl'} + Scroll to zoom
                </div>
            </div>
        </div>
    </>;
};

export default ProcessGrid;
