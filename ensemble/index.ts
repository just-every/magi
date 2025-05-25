// Export all types
export * from './types.js';

// Export specific functions from model_providers to avoid conflicts
export {
    getModelProvider,
    getProviderFromModel,
    getModelFromClass,
    isProviderKeyValid,
    ModelProvider, // This is the extended interface from model_provider.ts
    EmbedOpts
} from './model_providers/model_provider.js';

// Export all model data (excluding ModelClassID to avoid conflict)
export { 
    MODEL_REGISTRY, 
    MODEL_CLASSES, 
    findModel, 
    ModelProviderID,
    ModelUsage,
    TieredPrice,
    TimeBasedPrice,
    ModelEntry
} from './model_data.js';


// Export individual model providers
export * from './model_providers/claude.js';
export * from './model_providers/openai.js';
export * from './model_providers/openai_chat.js';
export * from './model_providers/deepseek.js';
export * from './model_providers/gemini.js';
export * from './model_providers/grok.js';
export * from './model_providers/openrouter.js';
export * from './model_providers/test_provider.js';

// Export all utils
export * from './utils/async_queue.js';
export * from './utils/communication.js';
export * from './utils/cost_tracker.js';
export * from './utils/delta_buffer.js';
export * from './utils/image_to_text.js';
export * from './utils/image_utils.js';
export * from './utils/llm_logger.js';
export * from './utils/quota_tracker.js';

// Export constants
export * from './constants.js';

import {
    ModelSettings,
    ToolFunction,
    ResponseInput,
    EnsembleStreamEvent,
    ModelClassID,
    EnsembleAgent,
    RequestParams,
    CancelHandle,
} from './types.js';
import {
    getModelProvider,
} from './model_providers/model_provider.js';

class RequestAgent implements EnsembleAgent {
    agent_id: string;
    modelSettings?: ModelSettings;
    modelClass?: ModelClassID;
    private tools: ToolFunction[];
    constructor(params: RequestParams) {
        this.agent_id = params.agentId || 'ensemble';
        this.modelSettings = params.modelSettings;
        this.modelClass = params.modelClass;
        this.tools = params.tools || [];
    }
    async getTools(): Promise<ToolFunction[]> {
        return this.tools;
    }
}


/**
 * New callback-based request API
 */
export function request(
    model: string,
    messages: ResponseInput,
    params: RequestParams
): CancelHandle {
    const provider = getModelProvider(model);
    const agent = new RequestAgent(params);
    
    // Use the new callback-based method if available, otherwise fall back to generator
    if (provider.createResponse) {
        // Wrap provider's createResponse to ensure stream_end emission
        const originalHandle = provider.createResponse(
            model, 
            messages, 
            agent as any, 
            params.onEvent, 
            params.onError
        );
        
        // Providers should emit stream_end themselves, but this ensures it happens
        // The provider's createResponse method should handle this internally
        return originalHandle;
    }
    
    // Fallback to generator method for providers not yet updated
    let cancelled = false;
    (async () => {
        try {
            const stream = provider.createResponseStream(model, messages, agent as any);
            for await (const event of stream) {
                if (cancelled) break;
                params.onEvent(event);
            }
            // Emit stream_end after generator completes
            if (!cancelled) {
                params.onEvent({ type: 'stream_end', timestamp: new Date().toISOString() } as EnsembleStreamEvent);
            }
        } catch (error) {
            if (!cancelled && params.onError) {
                params.onError(error);
            }
        }
    })();
    
    return {
        cancel: () => {
            cancelled = true;
        }
    };
}

