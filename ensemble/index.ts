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

// Export external model registration functions
export {
    registerExternalModel,
    getExternalModel,
    getAllExternalModels,
    getExternalProvider,
    isExternalModel,
    clearExternalRegistrations,
    overrideModelClass,
    getModelClassOverride
} from './external_models.js';

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
export { convertStreamToMessages, chainRequests } from './utils/stream_converter.js';
export type { ConversionOptions, ConversionResult } from './utils/stream_converter.js';

import {
    ModelSettings,
    ToolFunction,
    ResponseInput,
    EnsembleStreamEvent,
    ModelClassID,
    EnsembleAgent,
} from './types.js';
import {
    getModelProvider,
} from './model_providers/model_provider.js';

export interface RequestOptions {
    agentId?: string;
    tools?: ToolFunction[];
    modelSettings?: ModelSettings;
    modelClass?: ModelClassID;
}

class RequestAgent implements EnsembleAgent {
    agent_id: string;
    modelSettings?: ModelSettings;
    modelClass?: ModelClassID;
    private tools: ToolFunction[];
    constructor(options: RequestOptions) {
        this.agent_id = options.agentId || 'ensemble';
        this.modelSettings = options.modelSettings;
        this.modelClass = options.modelClass;
        this.tools = options.tools || [];
    }
    async getTools(): Promise<ToolFunction[]> {
        return this.tools;
    }
}


/**
 * Simplified request API that returns an AsyncGenerator
 */
export async function* request(
    model: string,
    messages: ResponseInput,
    options: RequestOptions = {}
): AsyncGenerator<EnsembleStreamEvent> {
    const provider = getModelProvider(model);
    const agent = new RequestAgent(options);

    // Get the stream from the provider
    const stream = provider.createResponseStream(model, messages, agent as any);
    
    // Yield all events from the stream
    for await (const event of stream) {
        yield event;
    }
    
    // Emit stream_end event
    yield { type: 'stream_end', timestamp: new Date().toISOString() } as EnsembleStreamEvent;
}

