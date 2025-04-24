/**
 * ProcessGrid Component
 * Renders the main grid view of all processes with zooming and panning capabilities
 */
import * as React from 'react';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import ProcessBox from './ProcessBox';
import AgentBox from './AgentBox';
import { useSocket, ProcessData } from '../../context/SocketContext';
import { BoxPosition } from '../../../../types';
import {
    calculateBoxPositions,
    calculateZoomToFit,
    getOrigin,
} from '../../components/utils/GridUtils';
import PauseButton from '../ui/PauseButton';
import { TRANSITION_EASE, TRANSITION_TIME } from '../../utils/constants';

type ProcessGridProps = {
    onProcessSelect?: (processId: string) => void;
};

/**
 * ProcessGrid is responsible for:
 * - Layout of process boxes in a responsive grid
 * - Zoom and pan navigation
 * - Displaying connections between main processes and sub-agents
 */
const ProcessGrid: React.FC<ProcessGridProps> = ({ onProcessSelect }) => {
    const { processes, coreProcessId } = useSocket();
    const [focusedProcess, setFocusedProcess] = useState<string | null>(null);
    const [zoomLevel, setZoomLevel] = useState<number>(0.2);
    const [translateX, setTranslateX] = useState<number>(500);
    const [translateY, setTranslateY] = useState<number>(500);
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [startDragX, setStartDragX] = useState<number>(0);
    const [startDragY, setStartDragY] = useState<number>(0);
    const [wasDragged, setWasDragged] = useState<boolean>(false);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const [boxPositions, setBoxPositions] = useState<Map<string, BoxPosition>>(
        new Map()
    );
    const [showFirstProcess, setShowFirstProcess] = useState<boolean>(true);

    // Refs for DOM elements
    const containerRef = useRef<HTMLDivElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const dotBackgroundRef = useRef<HTMLDivElement>(null);

    const isFirstProcess = processes.size === 0;

    // Update container size on window resize
    useEffect(() => {
        const updateContainerSize = () => {
            if (containerRef.current) {
                setContainerSize({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight,
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
            coreProcessId,
            processes,
            containerSize,
            boxPositions
        );

        setBoxPositions(newPositions);
    }, [processes, containerSize]);

    // Update the positions whenever processes change
    useEffect(() => {
        const { squareWidth, squareHeight, originX, originY } =
            getOrigin(containerSize);
        const centerX = originX - squareWidth / 4;
        const centerY = originY - squareHeight / 4;
        if (isFirstProcess && containerSize.height > 0) {
            setShowFirstProcess(true);
            setZoomLevel(0.2);
            setTranslateX(centerX);
            setTranslateY(centerY - containerSize.height / 2);
            applyTransition(showFirstProcess ? 0 : TRANSITION_TIME);
        } else if (!isFirstProcess && showFirstProcess) {
            setShowFirstProcess(false);
            setZoomLevel(0.2);
            setTranslateX(centerX);
            setTranslateY(centerY);
            applyTransition();
        }
    }, [isFirstProcess, containerSize]);

    // Auto-zoom to fit all processes when processes change
    useEffect(() => {
        if (containerSize.width === 0) return;
        // Don't auto-zoom immediately to avoid rapid changes
        const timer = setTimeout(() => {
            zoomToFit();
        }, 100);

        return () => clearTimeout(timer);
    }, [boxPositions.size, containerSize]);

    // Update transform when zoom or position changes
    useLayoutEffect(() => {
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
        if (e.button === 0) {
            // Left mouse button
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
        if (e.button === 0) {
            // Left mouse button
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
            const normalizedDelta =
                Math.abs(e.deltaY) > 100
                    ? e.deltaY / 100 // For pixel-based browsers
                    : e.deltaY; // For line-based browsers

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
                setTranslateX(
                    mouseX - (mouseX - translateX) * (newZoom / oldZoom)
                );
                setTranslateY(
                    mouseY - (mouseY - translateY) * (newZoom / oldZoom)
                );
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
    const applyTransition = (duration: number = TRANSITION_TIME) => {
        if (wrapperRef.current && dotBackgroundRef.current) {
            wrapperRef.current.style.transition = `transform ${duration}ms ${TRANSITION_EASE}`;
            dotBackgroundRef.current.style.transition = `transform ${duration}ms ${TRANSITION_EASE}`;

            // Reset transition after animation completes
            setTimeout(() => {
                if (wrapperRef.current && dotBackgroundRef.current) {
                    wrapperRef.current.style.transition =
                        'transform 0.1s ease-out';
                    dotBackgroundRef.current.style.transition =
                        'transform 0.1s ease-out';
                }
            }, duration);
        }
    };

    // Automatically zoom to fit all processes
    const zoomToFit = (fitBoxes?: Map<string, BoxPosition>) => {
        fitBoxes = fitBoxes || boxPositions;
        if (
            processes.size === 0 ||
            !containerRef.current ||
            fitBoxes.size === 0
        )
            return;

        // Calculate zoom and translation to fit everything
        const {
            zoom,
            translateX: newX,
            translateY: newY,
        } = calculateZoomToFit(fitBoxes, containerSize);

        // Apply new zoom and position with smooth transition
        setZoomLevel(zoom);
        setTranslateX(newX);
        setTranslateY(newY);
        applyTransition();
    };

    // Focus on a specific process or group
    const focusOnProcess = (
        processId: string,
        focusMode: 'parent-and-children' | 'only-box' = 'parent-and-children'
    ) => {
        if (isDragging || wasDragged) return;
        if (!containerRef.current || !boxPositions.has(processId)) return;

        setFocusedProcess(processId);

        // Add the focused process (or agent)
        const focusOnBoxes: Map<string, BoxPosition> = new Map();
        focusOnBoxes.set(processId, boxPositions.get(processId));

        // Process and its child agents
        if (focusMode === 'parent-and-children') {
            // Find the process in our data
            const process = processes.get(processId) as ProcessData | undefined;
            if (
                process &&
                process.agent &&
                process.agent.workers &&
                process.agent.workers.size > 0
            ) {
                // Expand bounding box to include all children
                Array.from(process.agent.workers.keys()).forEach(workerId => {
                    const childPosition = boxPositions.get(workerId);
                    if (childPosition) {
                        focusOnBoxes.set(workerId, childPosition);
                    }
                });
            }
        }

        zoomToFit(focusOnBoxes);
    };

    // Reset zoom to show all processes
    const resetZoom = () => {
        zoomToFit();
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

            const isCoreProcess = process.id === coreProcessId;

            // Style for main process box
            const style = {
                width: `${position.width}px`,
                height: `${position.height}px`,
                left: `${position.x}px`,
                top: `${position.y}px`,
                opacity: '1',
                transition: `left ${TRANSITION_TIME}ms ${TRANSITION_EASE}, top ${TRANSITION_TIME}ms ${TRANSITION_EASE}`,
                transform: `scale(${position.scale})`,
            };

            const colors = isCoreProcess
                ? {
                      rgb: `0 0 0`,
                      bgColor: `rgba(255 255 255)`,
                      textColor: `rgba(0 0 0 / 0.9)`,
                  }
                : process.colors;

            // Add the process box
            processElements.push(
                <div
                    key={id}
                    style={style}
                    className={
                        'process-wrapper' +
                        (isCoreProcess ? ' core-process' : '')
                    }
                >
                    <ProcessBox
                        id={id}
                        isCoreProcess={isCoreProcess}
                        name={process.name}
                        command={process.command}
                        status={process.status}
                        colors={colors}
                        logs={process.logs}
                        focused={focusedProcess === id}
                        onFocus={focusOnProcess}
                        onViewLogs={onProcessSelect}
                    />
                </div>
            );

            // Handle sub-agents of this process
            if (process.agent.workers && process.agent.workers.size > 0) {
                for (const [
                    workerId,
                    agent,
                ] of process.agent.workers.entries()) {
                    // Get position for this sub-agent
                    const agentPosition = boxPositions.get(workerId);
                    if (!agentPosition) continue;

                    // Style for agent box
                    const agentStyle = {
                        width: `${agentPosition.width}px`,
                        height: `${agentPosition.height}px`,
                        left: `${agentPosition.x}px`,
                        top: `${agentPosition.y}px`,
                        opacity: '1',
                        transition:
                            'left 0.3s ease-in-out, top 0.3s ease-in-out',
                        transform: `scale(${agentPosition.scale})`,
                    };

                    // Add agent box
                    agentElements.push(
                        <div
                            key={workerId}
                            style={agentStyle}
                            className="agent-wrapper"
                        >
                            <AgentBox
                                id={workerId}
                                status={process.status}
                                colors={process.colors}
                                logs={process.logs}
                                agentName={agent.name || workerId}
                                messages={agent.messages}
                                isTyping={agent.isTyping}
                                screenshots={agent.screenshots}
                                parentProcessId={id}
                                onFocusAgent={(
                                    agentId,
                                    parentId,
                                    focusMode
                                ) => {
                                    if (focusMode === 'only-box') {
                                        // For single click, focus on just this agent
                                        focusOnProcess(agentId, focusMode);
                                    } else {
                                        // For double click, focus on the parent process + all children
                                        focusOnProcess(parentId, focusMode);
                                    }
                                }}
                            />
                        </div>
                    );
                }
            }
        }

        // Return all elements with connections behind boxes
        return [...connectionElements, ...processElements, ...agentElements];
    };

    return (
        <>
            {/* Show All button (visible when processes exist) */}
            {processes.size > 0 && (
                <div className="canvas-buttons d-flex gap-2">
                    <PauseButton />
                    <button
                        className="ms-2 reset-zoom-button btn btn-sm btn-light"
                        onClick={resetZoom}
                    >
                        Show All
                    </button>
                </div>
            )}

            {/* Main canvas container with drag and zoom handlers */}
            <div
                className="infinite-canvas-container"
                ref={el => {
                    containerRef.current = el;
                    if (el) {
                        // Only prevent default for wheel events with modifier key pressed
                        el.addEventListener(
                            'wheel',
                            e => {
                                const isMac =
                                    navigator.platform
                                        .toUpperCase()
                                        .indexOf('MAC') >= 0;
                                const modifierKeyPressed = isMac
                                    ? e.metaKey
                                    : e.ctrlKey;
                                if (modifierKeyPressed) {
                                    if (e.preventDefault) e.preventDefault();
                                }
                            },
                            { passive: false }
                        );
                    }
                }}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onWheel={handleWheel}
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            >
                {/* Dot background with parallax effect */}
                <div className="dot-background" ref={dotBackgroundRef}></div>

                {/* Process container with all boxes */}
                <div className="process-container-wrapper" ref={wrapperRef}>
                    {renderBoxes()}
                </div>

                {/* Instructions for navigation
                <div className={"zoom-hint"+(processes.size > 0 ? ' show' : '')}>
                    <div><span className="zoom-hint-icon">👆</span> Click to focus on a process</div>
                    <div><span className="zoom-hint-icon">👋</span> Drag to pan view</div>
                    <div>
                        <span className="zoom-hint-icon">🔍</span>
                        {navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘ Cmd' : 'Ctrl'} + Scroll to zoom
                    </div>
                </div>
                */}
            </div>
        </>
    );
};

export default ProcessGrid;
