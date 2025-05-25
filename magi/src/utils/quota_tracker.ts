/**
 * MAGI-specific quota tracker integration
 * 
 * This file integrates the ensemble QuotaTracker with MAGI's UI communication system
 */

import { QuotaTracker, QuotaUpdateCallback } from '@magi-system/ensemble';
import { QuotaUpdateEvent } from '../types/shared-types.js';
import { sendStreamEvent } from './communication.js';

/**
 * Create a quota update callback that sends events to the MAGI UI
 */
const createQuotaUpdateCallback = (): QuotaUpdateCallback => {
    return (quotaSummary: Record<string, any>) => {
        try {
            const quotaEvent: QuotaUpdateEvent = {
                type: 'quota_update',
                quotas: quotaSummary,
            };
            sendStreamEvent(quotaEvent);
        } catch (error) {
            console.error('Error sending quota update:', error);
        }
    };
};

// Create a quota tracker instance with MAGI UI integration
export const quotaTracker = new QuotaTracker(createQuotaUpdateCallback());

// Export the class for type compatibility
export { QuotaTracker } from '@magi-system/ensemble';