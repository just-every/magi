/**
 * MEC Tools - DEPRECATED
 *
 * This module is deprecated and will be removed in a future release.
 * Please use the new MECH (Meta-cognition Ensemble Chain-of-thought Hierarchy)
 * in mech_tools.ts module instead.
 *
 * This file exists as a compatibility shim for code that still imports from mec_tools.
 */

import { Agent } from './agent.js';
import {
    runMECH,
    task_complete,
    task_fatal_error,
    getMECHTools,
} from './mech_tools.js';

// Log warning on import
console.warn(
    '[DEPRECATED] mec_tools.ts is deprecated. Please use mech_tools.ts instead (MECH: Meta-cognition Ensemble Chain-of-thought Hierarchy).'
);

/**
 * Runs the Meta Ensemble Chain (MEC) - DEPRECATED
 * Use runMECH (Meta-cognition Ensemble Chain-of-thought Hierarchy) from mech_tools.ts instead.
 */
export async function runMEC(
    agent: Agent,
    content: string,
    loop: boolean = false,
    model?: string
): Promise<void> {
    console.warn(
        '[DEPRECATED] runMEC is deprecated. Please use runMECH (Meta-cognition Ensemble Chain-of-thought Hierarchy) from mech_tools.ts instead.'
    );
    return runMECH(agent, content, loop, model);
}

// Re-export the task completion functions for backwards compatibility
export { task_complete, task_fatal_error, getMECHTools as getMECTools };
