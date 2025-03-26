/**
 * ProcessGrid Component
 * Renders the main grid view of all processes with zooming and panning capabilities
 */
import * as React from 'react';
import {useState, useEffect, useRef} from 'react';
import ProcessBox from './ProcessBox';
import AgentBox from './AgentBox';
import {useSocket} from '../context/SocketContext';
import {BoxPosition} from '@types';
import {
    calculateBoxPositions,
    calculateBoundingBox,
    calculateZoomToFit,
} from './utils/GridUtils';

/**
 * ProcessGrid is responsible for:
 * - Layout of process boxes in a responsive grid
 * - Zoom and pan navigation
 * - Displaying connections between main processes and sub-agents
 */
const ProcessGrid: React.FC = () => {
    const {processes} = useSocket();
    const [focusedProcess, setFocusedProcess] = useState<string | null>(null);
    const [zoomLevel, setZoomLevel] = useState<number>(1);
    const [translateX, setTranslateX] = useState<number>(0);
    const [translateY, setTranslateY] = useState<number>(0);
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [startDragX, setStartDragX] = useState<number>(0);
    const [startDragY, setStartDragY] = useState<number>(0);
    const [, setWasDragged] = useState<boolean>(false);
    const [containerSize, setContainerSize] = useState({width: 0, height: 0});
    const [boxPositions, setBoxPositions] = useState<Map<string, BoxPosition>>(new Map());

    // Refs for DOM elements
    const containerRef = useRef<HTMLDivElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const dotBackgroundRef = useRef<HTMLDivElement>(null);

    // Constants for layout
    const agentBoxScale = 0.25; // Agent boxes are 1/4 size of process boxes
    const gap = 40; // Gap between process boxes

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

    // Update the positions whenever processes change
    useEffect(() => {
        if (!containerRef.current || containerSize.width === 0) return;

        const newPositions = calculateBoxPositions(
            processes,
            containerSize.width,
            containerSize.height,
            boxPositions
        );

        setBoxPositions(newPositions);
    }, [processes, containerSize]);

    // Auto-zoom to fit all processes when processes change
    useEffect(() => {
        // Don't auto-zoom immediately to avoid rapid changes
        const timer = setTimeout(() => {
            autoZoomToFit();
        }, 100);

        return () => clearTimeout(timer);
    }, [boxPositions.size, containerSize]);

    // Update transform when zoom or position changes
    useEffect(() => {
        updateTransform();
    }, [zoomLevel, translateX, translateY]);

    // Set up mouse events for dragging
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;

            // Consider it a drag if moved more than 5px
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

            // Clear drag flag after a short delay
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
    const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button === 0) { // Left mouse button
            if (containerRef.current) {
                containerRef.current.style.cursor = 'auto';
            }
        }
    };

    // Handle wheel event for zooming
    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        // Check if modifier key is pressed (Command/Ctrl)
        const isMac = navigator.platform?.toUpperCase().indexOf('MAC') >= 0;
        const modifierKeyPressed = isMac ? e.metaKey : e.ctrlKey;

        if (modifierKeyPressed) {
            // Normalize delta across browsers
            const normalizedDelta = Math.abs(e.deltaY) > 100
                ? e.deltaY / 100 // For pixel-based browsers
                : e.deltaY;      // For line-based browsers

            const delta = -Math.sign(normalizedDelta) * 0.1;

            // Apply smoother zoom curve based on current level
            let zoomFactor = delta * (0.1 + 0.05 * Math.log(zoomLevel + 0.5));

            // Apply stronger dampening when zoomed out
            zoomFactor *= zoomLevel;

            const oldZoom = zoomLevel;
            const newZoom = Math.min(Math.max(0.2, zoomLevel + zoomFactor), 2); // Limit zoom

            // Adjust position to zoom toward mouse position
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

    // Apply smooth transition to transform
    const applyTransition = (duration: number = 500) => {
        if (wrapperRef.current && dotBackgroundRef.current) {
            wrapperRef.current.style.transition = `transform ${duration}ms ease-out`;
            dotBackgroundRef.current.style.transition = `transform ${duration}ms ease-out`;

            // Reset transition after animation completes
            setTimeout(() => {
                if (wrapperRef.current && dotBackgroundRef.current) {
                    wrapperRef.current.style.transition = 'transform 0.1s ease-out';
                    dotBackgroundRef.current.style.transition = 'transform 0.1s ease-out';
                }
            }, duration);
        }
    };

    // Automatically zoom to fit all processes
    const autoZoomToFit = () => {
        if (processes.size === 0 || !containerRef.current || boxPositions.size === 0) return;

        // Calculate the bounding box of all processes
        const boundingBox = calculateBoundingBox(boxPositions);

        // Get header height for viewport adjustment
        const header = document.getElementById('main-header');
        const headerHeight = header ? header.offsetHeight : 0;

        // Calculate zoom and translation to fit everything
        const { zoom, translateX: newX, translateY: newY } = calculateZoomToFit(
            boundingBox,
            containerSize.width,
            containerSize.height,
            headerHeight,
            80 // Padding
        );

        // Apply new zoom and position with smooth transition
        setZoomLevel(zoom);
        setTranslateX(newX);
        setTranslateY(newY);
        applyTransition();
    };

    // Focus on a specific process
    const focusOnProcess = (processId: string) => {
        if (isDragging) return;
        if (!containerRef.current || !boxPositions.has(processId)) return;

        const position = boxPositions.get(processId)!;
        setFocusedProcess(processId);

        // Get viewport dimensions
        const viewportWidth = containerSize.width;
        const header = document.getElementById('main-header');
        const headerHeight = header ? header.offsetHeight : 0;
        const viewportHeight = containerSize.height - headerHeight;

        // Set zoom to 100% and center the box
        setZoomLevel(1);
        setTranslateX((viewportWidth - position.width) / 2 - position.x);
        setTranslateY(headerHeight + (viewportHeight - position.height) / 2 - position.y);

        // Apply smooth transition
        applyTransition();
    };

    // Reset zoom to show all processes
    const resetZoom = () => {
        autoZoomToFit();
        setFocusedProcess(null);
    };

    // Render all processes and agent boxes
    const renderBoxes = () => {
        if (processes.size === 0 || boxPositions.size === 0) return null;

        const processElements: React.ReactNode[] = [];
        const agentElements: React.ReactNode[] = [];
        const connectionElements: React.ReactNode[] = [];

        // Render main processes
        for (const [id, process] of processes.entries()) {
            const position = boxPositions.get(id);
            if (!position) continue;

            // Style for main process box
            const style = {
                width: `${position.width}px`,
                height: `${position.height}px`,
                left: `${position.x}px`,
                top: `${position.y}px`,
                opacity: process.status === 'terminated' ? '0.2' : '1',
                transition: 'left 0.3s ease-in-out, top 0.3s ease-in-out',
                transform: `scale(${position.scale})`,
            };

            // Add the process box
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

            // Handle sub-agents of this process
            if (process.agent.workers && process.agent.workers.size > 0) {
                for (const [workerId, agent] of process.agent.workers.entries()) {
                    // Get position for this sub-agent
                    let agentPosition = boxPositions.get(workerId);
                    if (!agentPosition) continue;

                    // Style for agent box
                    const agentStyle = {
                        width: `${agentPosition.width}px`,
                        height: `${agentPosition.height}px`,
                        left: `${agentPosition.x}px`,
                        top: `${agentPosition.y}px`,
                        opacity: process.status === 'terminated' ? '0.2' : '1',
                        transition: 'left 0.3s ease-in-out, top 0.3s ease-in-out',
                        transform: `scale(${agentPosition.scale})`,
                    };

                    // Add agent box
                    agentElements.push(
                        <div key={workerId} style={agentStyle} className="agent-wrapper">
                            <AgentBox
                                id={workerId}
                                colors={process.colors}
                                logs={process.logs}
                                agentName={agent.name || workerId}
                                messages={agent.messages}
                                isTyping={agent.isTyping}
                            />
                        </div>
                    );
                }
            }
        }

        // Return all elements with connections behind boxes
        return [...connectionElements, ...processElements, ...agentElements];
    };

    // Calculate total width and height needed for the wrapper
    const getWrapperStyles = () => {
        if (processes.size === 0 || boxPositions.size === 0) {
            return {
                minWidth: '100vw',
                minHeight: '100vh'
            };
        }

        // Calculate bounding box
        const { minX, minY, maxX, maxY } = calculateBoundingBox(boxPositions);

        // Add padding around the edges
        const padding = gap;
        const minXWithPadding = minX - padding;
        const minYWithPadding = minY - padding;
        const maxXWithPadding = maxX + padding;
        const maxYWithPadding = maxY + padding;

        // Calculate total width and height needed
        const totalWidth = maxXWithPadding - minXWithPadding;
        const totalHeight = maxYWithPadding - minYWithPadding;

        return {
            width: `${Math.max(totalWidth, window.innerWidth)}px`,
            height: `${Math.max(totalHeight, window.innerHeight)}px`,
            minWidth: '100vw',
            minHeight: '100vh'
        };
    };

    return (
        <>
            {/* Show All button (visible when processes exist) */}
            {processes.size > 0 && (
                <button
                    className="reset-zoom-button btn btn-sm btn-light"
                    onClick={resetZoom}
                    style={{
                        display: 'block',
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        zIndex: 1000,
                        pointerEvents: 'auto',
                        opacity: 0.9
                    }}
                >
                    Show All
                </button>
            )}

            {/* Main canvas container with drag and zoom handlers */}
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
                                if(e.preventDefault) e.preventDefault();
                            }
                        }, {passive: false});
                    }
                }}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onWheel={handleWheel}
                style={{cursor: isDragging ? 'grabbing' : 'grab'}}
            >
                {/* Dot background with parallax effect */}
                <div className="dot-background" ref={dotBackgroundRef}></div>

                {/* Process container with all boxes */}
                <div
                    className="process-container-wrapper"
                    ref={wrapperRef}
                    style={getWrapperStyles()}
                >
                    {renderBoxes()}
                </div>

                {/* Instructions for navigation */}
                <div className="zoom-hint" style={{opacity: processes.size > 0 ? '1' : '0'}}>
                    <div><span className="zoom-hint-icon">👆</span> Click to focus on a process</div>
                    <div><span className="zoom-hint-icon">👋</span> Drag to pan view</div>
                    <div>
                        <span className="zoom-hint-icon">🔍</span>
                        {navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘ Cmd' : 'Ctrl'} + Scroll to zoom
                    </div>
                </div>
            </div>
        </>
    );
};

export default ProcessGrid;
