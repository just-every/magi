/**
 * Bridge to connect ensemble logging to magi file_utils logging
 */

import {
    EnsembleLogger,
    setEnsembleLogger,
    ModelUsage,
    getProviderFromModel,
} from '@just-every/ensemble';
import { costTracker as ensembleCostTracker } from '@just-every/ensemble/cost_tracker';
import {
    log_llm_request,
    log_llm_response,
    log_llm_error,
} from './file_utils.js';
import { ModelProviderID } from '@just-every/ensemble';
import { CostUpdateEvent } from '../types/shared-types.js';
import { sendStreamEvent } from './communication.js';
import { quotaTracker } from './quota_tracker.js';

export class MagiEnsembleLogger implements EnsembleLogger {
    log_llm_request(
        agentId: string,
        providerName: string,
        model: string,
        requestData: unknown,
        timestamp?: Date
    ): string {
        return log_llm_request(
            agentId,
            providerName as ModelProviderID,
            model,
            requestData,
            timestamp
        );
    }

    log_llm_response(
        requestId: string | undefined,
        responseData: unknown,
        timestamp?: Date
    ): void {
        log_llm_response(requestId, responseData, timestamp);
    }

    log_llm_error(
        requestId: string | undefined,
        errorData: unknown,
        timestamp?: Date
    ): void {
        log_llm_error(requestId, errorData, timestamp);
    }
}

export function initializeEnsembleLogging(): void {
    const logger = new MagiEnsembleLogger();
    setEnsembleLogger(logger);

    // Set up a callback to be notified when usage is added to the Ensemble cost tracker
    ensembleCostTracker.onAddUsage((usage: ModelUsage) => {
        // Track quota usage with the quota manager
        try {
            const provider = getProviderFromModel(usage.model);
            const inputTokens = usage.input_tokens || 0;
            const outputTokens = usage.output_tokens || 0;

            // Track this usage against provider quotas
            quotaTracker.trackUsage(
                provider,
                usage.model,
                inputTokens,
                outputTokens
            );

            // Track credit usage for paid providers
            if (usage.cost && usage.cost > 0) {
                quotaTracker.trackCreditUsage(provider, usage.cost);
            }

            // Include quota information in cost update event
            const quotaSummary = quotaTracker.getSummary();
            if (quotaSummary[provider]) {
                if (!usage.metadata) {
                    usage.metadata = {};
                }
                usage.metadata.quota = quotaSummary[provider];
            }
        } catch (quotaError) {
            console.error('Error tracking quota usage:', quotaError);
        }

        // Send the cost data as a stream event
        const costEvent: CostUpdateEvent = {
            type: 'cost_update',
            usage,
        };
        sendStreamEvent(costEvent);
    });
}
