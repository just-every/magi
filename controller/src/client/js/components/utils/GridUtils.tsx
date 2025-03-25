/**
 * Grid Utilities for Process Grid Layout
 */
import { ProcessData } from '../../context/SocketContext';
import { BoxPosition } from '@types';

/**
 * Calculate grid positions for processes and their sub-agents
 * @param processes Map of all active processes
 * @param container Reference to the container element
 * @param existingPositions Map of existing box positions
 * @returns Map of calculated box positions
 */
export const calculateBoxPositions = (
    processes: Map<string, ProcessData>,
    containerWidth: number,
    containerHeight: number,
    existingPositions: Map<string, BoxPosition>
): Map<string, BoxPosition> => {
    if (processes.size === 0) return new Map<string, BoxPosition>();

    // Copy existing positions to preserve them
    const newPositions = new Map<string, BoxPosition>(existingPositions);

    // Define basic dimensions
    const gap = 40; // Gap between process boxes
    const agentBoxScale = 0.25; // Agent boxes are 1/4 the size of process boxes
    const safeMargin = 100; // Margin from viewport edges

    // Calculate box dimensions based on container size
    const maxWidth = 1000;
    const maxHeight = Math.min(1500, Math.max(500, Math.round(maxWidth * (containerHeight / containerWidth))));
    const boxWidth = Math.min(containerWidth, maxWidth);
    const boxHeight = Math.min(containerHeight, maxHeight);

    // Agent box dimensions
    const agentBoxWidth = boxWidth * agentBoxScale;
    const agentBoxHeight = boxHeight * agentBoxScale;

    // Identify existing vs new processes
    const existingProcessIds = new Set(existingPositions.keys());
    const newProcessIds = new Set<string>();
    for (const [id] of processes.entries()) {
        if (!existingProcessIds.has(id)) {
            newProcessIds.add(id);
        }
    }

    // Build a map of agent IDs to process IDs
    const agentIdToProcessId = new Map<string, string>();
    for (const [id, process] of processes.entries()) {
        if (process.agent.agent_id) {
            agentIdToProcessId.set(process.agent.agent_id, id);
        }
    }

    // Map processes to their children
    const childrenMap = new Map<string, string[]>();
    for (const [id] of processes.entries()) {
        childrenMap.set(id, []);
    }

    // Collect all sub-agents and map them to their parent processes
    for (const [id, process] of processes.entries()) {
        if (process.agent.workers && process.agent.workers.size > 0) {
            const parentChildren = childrenMap.get(id) || [];

            // Add each sub-agent to the parent's children map
            for (const [subAgentId] of process.agent.workers.entries()) {
                const positionId = `subagent_${subAgentId}`;
                if (!parentChildren.includes(positionId)) {
                    parentChildren.push(positionId);
                }
            }

            childrenMap.set(id, parentChildren);
        }
    }

    // Helper: Check if a position collides with existing boxes
    const hasCollision = (pos: BoxPosition, ignoreIds: Set<string> = new Set()): boolean => {
        for (const [id, existingPos] of newPositions.entries()) {
            if (ignoreIds.has(id)) continue;

            const padding = 20; // Minimum space between boxes

            // Check for collision with padding
            if (pos.x + pos.width + padding > existingPos.x &&
                pos.x < existingPos.x + existingPos.width + padding &&
                pos.y + pos.height + padding > existingPos.y &&
                pos.y < existingPos.y + existingPos.height + padding) {
                return true;
            }
        }
        return false;
    };

    // Helper: Find a non-colliding position
    const findNonCollidingPosition = (basePos: BoxPosition, maxAttempts: number = 20): BoxPosition => {
        // First check if the base position is already good
        if (!hasCollision(basePos)) return basePos;

        // Different directions to try
        const directions = [
            { x: 1, y: 0 },   // Right
            { x: 0, y: 1 },   // Down
            { x: -1, y: 0 },  // Left
            { x: 0, y: -1 },  // Up
            { x: 1, y: 1 },   // Down-right
            { x: -1, y: 1 },  // Down-left
            { x: -1, y: -1 }, // Up-left
            { x: 1, y: -1 }   // Up-right
        ];

        const pos = { ...basePos };

        // Try different positions in increasing distance
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const stepSize = 50 + (attempt * 25);

            for (const dir of directions) {
                const testPos = {
                    ...pos,
                    x: pos.x + dir.x * stepSize,
                    y: pos.y + dir.y * stepSize
                };

                if (!hasCollision(testPos)) {
                    return testPos;
                }
            }
        }

        // Last resort: random position
        return {
            ...basePos,
            x: Math.random() * (containerWidth - basePos.width - 2 * safeMargin) + safeMargin,
            y: Math.random() * (containerHeight - basePos.height - 2 * safeMargin) + safeMargin
        };
    };

    // Calculate center of the viewport for grid layout
    const centerX = containerWidth / 2 - boxWidth / 2;
    const centerY = containerHeight / 2 - boxHeight / 2;

    // Handle new processes - place in a grid layout
    const newMainProcesses: [string, ProcessData][] = [];
    for (const id of newProcessIds) {
        const process = processes.get(id);
        if (process) {
            newMainProcesses.push([id, process]);
        }
    }

    // Place new processes in a grid pattern
    if (newMainProcesses.length > 0) {
        // Count existing main processes
        const existingMainCount = Array.from(newPositions.entries())
            .filter(([id]) => processes.has(id))
            .length;

        // Calculate grid parameters for layout
        const totalMainCount = existingMainCount + newMainProcesses.length;
        const sqrtMain = Math.ceil(Math.sqrt(totalMainCount));
        const mainBoxSpacing = boxWidth + gap;

        // Track which grid positions are already taken
        const takenSpots = new Set<string>();
        for (const [id, pos] of newPositions.entries()) {
            if (processes.has(id)) {
                const gridX = Math.round((pos.x - centerX) / mainBoxSpacing);
                const gridY = Math.round((pos.y - centerY) / mainBoxSpacing);
                takenSpots.add(`${gridX},${gridY}`);
            }
        }

        // Place each new process
        let placedCount = 0;

        // Try to fill open spots in the grid
        for (let y = -Math.floor(sqrtMain/2); y <= Math.ceil(sqrtMain/2); y++) {
            for (let x = -Math.floor(sqrtMain/2); x <= Math.ceil(sqrtMain/2); x++) {
                const spotKey = `${x},${y}`;
                if (!takenSpots.has(spotKey) && placedCount < newMainProcesses.length) {
                    const [id] = newMainProcesses[placedCount];
                    const baseX = centerX + x * mainBoxSpacing;
                    const baseY = centerY + y * mainBoxSpacing;

                    const basePos = {
                        x: baseX,
                        y: baseY,
                        width: boxWidth,
                        height: boxHeight
                    };

                    // Find a non-colliding position near this grid point
                    const finalPos = findNonCollidingPosition(basePos);

                    // Add the new position
                    newPositions.set(id, finalPos);
                    takenSpots.add(spotKey);
                    placedCount++;
                }
            }
        }

        // If we still have processes to place, add them to extended grid
        if (placedCount < newMainProcesses.length) {
            const expandedSqrt = Math.ceil(Math.sqrt(totalMainCount * 1.5));

            for (let y = -Math.floor(expandedSqrt/2); y <= Math.ceil(expandedSqrt/2) && placedCount < newMainProcesses.length; y++) {
                for (let x = -Math.floor(expandedSqrt/2); x <= Math.ceil(expandedSqrt/2) && placedCount < newMainProcesses.length; x++) {
                    const spotKey = `${x},${y}`;
                    if (!takenSpots.has(spotKey)) {
                        const [id] = newMainProcesses[placedCount];
                        const baseX = centerX + x * mainBoxSpacing;
                        const baseY = centerY + y * mainBoxSpacing;

                        const basePos = {
                            x: baseX,
                            y: baseY,
                            width: boxWidth,
                            height: boxHeight
                        };

                        // Find a non-colliding position
                        const finalPos = findNonCollidingPosition(basePos);

                        // Add the new position
                        newPositions.set(id, finalPos);
                        takenSpots.add(spotKey);
                        placedCount++;
                    }
                }
            }
        }
    }

    // Position sub-agents for all processes
    for (const [id, process] of processes.entries()) {
        if (process.agent.workers && process.agent.workers.size > 0) {
            const processPos = newPositions.get(id);
            if (!processPos) continue;

            // Process all sub-agents
            let i = 0;
            for (const [subAgentId] of process.agent.workers.entries()) {
                const positionId = `subagent_${subAgentId}`;

                // Set a default position for new sub-agents
                if (!newPositions.has(positionId)) {
                    newPositions.set(positionId, {
                        x: processPos.x + processPos.width * 0.7 + (i * 10),
                        y: processPos.y + processPos.height * 0.2 + (i * 10),
                        width: agentBoxWidth,
                        height: agentBoxHeight
                    });
                    i++;
                }
            }
        }
    }

    // Position all sub-agents more precisely relative to their parents
    for (const [parentId, childIds] of childrenMap.entries()) {
        if (childIds.length === 0) continue;

        // Get parent position
        let parentPos = newPositions.get(parentId);
        if (!parentPos && childIds.length > 0) {
            // Try to find by agent ID
            for (const [processId, process] of processes.entries()) {
                if (process.agent.agent_id === parentId && newPositions.has(processId)) {
                    parentPos = newPositions.get(processId);
                    break;
                }
            }
        }

        if (!parentPos) continue;

        // Define relative positions around the parent (clockwise from top-right)
        const relativePositions = [
            { x: 1.1, y: -0.2 },   // Top-right
            { x: 1.1, y: 0.5 },    // Middle-right
            { x: 1.1, y: 1.2 },    // Bottom-right
            { x: 0.5, y: 1.2 },    // Bottom-middle
            { x: -0.1, y: 1.2 },   // Bottom-left
            { x: -0.3, y: 0.5 },   // Middle-left
            { x: -0.3, y: -0.2 },  // Top-left
            { x: 0.5, y: -0.4 }    // Top-middle
        ];

        // Additional positions for more than 8 agents
        const extendedPositions = [
            { x: 0.9, y: -0.4 },   // More top-right
            { x: 1.3, y: 0.2 },    // More right-top
            { x: 1.3, y: 0.8 },    // More right-bottom
            { x: 0.9, y: 1.4 },    // More bottom-right
            { x: 0.1, y: 1.4 },    // More bottom-left
            { x: -0.5, y: 0.8 },   // More left-bottom
            { x: -0.5, y: 0.2 },   // More left-top
            { x: 0.1, y: -0.4 }    // More top-left
        ];

        // Use all positions for positioning
        const allPositions = [...relativePositions, ...extendedPositions];

        // Track used positions
        const usedPosIndices = new Set<number>();
        const processedChildIds = new Set<string>();

        // First pass: preserve existing relative positions
        for (let i = 0; i < childIds.length; i++) {
            const childId = childIds[i];
            if (!newProcessIds.has(childId) && existingProcessIds.has(childId)) {
                processedChildIds.add(childId);

                // Try to determine what position this agent was using
                const childPos = newPositions.get(childId);
                if (childPos) {
                    // Calculate relative position to parent
                    const relX = (childPos.x - parentPos.x) / parentPos.width;
                    const relY = (childPos.y - parentPos.y) / parentPos.height;

                    // Find closest matching position
                    for (let posIdx = 0; posIdx < allPositions.length; posIdx++) {
                        const templatePos = allPositions[posIdx];
                        const dist = Math.sqrt(
                            Math.pow(relX - templatePos.x, 2) +
                            Math.pow(relY - templatePos.y, 2)
                        );

                        // If close to a template position, mark it as used
                        if (dist < 0.5) {
                            usedPosIndices.add(posIdx);
                            break;
                        }
                    }
                }
            }
        }

        // Second pass: position new sub-agents
        for (let i = 0; i < childIds.length; i++) {
            const childId = childIds[i];
            if (processedChildIds.has(childId)) continue;

            // Find an unused position
            let posIndex = 0;
            while (usedPosIndices.has(posIndex) && posIndex < allPositions.length) {
                posIndex++;
            }

            // If all positions are used, reuse them
            if (posIndex >= allPositions.length) {
                posIndex = i % allPositions.length;
            }

            // Mark this position as used
            usedPosIndices.add(posIndex);

            const position = allPositions[posIndex];

            // Calculate the actual offset based on parent dimensions
            const offsetX = position.x * parentPos.width;
            const offsetY = position.y * parentPos.height;

            // Calculate the base position
            const baseX = parentPos.x;
            const baseY = parentPos.y;

            // Apply offset
            const rawX = baseX + offsetX;
            const rawY = baseY + offsetY;

            // Create position object
            const basePos = {
                x: rawX,
                y: rawY,
                width: agentBoxWidth,
                height: agentBoxHeight
            };

            // Find a non-colliding position
            const finalPos = findNonCollidingPosition(basePos, 10);

            // Set the final position
            newPositions.set(childId, finalPos);
        }
    }

    // Clean up any positions for processes that no longer exist
    for (const [id] of existingPositions) {
        if (!processes.has(id)) {
            newPositions.delete(id);
        }
    }

    return newPositions;
};

/**
 * Calculate bounding box for all positions
 * @param positions Map of box positions
 * @returns Object with minX, minY, maxX, maxY
 */
export const calculateBoundingBox = (positions: Map<string, BoxPosition>): {
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
} => {
    let minX = Number.MAX_SAFE_INTEGER;
    let minY = Number.MAX_SAFE_INTEGER;
    let maxX = Number.MIN_SAFE_INTEGER;
    let maxY = Number.MIN_SAFE_INTEGER;

    // Find the bounds of all positioned boxes
    for (const position of positions.values()) {
        minX = Math.min(minX, position.x);
        minY = Math.min(minY, position.y);
        maxX = Math.max(maxX, position.x + position.width);
        maxY = Math.max(maxY, position.y + position.height);
    }

    // If no valid positions, return default values
    if (minX === Number.MAX_SAFE_INTEGER) {
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    return { minX, minY, maxX, maxY };
};

/**
 * Calculate zoom and translation to fit a bounding box in the viewport
 * @param boundingBox Bounding box to fit
 * @param containerWidth Width of the container
 * @param containerHeight Height of the container
 * @param headerHeight Height of any header element
 * @param padding Padding to add around the bounding box
 * @returns Object with zoom, translateX, translateY
 */
export const calculateZoomToFit = (
    boundingBox: { minX: number, minY: number, maxX: number, maxY: number },
    containerWidth: number,
    containerHeight: number,
    headerHeight: number = 0,
    padding: number = 100
): {
    zoom: number,
    translateX: number,
    translateY: number
} => {
    const { minX, minY, maxX, maxY } = boundingBox;

    // Add padding
    const paddedMinX = minX - padding;
    const paddedMinY = minY - padding;
    const paddedMaxX = maxX + padding;
    const paddedMaxY = maxY + padding;

    // Calculate content dimensions
    const contentWidth = paddedMaxX - paddedMinX;
    const contentHeight = paddedMaxY - paddedMinY;

    // Adjust viewport height for header
    const viewportHeight = containerHeight - headerHeight;

    // Calculate zoom level needed to fit content
    const zoomX = containerWidth / contentWidth;
    const zoomY = viewportHeight / contentHeight;

    // Use the smaller of the two zoom levels
    let zoom = Math.min(zoomX, zoomY);

    // Limit zoom to reasonable bounds
    zoom = Math.min(Math.max(zoom, 0.2), 1);

    // Calculate the center of the content
    const contentCenterX = (paddedMinX + paddedMaxX) / 2;
    const contentCenterY = (paddedMinY + paddedMaxY) / 2;

    // Calculate translation to center content
    const translateX = (containerWidth / 2) - (contentCenterX * zoom);
    const translateY = (headerHeight / 2) + (viewportHeight / 2) - (contentCenterY * zoom);

    return { zoom, translateX, translateY };
};
