/**
 * Grid Utilities for Process Grid Layout
 */
import { ProcessData } from '../../context/SocketContext';
import { BoxPosition } from '@types';

const GRID_PADDING = 40; // Padding between grid cells
const SQUARE_MAX_WIDTH = 1000;
const SQUARE_MIN_WIDTH = 400;
const SQUARE_MAX_HEIGHT = 1400;
const SQUARE_MIN_HEIGHT = 400;
const WORKER_SCALE = 0.5;

/**
 * Calculate grid positions for processes and their sub-agents
 * @param processes Map of all active processes
 * @param containerWidth Width of the container
 * @param containerHeight Height of the container
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

    // Calculate dimensions
    const squareWidth = Math.min(SQUARE_MAX_WIDTH, Math.max(SQUARE_MIN_WIDTH, Math.round(containerWidth * 0.8)));
    const squareHeight = Math.min(SQUARE_MAX_HEIGHT, Math.max(SQUARE_MIN_HEIGHT, Math.round(squareWidth * (containerHeight / containerWidth))));
    const workerWidth = squareWidth - (GRID_PADDING/2);
    const workerHeight = squareHeight - (GRID_PADDING/2);

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
        x: containerWidth / 2 + col * (squareWidth + GRID_PADDING),
        y: containerHeight / 2 + row * (squareHeight + GRID_PADDING)
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

        // Mark this position as occupied and update cache
        occupiedGrid.set(getGridKey(gridPos.row, gridPos.col), id);
        gridCache.set(id, gridPos);

        // Convert to screen coordinates
        const { x, y } = gridToScreenCoords(gridPos.row, gridPos.col);

        // Set position in the result map
        positionsMap.set(id, {
            x,
            y,
            width: squareWidth,
            height: squareHeight,
            scale: 1
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

                // Move boxes closer to the parent side only
                if (isRight) {
                    xOffset -= (GRID_PADDING / 2); // Move left (toward parent)
                } else if (isLeft) {
                    xOffset += (GRID_PADDING / 2); // Move right (toward parent)
                }

                if (isBelow) {
                    yOffset -= (GRID_PADDING / 2); // Move up (toward parent)
                } else if (isAbove) {
                    yOffset += (GRID_PADDING / 2); // Move down (toward parent)
                }

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
        maxX = Math.max(maxX, position.x + (position.width * position.scale));
        maxY = Math.max(maxY, position.y + (position.height * position.scale));
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
