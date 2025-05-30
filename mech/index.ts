/**
 * @magi-system/mech
 * 
 * Meta-cognition Ensemble Chain-of-thought Hierarchy (MECH) for MAGI System
 * 
 * This module provides the MECH system which includes:
 * - Hierarchical model selection based on performance scores
 * - Meta-cognition for self-reflection and strategy adjustment
 * - Thought delay management for pacing
 * - Memory integration for learning from past tasks
 */

// ============================================================================
// Simple API - Primary interface for most users
// ============================================================================
export {
    // Main functions
    runMECH,
    runMECHWithMemory,
    getTotalCost,
    resetCostTracker,
    
    // Types
    type SimpleAgent,
    type RunMechOptions,
} from './simple.js';

// ============================================================================
// Core Types
// ============================================================================
export type {
    // Result types
    MechResult,
    MechOutcome,
    
    // Configuration
    MechConfig,
    MetaFrequency,
    ThoughtDelay,
    
    // Agent types
    MechAgent,
    AgentTool,
    
    // Context types (for advanced users)
    MechContext,
    SimpleMechOptions,
    
    // Helper types
    LLMResponse,
    MemoryItem,
} from './types.js';

// ============================================================================
// State Management
// ============================================================================
export {
    // State object
    mechState,
    
    // State modification functions
    set_meta_frequency,
    set_model_score,
    disable_model,
    enableModel,
    listDisabledModels,
    listModelScores,
    getModelScore,
    incrementLLMRequestCount,
} from './mech_state.js';

// ============================================================================
// Thought Management
// ============================================================================
export {
    getThoughtDelay,
    set_thought_delay,
    runThoughtDelay,
    setDelayInterrupted,
    isDelayInterrupted,
} from './thought_utils.js';

// ============================================================================
// Advanced API - For users who need full control
// ============================================================================
export {
    // Advanced MECH functions
    runMECH as runMECHAdvanced,
    getMECHTools,
    task_complete,
    task_fatal_error,
} from './mech_tools.js';

export {
    runMECHWithMemory as runMECHWithMemoryAdvanced,
} from './mech_memory_wrapper.js';

// ============================================================================
// Internal Components (for framework integration)
// ============================================================================
export {
    // Model rotation
    rotateModel,
} from './model_rotation.js';

export {
    // Meta-cognition
    spawnMetaThought,
} from './meta_cognition.js';

export {
    getMetaCognitionTools,
} from './mech_state.js';

export {
    // Thought tools
    getThoughtTools,
    getDelayAbortSignal,
} from './thought_utils.js';

// Export state type for TypeScript users
export type { MECHState } from './types.js';