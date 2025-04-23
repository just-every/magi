/**
 * Grid Utilities for Process Grid Layout - Revised Deterministic Layout (Fixed Scope Error)
 */
import { ProcessData } from '../../context/SocketContext';
import { BoxPosition } from '../../../../types';
import { X_OFFSET, Y_OFFSET } from '../../utils/constants';

// --- Constants ---
export const GRID_PADDING = 40; // Padding between grid cells
const VIEW_PADDING_Y = 300; // Default zoom padding for Y-axis
const VIEW_PADDING_X = 150; // Default zoom padding for X-axis
const SQUARE_MAX_WIDTH = 1000;
const SQUARE_MIN_WIDTH = 400;
const SQUARE_MAX_HEIGHT = 1400;
const SQUARE_MIN_HEIGHT = 400;
const CORE_SCALE = 2;
const DEFAULT_SCALE = 1;
const WORKER_SCALE = 0.5;

const MIN_ZOOM = 0.2; // Minimum allowed zoom level
const MAX_ZOOM = 2; // Maximum allowed zoom level

// --- Interfaces ---
interface GridPosition {
    row: number;
    col: number;
}

// --- Helper Functions ---

/** Creates a unique string key for a grid cell */
const getGridKey = (row: number, col: number): string => `${row},${col}`;

export const getOrigin = (containerSize: {
    width: number;
    height: number;
}): {
    squareWidth: number;
    squareHeight: number;
    originX: number;
    originY: number;
} => {
    const containerWidth = X_OFFSET + containerSize.width;
    const containerHeight = Y_OFFSET + containerSize.height;

    // Calculate dynamic base dimensions for a 1x1 grid cell
    const squareWidth = Math.min(
        SQUARE_MAX_WIDTH,
        Math.max(SQUARE_MIN_WIDTH, Math.round(containerWidth * 0.8))
    );
    const squareHeight = Math.min(
        SQUARE_MAX_HEIGHT,
        containerHeight * 0.7,
        Math.max(
            SQUARE_MIN_HEIGHT,
            Math.round(
                squareWidth * Math.max(1, containerHeight / containerWidth)
            )
        )
    );

    // Calculate origin (top-left of the grid cell (0,0)) relative to viewport center
    const originX = X_OFFSET + containerSize.width / 2 - squareWidth / 2;
    const originY = Y_OFFSET + containerSize.height / 2 - squareHeight / 2;

    return {
        squareWidth,
        squareHeight,
        originX,
        originY,
    };
};

/**
 * Calculates screen coordinates for the top-left of a grid cell.
 * Rows < -1 (worker rows) are treated as half the height of standard rows.
 */
const gridToScreenCoords = (
    row: number,
    col: number,
    originX: number,
    originY: number,
    squareWidth: number,
    squareHeight: number
): { x: number; y: number } => {
    const fullStep = squareHeight + GRID_PADDING;
    let y: number;

    if (row >= -1) {
        // Standard calculation for row 0, -1
        y = originY + row * fullStep;
    } else {
        // Special calculation for rows < -1 (worker rows stacking upwards)
        // Start from the position of row -1 and subtract half steps for subsequent rows
        const yForRowMinus1 = originY - fullStep;
        const numHalfStepsAboveRowMinus1 = -row - 1; // e.g., row -2 is 1 half step, row -3 is 2 half steps
        y = yForRowMinus1 - numHalfStepsAboveRowMinus1 * (fullStep / 2);
        // Alternative formula derived: y = originY - fullStep * (1 + (-row - 1) / 2)
    }

    return {
        x: originX + col * (squareWidth + GRID_PADDING),
        y: y,
    };
};

// --- Main Exported Functions ---

/**
 * Calculates grid positions using a revised deterministic layout:
 * - Core (Scale 2) at grid origin (0, 0).
 * - Scale 1 processes and Core's workers spread horizontally in row -1, starting above core's col 0.
 * - Workers of Scale 1 processes placed 2 per row, stacking vertically above their parent (row -2, -3, ...).
 */
export const calculateBoxPositions = (
    coreProcessId: string,
    processes: Map<string, ProcessData>,
    containerSize: { width: number; height: number },
    existingPositions: Map<string, BoxPosition> // Kept for API compatibility
): Map<string, BoxPosition> => {
    if (processes.size === 0) return new Map<string, BoxPosition>();

    // --- Initialization ---
    const positionsMap = new Map<string, BoxPosition>();
    // Stores calculated grid positions for parent lookup
    const processGridPositions = new Map<string, GridPosition>();

    const { squareWidth, squareHeight, originX, originY } =
        getOrigin(containerSize);

    // --- 1. Place Core Process ---
    const coreProcess = processes.get(coreProcessId);
    if (!coreProcess) {
        console.error(`Core process with ID ${coreProcessId} not found.`);
        return new Map<string, BoxPosition>();
    }

    const coreGridPos: GridPosition = { row: 0, col: 0 };
    const { x: coreX, y: coreY } = gridToScreenCoords(
        coreGridPos.row,
        coreGridPos.col,
        originX,
        originY,
        squareWidth,
        squareHeight
    );

    // Store BASE dimensions; scale will handle visual size
    positionsMap.set(coreProcessId, {
        x: coreX,
        y: coreY,
        width: squareWidth + GRID_PADDING / 2, // Store base width (1x1 cell)
        height: squareHeight + GRID_PADDING / 2, // Store base height (1x1 cell)
        scale: CORE_SCALE, // Scale indicates it visually covers 2x2
    });
    processGridPositions.set(coreProcessId, coreGridPos);

    // --- 2. Prepare and Place Row -1 Items ---
    const rowMinus1ItemIds: string[] = [];
    processes.forEach((_process, id) => {
        if (id !== coreProcessId) rowMinus1ItemIds.push(id); // Add non-core processes
    });
    const coreWorkers = coreProcess.agent?.workers
        ? Array.from(coreProcess.agent.workers.keys())
        : [];
    rowMinus1ItemIds.push(...coreWorkers); // Add core's workers

    let leftCol = 0; // Start placing leftwards from col -1
    let rightCol = 1; // Start placing rightwards from col 0 (directly above core's left)
    rowMinus1ItemIds.forEach((itemId, index) => {
        const itemScale = DEFAULT_SCALE;
        const itemWidth = squareWidth; // Base width/height for position calculation
        const itemHeight = squareHeight;

        // Assign column alternating right/left, starting from col 0
        const itemCol = index % 2 === 0 ? leftCol-- : rightCol++;
        const itemGridPos: GridPosition = { row: -1, col: itemCol };

        const { x, y } = gridToScreenCoords(
            itemGridPos.row,
            itemGridPos.col,
            originX,
            originY,
            squareWidth,
            squareHeight
        );
        positionsMap.set(itemId, {
            x,
            y,
            width: itemWidth, // Store base width
            height: itemHeight, // Store base height
            scale: itemScale, // Store correct scale for rendering/bounding box
        });
        processGridPositions.set(itemId, itemGridPos);
    });

    // --- 3. Place Workers of Scale 1 Processes ---
    processes.forEach((process, id) => {
        if (id === coreProcessId) return; // Skip core process

        if (process.agent?.workers && process.agent.workers.size > 0) {
            const parentGridPos = processGridPositions.get(id);
            if (!parentGridPos) {
                console.error(
                    `Could not find grid position for parent process ${id} when placing workers.`
                );
                return;
            }

            const workers = Array.from(process.agent.workers.keys());
            workers.forEach((workerId, workerIndex) => {
                // Determine the grid cell row (2 workers per row, stacking up)
                const workerGridRow =
                    parentGridPos.row - 1 - Math.floor(workerIndex / 2);
                const workerGridCol = parentGridPos.col; // Align with parent column

                // Calculate base screen coords for the cell the worker pair resides in
                const { x: cellX, y: cellY } = gridToScreenCoords(
                    workerGridRow,
                    workerGridCol,
                    originX,
                    originY,
                    squareWidth,
                    squareHeight
                );

                // Determine position within the cell (left or right)
                const isLeftWorker =
                    workerGridCol < 1
                        ? workerIndex % 2 !== 0
                        : workerIndex % 2 === 0;
                // Position workers side-by-side within the cell width.
                // Offset for the right worker is roughly half the cell width.
                // A small padding adjustment might be needed depending on visuals.
                const xOffset = isLeftWorker
                    ? 0
                    : squareWidth / 2 + GRID_PADDING / 4; // Adjusted offset for right worker
                const workerX = cellX + xOffset;
                const workerY = cellY; // Workers align vertically within their row

                positionsMap.set(workerId, {
                    x: workerX,
                    y: workerY,
                    width: squareWidth - GRID_PADDING / 2, // Store base width
                    height: squareHeight - GRID_PADDING / 2, // Store base height
                    scale: WORKER_SCALE,
                });
            });
        }
    });

    return positionsMap;
};

/**
 * Calculate bounding box for all positions, consistently using scale.
 */
export const calculateBoundingBox = (
    positions: Map<string, BoxPosition>
): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
} => {
    let minX = Number.POSITIVE_INFINITY,
        minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY,
        maxY = Number.NEGATIVE_INFINITY;

    if (positions.size === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };

    for (const pos of positions.values()) {
        const visualWidth = pos.width * pos.scale;
        const visualHeight = pos.height * pos.scale;

        const boxMinX = pos.x;
        const boxMinY = pos.y;
        const boxMaxX = pos.x + visualWidth;
        const boxMaxY = pos.y + visualHeight;

        minX = Math.min(minX, boxMinX);
        minY = Math.min(minY, boxMinY);
        maxX = Math.max(maxX, boxMaxX);
        maxY = Math.max(maxY, boxMaxY);
    }

    // Add fallback logic if calculation results in invalid bounds
    if (!Number.isFinite(minX + minY + maxX + maxY)) {
        console.warn(
            'Bounding box calculation resulted in non-finite values. Resetting to origin.'
        );
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    return { minX, minY, maxX, maxY };
};

/**
 * Calculate zoom and translation to fit items in the viewport.
 */
export const calculateZoomToFit = (
    boxPositions: Map<string, BoxPosition>,
    containerSize: { width: number; height: number }
): { zoom: number; translateX: number; translateY: number } => {
    if (boxPositions.size === 0) {
        return { zoom: 2, translateX: 0, translateY: 0 };
    }

    const { minX, minY, maxX, maxY } = calculateBoundingBox(boxPositions);
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    // Handle single item or zero area content
    if (
        contentWidth <= 0 ||
        contentHeight <= 0 ||
        !Number.isFinite(contentWidth + contentHeight)
    ) {
        if (
            boxPositions.size === 1 &&
            Number.isFinite(contentWidth + contentHeight)
        ) {
            const position = boxPositions.values().next().value;
            // Use bounding box center for single item as well
            const contentCenterX = minX + contentWidth / 2;
            const contentCenterY = minY + contentHeight / 2;

            // Base zoom primarily on visual size relative to container, less on scale property itself
            const zoomFitX =
                containerSize.width /
                Math.max(1, contentWidth + 2 * GRID_PADDING);
            const zoomFitY =
                containerSize.height /
                Math.max(1, contentHeight + 2 * GRID_PADDING);
            let zoom = Math.min(zoomFitX, zoomFitY);

            zoom = Math.min(Math.max(zoom, MIN_ZOOM), 0.5); // Clamp

            const viewportCenterX = X_OFFSET + containerSize.width / 2;
            const viewportCenterY = Y_OFFSET + containerSize.height / 2;
            const translateX = viewportCenterX - contentCenterX * zoom;
            const translateY = viewportCenterY - contentCenterY * zoom;
            return { zoom, translateX, translateY };
        } else {
            console.warn(
                'Zoom calculation: Zero area content or non-finite bounds, returning default view.'
            );
            return { zoom: 1, translateX: 0, translateY: 0 }; // Default view
        }
    }

    // Calculate padded bounds for multiple items
    const paddedMinX = minX - VIEW_PADDING_X;
    const paddedMinY = minY - VIEW_PADDING_Y;
    const paddedMaxX = maxX + VIEW_PADDING_X;
    const paddedMaxY = maxY + VIEW_PADDING_Y;
    const paddedContentWidth = Math.max(1, paddedMaxX - paddedMinX); // Ensure > 0
    const paddedContentHeight = Math.max(1, paddedMaxY - paddedMinY); // Ensure > 0

    // Calculate zoom
    const zoomX = containerSize.width / paddedContentWidth;
    const zoomY = containerSize.height / paddedContentHeight;
    let zoom = Math.min(zoomX, zoomY);
    zoom = Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM); // Clamp

    // Calculate translation
    const viewportCenterX = X_OFFSET + containerSize.width / 2;
    const viewportCenterY = Y_OFFSET + containerSize.height / 2;
    const contentCenterX = paddedMinX + paddedContentWidth / 2;
    const contentCenterY = paddedMinY + paddedContentHeight / 2;
    const translateX = viewportCenterX - contentCenterX * zoom;
    const translateY = viewportCenterY - contentCenterY * zoom;

    return { zoom, translateX, translateY };
};
