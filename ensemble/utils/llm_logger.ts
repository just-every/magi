import { EnsembleLogger } from '../types.js';

// Re-export for backward compatibility
export type { EnsembleLogger };

let globalLogger: EnsembleLogger | null = null;

export function setEnsembleLogger(logger: EnsembleLogger | null): void {
    globalLogger = logger;
}

export function getEnsembleLogger(): EnsembleLogger | null {
    return globalLogger;
}

export function log_llm_request(
    agentId: string,
    providerName: string,
    model: string,
    requestData: unknown,
    timestamp?: Date
): string {
    if (globalLogger) {
        return globalLogger.log_llm_request(agentId, providerName, model, requestData, timestamp);
    }
    return '';
}

export function log_llm_response(requestId: string | undefined, responseData: unknown, timestamp?: Date): void {
    if (globalLogger) {
        globalLogger.log_llm_response(requestId, responseData, timestamp);
    }
}

export function log_llm_error(requestId: string | undefined, errorData: unknown, timestamp?: Date): void {
    if (globalLogger) {
        globalLogger.log_llm_error(requestId, errorData, timestamp);
    }
}
