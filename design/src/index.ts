/**
 * @just-every/design - Standalone design image generation tool
 * 
 * This package provides intelligent design image generation capabilities
 * extracted from the MAGI system, with minimal dependencies.
 */

export { design_image, getDesignImageTools, getImageGenerationTools } from './design-image.js';
export { design_search, createNumberedGrid, selectBestFromGrid, smart_design_raw } from './design-search.js';
export { createDesignAgent, runDesignAgent, runDesignAgentStreaming } from './agents/design-agent.js';
export * from './constants.js';
export * from './utils/grid-judge.js';
export * from './utils/image-utils.js';

// Re-export types for convenience
export type {
    DESIGN_ASSET_TYPES,
    DesignSearchEngine,
    DesignSearchResult,
    DesignSpec,
    DesignAssetReferenceItem,
    DesignAssetGuideItem,
    DesignAssetAspect,
    DesignAssetBackground,
} from './constants.js';

export type { ImageSource } from './design-search.js';
export type { JudgeOptions } from './utils/grid-judge.js';