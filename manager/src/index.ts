/**
 * @just-every/manager - Standalone manager image generation tool
 * 
 * This package provides intelligent manager image generation capabilities
 * extracted from the MAGI system, with minimal dependencies.
 */

export { manager_image, getManagerImageTools, getImageGenerationTools } from './manager-image.js';
export { manager_search, createNumberedGrid, selectBestFromGrid, smart_manager_raw } from './manager-search.js';
export { createManagerAgent, runManagerAgent, runManagerAgentStreaming } from './agents/manager-agent.js';
export * from './constants.js';
export * from './utils/grid-judge.js';
export * from './utils/image-utils.js';

// Re-export types for convenience
export type {
    MANAGER_ASSET_TYPES,
    ManagerSearchEngine,
    ManagerAssetAspect,
    ManagerAssetBackground,
} from './constants.js';

export type { ImageSource } from './manager-search.js';
export type { JudgeOptions } from './utils/grid-judge.js';