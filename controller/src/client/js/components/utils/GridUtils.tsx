/**
 * Grid Utilities for Process Grid Layout
 */
import { ProcessData } from '../../context/SocketContext';
import { BoxPosition } from '@types';
import {X_OFFSET, Y_OFFSET} from "../../utils/constants";

export const GRID_PADDING = 40; // Padding between grid cells
const SQUARE_MAX_WIDTH = 1000;
const SQUARE_MIN_WIDTH = 400;
const SQUARE_MAX_HEIGHT = 1400;
const SQUARE_MIN_HEIGHT = 400;
const WORKER_SCALE = 0.5;

const MIN_ZOOM = 0.2; // Minimum allowed zoom level
const MAX_ZOOM = 2;   // Maximum allowed zoom level

/**
 * Calculate grid positions for processes and their sub-agents
 * @param processes Map of all active processes
 * @param containerSize Dimensions of the container
 * @param existingPositions Map of existing box positions
 * @returns Map of calculated box positions
 */
export const calculateBoxPositions = (
    processes: Map<string, ProcessData>,
    containerSize: {width: number, height: number},
    existingPositions: Map<string, BoxPosition>,
): Map<string, BoxPosition> => {
    if (processes.size === 0) return new Map<string, BoxPosition>();

    // Define grid position interface
    interface GridPosition {
        row: number;
        col: number;
    }

    // Store grid assignments between renders using a static cache
    if (!calculateBoxPositions.gridCache) {
        calculateBoxPositions.gridCache = new Map<string, GridPosition>();
    }
    const gridCache = calculateBoxPositions.gridCache;

    const containerWidth = X_OFFSET + containerSize.width;
    const containerHeight = Y_OFFSET + containerSize.height;

    // Calculate dimensions
    const squareWidth = Math.min(SQUARE_MAX_WIDTH, Math.max(SQUARE_MIN_WIDTH, Math.round(containerWidth * 0.8)));
    const squareHeight = Math.min(SQUARE_MAX_HEIGHT, (containerHeight * 0.7), Math.max(SQUARE_MIN_HEIGHT, Math.round(squareWidth * Math.max(1, (containerHeight / containerWidth)))));
    const workerWidth = squareWidth - (GRID_PADDING/2);
    const workerHeight = squareHeight - (GRID_PADDING/2);

    // Try to position the initial box at the center of the container
    const originX = X_OFFSET + (containerSize.width / 2) - (squareWidth/2);
    const originY = Y_OFFSET + (containerSize.height / 2) - (squareHeight/2);

    // Create a map to store the final positions
    const positionsMap = new Map<string, BoxPosition>(existingPositions);

    // Track occupied grid positions in this render
    const occupiedGrid = new Map<string, string>();

    // Helper functions
    const getGridKey = (row: number, col: number): string => `${row},${col}`;
    const isGridPositionOccupied = (row: number, col: number): boolean =>
        occupiedGrid.has(getGridKey(row, col));

    // Convert grid position to screen coordinates
    const gridToScreenCoords = (row: number, col: number) => ({
        x: originX + col * (squareWidth + GRID_PADDING),
        y: originY + row * (squareHeight + GRID_PADDING)
    });

    // Find the nearest available position using a spiral search
    const findNearestAvailablePosition = (centerRow: number = 0, centerCol: number = 0): GridPosition => {
        // First check the center position
        if (!isGridPositionOccupied(centerRow, centerCol)) {
            return { row: centerRow, col: centerCol };
        }

        // Spiral outward from the center
        for (let radius = 1; radius < 20; radius++) {
            for (let c = centerCol - radius; c <= centerCol + radius; c++) {
                for (let r = centerRow - radius + 1; r <= centerRow + radius - 1; r++) {

                    // Right column
                    if (!isGridPositionOccupied(r, centerCol + radius)) {
                        return { row: r, col: centerCol + radius };
                    }

                    // Bottom row
                    if (!isGridPositionOccupied(centerRow + radius, c)) {
                        return { row: centerRow + radius, col: c };
                    }

                    // Left column
                    if (!isGridPositionOccupied(r, centerCol - radius)) {
                        return { row: r, col: centerCol - radius };
                    }

                    // Top row
                    if (!isGridPositionOccupied(centerRow - radius, c)) {
                        return { row: centerRow - radius, col: c };
                    }
                }
            }
        }

        // Fallback for extremely crowded grid
        return { row: Math.floor(Math.random() * 10), col: Math.floor(Math.random() * 10) };
    };

    // Clean up cached grid positions for processes that no longer exist
    const currentProcessIds = new Set<string>();
    for (const [id] of processes.entries()) {
        currentProcessIds.add(id);
    }

    for (const [id] of gridCache) {
        if (id.includes(':workers:')) {
            const processId = id.split(':workers:')[0];
            if (!currentProcessIds.has(processId)) {
                gridCache.delete(id);
            }
        } else if (!currentProcessIds.has(id)) {
            gridCache.delete(id);
        }
    }

    // Clean up any positions for processes that no longer exist
    for (const [id] of existingPositions) {
        // Keep only positions for processes that still exist
        const isMainProcess = processes.has(id);
        const isSubagent = !isMainProcess &&
            Array.from(processes.values()).some(p =>
                p.agent?.workers &&
                Array.from(p.agent.workers.keys()).some(workerId => id === workerId)
            );

        if (!isMainProcess && !isSubagent) {
            positionsMap.delete(id);
        }
    }

    // First pass: Position main processes
    for (const [id, process] of processes.entries()) {
        let gridPos: GridPosition;

        // Try to use existing position if available
        if (gridCache.has(id)) {
            const cached = gridCache.get(id);
            if (!isGridPositionOccupied(cached.row, cached.col)) {
                gridPos = cached;
            } else {
                // Find a new position near the cached one
                gridPos = findNearestAvailablePosition(cached.row, cached.col);
            }
        } else {
            // Find a new position near the center
            gridPos = findNearestAvailablePosition();
        }

        // Get the core process ID
        // Here we can't directly access the coreProcessId from useSocket() since we're in a utility function
        // We need to determine it from the processes data
        const coreProcessIds = Array.from(processes.entries())
            .filter(([pId, _]) => {
                // In ProcessGrid.tsx, the core process is marked with process.id === coreProcessId
                // Since we can't access coreProcessId directly, we'll check if this is the first process
                // This is a heuristic approach - in a real solution, consider adding a coreProcess flag to ProcessData
                return pId === Array.from(processes.keys())[0];
            })
            .map(([pId, _]) => pId);
        
        const isCoreProcess = coreProcessIds.includes(id);

        // Mark this position as occupied and update cache
        occupiedGrid.set(getGridKey(gridPos.row, gridPos.col), id);
        gridCache.set(id, gridPos);
        
        // If this is the core process, also mark adjacent grid cells as occupied (2x2 grid)
        if (isCoreProcess) {
            // Mark right cell
            occupiedGrid.set(getGridKey(gridPos.row, gridPos.col + 1), id);
            // Mark bottom cell
            occupiedGrid.set(getGridKey(gridPos.row + 1, gridPos.col), id);
            // Mark bottom-right cell
            occupiedGrid.set(getGridKey(gridPos.row + 1, gridPos.col + 1), id);
        }

        // Convert to screen coordinates
        const { x, y } = gridToScreenCoords(gridPos.row, gridPos.col);
        
        // Set position in the result map
        positionsMap.set(id, {
            x,
            y,
            width: isCoreProcess ? squareWidth * 2 : squareWidth,
            height: isCoreProcess ? squareHeight * 2 : squareHeight,
            scale: isCoreProcess ? 2 : 1
        });

        if (!process.agent?.workers || process.agent.workers.size === 0) continue;

        const workers = Array.from(process.agent.workers.entries());

        // Position workers in groups of up to 4 per grid cell
        const workerGroups = Math.ceil(workers.length / 4);

        for (let groupIndex = 0; groupIndex < workerGroups; groupIndex++) {
            // Generate a stable key for this worker group
            const groupKey = `${id}:workers:${groupIndex}`;
            let groupGridPos: GridPosition;

            // Try to use cached position
            if (gridCache.has(groupKey)) {
                const cached = gridCache.get(groupKey);
                if (!isGridPositionOccupied(cached.row, cached.col)) {
                    groupGridPos = cached;
                } else {
                    // Find a new position near the process
                    groupGridPos = findNearestAvailablePosition(gridPos.row, gridPos.col);
                }
            } else {
                // Find a new position near the process
                groupGridPos = findNearestAvailablePosition(gridPos.row, gridPos.col);
            }

            // Mark this position as occupied and update cache
            occupiedGrid.set(getGridKey(groupGridPos.row, groupGridPos.col), groupKey);
            gridCache.set(groupKey, groupGridPos);

            // Get base coordinates for this worker group
            const { x: baseX, y: baseY } = gridToScreenCoords(groupGridPos.row, groupGridPos.col);

            // Position up to 4 workers in a 2x2 grid within this cell
            for (let i = 0; i < 4 && (groupIndex * 4 + i) < workers.length; i++) {
                const workerIndex = groupIndex * 4 + i;
                if (workerIndex >= workers.length) break;

                const [workerId] = workers[workerIndex];

                // Determine the relative position of the worker group to the parent process
                const isLeft = groupGridPos.col < gridPos.col;
                const isRight = groupGridPos.col > gridPos.col;
                const isAbove = groupGridPos.row < gridPos.row;
                const isBelow = groupGridPos.row > gridPos.row;

                const TOP_LEFT = 0;
                const TOP_RIGHT = 1;
                const BOTTOM_LEFT = 2;
                const BOTTOM_RIGHT = 3;

                // Re-order the 2x2 grid based on parent position to place workers closest to parent first
                let gridOrder = [TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT];

                if (isRight) {
                    gridOrder = [TOP_LEFT, BOTTOM_LEFT, TOP_RIGHT, BOTTOM_RIGHT]; // Start from left side (closer to parent)
                } else if (isLeft) {
                    gridOrder = [TOP_RIGHT, BOTTOM_RIGHT, TOP_LEFT, BOTTOM_LEFT]; // Start from right side (closer to parent)
                } else if (isBelow) {
                    gridOrder = [TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT,BOTTOM_RIGHT]; // Start from top side (closer to parent)
                } else if (isAbove) {
                    gridOrder = [BOTTOM_LEFT, BOTTOM_RIGHT, TOP_LEFT, TOP_RIGHT]; // Start from bottom side (closer to parent)
                }

                // Get the placement index for this worker
                const placementIndex = gridOrder[i];

                // Calculate position within the 2x2 grid using the new placement order
                let xOffset = (placementIndex % 2 === 0 ? 0 : 1) * (Math.round(workerWidth * WORKER_SCALE) + (GRID_PADDING / 2));
                let yOffset = (Math.floor(placementIndex / 2) === 0 ? 0 : 1) * (Math.round(workerHeight * WORKER_SCALE) + (GRID_PADDING / 2));

                xOffset -= Math.round(workerWidth * WORKER_SCALE * WORKER_SCALE);
                yOffset -= Math.round(workerHeight * WORKER_SCALE * WORKER_SCALE);

                positionsMap.set(workerId, {
                    x: baseX + xOffset,
                    y: baseY + yOffset,
                    width: workerWidth,
                    height: workerHeight,
                    scale: WORKER_SCALE
                });
            }
        }
    }

    return positionsMap;
};

// Add a static property to maintain grid positions between renders
calculateBoxPositions.gridCache = new Map();

/**
 * Calculate bounding box for all positions, considering their scale.
 * @param positions Map of box positions
 * @returns Object with minX, minY, maxX, maxY of the scaled boxes
 */
export const calculateBoundingBox = (positions: Map<string, BoxPosition>): {
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
} => {
    // Use +/- Infinity for robust initialization
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let count = 0;

    for (const position of positions.values()) {
        // Calculate bounds based on scaled dimensions
        const scaledWidth = position.width * position.scale;
        const scaledHeight = position.height * position.scale;

        let x = position.x;
        let y = position.y;
        if(position.scale < 1) {
            x += (scaledWidth * position.scale);
            y += (scaledHeight * position.scale);
        }

        const boxMinX = x;
        const boxMinY = y;
        const boxMaxX = x + scaledWidth;
        const boxMaxY = y + scaledHeight;

        minX = Math.min(minX, boxMinX);
        minY = Math.min(minY, boxMinY);
        maxX = Math.max(maxX, boxMaxX);
        maxY = Math.max(maxY, boxMaxY);
        count++;
    }

    // If no positions were processed, return a zero-size box at origin
    if (count === 0) {
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    return { minX, minY, maxX, maxY };
};


/**
 * Calculate zoom and translation to fit items in the viewport.
 * Assumes the rendering component correctly uses position.scale for visual size.
 * @param boxPositions Boxes to include in zoom
 * @param containerSize Dimensions of the container { width, height }
 * @returns Object with zoom, translateX, translateY
 */
export const calculateZoomToFit = (
    boxPositions: Map<string, BoxPosition>,
    containerSize: {width: number, height: number},
): {
    zoom: number,
    translateX: number,
    translateY: number
} => {

    // --- Handle Empty Case ---
    if (boxPositions.size === 0) {
        return { zoom: 1, translateX: 0, translateY: 0 };
    }

    // --- Calculate Bounding Box (of correctly scaled boxes) ---
    const { minX, minY, maxX, maxY } = calculateBoundingBox(boxPositions);

    // Handle case where bounding box calculation resulted in zero size (e.g., no items)
    // Check width/height to handle single points correctly if needed later
    const actualContentWidth = maxX - minX;
    const actualContentHeight = maxY - minY;
    if (actualContentWidth <= 0 && actualContentHeight <= 0) {
        return { zoom: 1, translateX: 0, translateY: 0 };
    }

    // --- Calculate Viewport Center ---
    const viewportCenterX = X_OFFSET + containerSize.width / 2;
    const viewportCenterY = Y_OFFSET + (containerSize.height / 2);

    let zoom: number;
    let translateX: number;
    let translateY: number;

    // --- CHOOSE LOGIC BASED ON NUMBER OF BOXES ---
    if (boxPositions.size === 1) {
        // --- Single Box: Center the actual box, use zoom = 1 / scale ---
        // Assumes transform model: Scale from Origin (0,0), then Translate

        const position = boxPositions.values().next().value;
        const scale = position.scale;

        // Use native zoom based on the box's scale, clamped
        zoom = 1 / scale;
        zoom = Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);

        // Center point is the center of the single scaled box
        const actualContentCenterX = minX + actualContentWidth / 2;
        const actualContentCenterY = minY + actualContentHeight / 2;

        // Calculate translation using Model 1 (Scale 0,0 -> Translate)
        // Moves the scaled center to the viewport center
        translateX = viewportCenterX - (actualContentCenterX * zoom);
        translateY = viewportCenterY - (actualContentCenterY * zoom);

    } else {
        // --- Multiple Boxes: Fit padded bounding box ---
        // Assumes transform model: Scale from Origin (0,0), then Translate

        // Add padding around the overall bounding box for visual spacing
        const paddedMinX = minX - GRID_PADDING;
        const paddedMinY = minY - GRID_PADDING;
        const paddedMaxX = maxX + GRID_PADDING;
        const paddedMaxY = maxY + GRID_PADDING;

        // Use Math.max(1, ...) to prevent dimensions <= 0 and division by zero
        const paddedContentWidth = Math.max(1, paddedMaxX - paddedMinX);
        const paddedContentHeight = Math.max(1, paddedMaxY - paddedMinY);

        // Calculate zoom level needed to fit the padded content area
        const zoomX = containerSize.width / paddedContentWidth;
        const zoomY = containerSize.height / paddedContentHeight;
        zoom = Math.min(zoomX, zoomY, 1); // Use smaller factor to ensure fit
        zoom = Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM); // Clamp zoom

        // Find the center of the PADDED area
        const contentCenterX = paddedMinX + paddedContentWidth / 2;
        const contentCenterY = paddedMinY + paddedContentHeight / 2;

        // Calculate translation using Model 1 (Scale 0,0 -> Translate)
        // Moves the center of the padded area (scaled from 0,0) to viewport center
        translateX = viewportCenterX - (contentCenterX * zoom);
        translateY = viewportCenterY - (contentCenterY * zoom);
    }

    return { zoom, translateX, translateY };
};
