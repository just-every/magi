/**
 * Helper functions for git push operations
 */

import { MergePolicy, MergeAction } from '../../types/index';
import { PREventsManager } from '../managers/pr_events_manager';
import { PullRequestEventInput } from '../../types/pull_request_event';
import { recordPrFailure } from './pr_event_utils';

/**
 * Centralized function to record PR failures
 * Will use the provided manager if available, otherwise falls back to direct DB call
 * Now uses the unified PR events system in the background
 */
export async function recordFailure(
    mgr: PREventsManager | undefined,
    data: Omit<PullRequestEventInput, 'status'> & { errorMessage: string }
): Promise<void> {
    if (mgr) {
        await mgr.recordFailure(data);
    } else {
        await recordPrFailure(data);
    }
}

/**
 * Risk classification bands
 */
export type RiskBand = 'low' | 'moderate' | 'high';

/**
 * Classify a risk score into low/moderate/high bands
 */
export function classifyRisk(
    score: number | null,
    lowMax: number,
    modMax: number
): RiskBand {
    if (score === null) return 'high'; // Conservative default
    if (score <= lowMax) return 'low';
    if (score <= modMax) return 'moderate';
    return 'high';
}

/**
 * Determine merge action based on policy and risk band
 */
export function decideMergeAction(
    policy: MergePolicy,
    band: RiskBand
): MergeAction {
    switch (policy) {
        case 'all':
            return 'merge';
        case 'none':
            return 'push_only';
        case 'low_risk':
            return band === 'low' ? 'merge' : 'push_only';
        case 'moderate_risk':
            return band !== 'high' ? 'merge' : 'push_only';
        default:
            return 'push_only'; // Default to conservative action
    }
}
