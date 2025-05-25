/**
 * Bridge to connect ensemble logging to magi file_utils logging
 */

import { EnsembleLogger, setEnsembleLogger } from '@magi-system/ensemble';
import { log_llm_request, log_llm_response, log_llm_error } from './file_utils.js';
import { ModelProviderID } from '@magi-system/ensemble';

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

    log_llm_response(requestId: string | undefined, responseData: unknown, timestamp?: Date): void {
        log_llm_response(requestId, responseData, timestamp);
    }

    log_llm_error(requestId: string | undefined, errorData: unknown, timestamp?: Date): void {
        log_llm_error(requestId, errorData, timestamp);
    }
}

export function initializeEnsembleLogging(): void {
    const logger = new MagiEnsembleLogger();
    setEnsembleLogger(logger);
}