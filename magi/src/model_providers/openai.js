"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openaiProvider = exports.OpenAIProvider = void 0;
require("dotenv/config");
const openai_1 = __importDefault(require("openai"));
const uuid_1 = require("uuid");
function convertToOpenAITools(requestParams) {
    requestParams.tools = requestParams.tools.map((tool) => {
        if (tool.definition.function.name === 'web_search') {
            requestParams.model = 'gpt-4o';
            return {
                type: 'web_search_preview',
                search_context_size: 'medium',
            };
        }
        else if (tool.definition.function.name === 'computer_use') {
            requestParams.model = 'computer-use-preview';
            return {
                type: 'computer_use_preview',
                display_width: 1024,
                display_height: 768,
                environment: 'browser'
            };
        }
        return {
            type: 'function',
            name: tool.definition.function.name,
            description: tool.definition.function.description,
            parameters: {
                ...tool.definition.function.parameters,
                additionalProperties: false,
                required: Object.keys(tool.definition.function.parameters.properties),
            },
            strict: true,
        };
    });
    return requestParams;
}
class OpenAIProvider {
    constructor(apiKey) {
        this.client = new openai_1.default({
            apiKey: apiKey || process.env.OPENAI_API_KEY,
        });
        if (!this.client) {
            throw new Error('Failed to initialize OpenAI client. Make sure OPENAI_API_KEY is set.');
        }
    }
    async *createResponseStream(model, messages, tools, settings) {
        try {
            let requestParams = {
                model: model,
                stream: true,
                input: messages,
            };
            if (!model.startsWith('o3-')) {
                if (settings?.temperature !== undefined) {
                    requestParams.temperature = settings.temperature;
                }
                if (settings?.top_p !== undefined) {
                    requestParams.top_p = settings.top_p;
                }
            }
            if (settings?.tool_choice) {
                requestParams.tool_choice = settings.tool_choice;
            }
            if (tools && tools.length > 0) {
                requestParams.tools = tools;
                requestParams = convertToOpenAITools(requestParams);
            }
            const stream = await this.client.responses.create(requestParams);
            let currentToolCall = null;
            const messageId = (0, uuid_1.v4)();
            const messagePositions = new Map();
            try {
                for await (const event of stream) {
                    if (event.type === 'web_search.results') {
                        console.log('Received web_search.results from OpenAI', event.results ? `Count: ${event.results.length}` : 'No results');
                    }
                    else if (event.type === 'response.output_text.delta') {
                        const textDelta = event.delta;
                        if (textDelta) {
                            if (!messagePositions.has(messageId)) {
                                messagePositions.set(messageId, 0);
                            }
                            const position = messagePositions.get(messageId);
                            yield {
                                type: 'message_delta',
                                content: textDelta,
                                message_id: messageId,
                                order: position
                            };
                            messagePositions.set(messageId, position + 1);
                        }
                    }
                    else if (event.type === 'text.delta' && event.delta && event.delta.value) {
                        if (!messagePositions.has(messageId)) {
                            messagePositions.set(messageId, 0);
                        }
                        const position = messagePositions.get(messageId);
                        yield {
                            type: 'message_delta',
                            content: event.delta.value,
                            message_id: messageId,
                            order: position
                        };
                        messagePositions.set(messageId, position + 1);
                    }
                    else if (event.type === 'response.content.delta') {
                        if (!messagePositions.has(messageId)) {
                            messagePositions.set(messageId, 0);
                        }
                        const position = messagePositions.get(messageId);
                        yield {
                            type: 'message_delta',
                            content: event.delta,
                            message_id: messageId,
                            order: position
                        };
                        messagePositions.set(messageId, position + 1);
                    }
                    else if (event.type === 'response.content_part.added' &&
                        event.part &&
                        event.part.type === 'output_text' &&
                        event.part.text) {
                        if (event.part.text && event.part.text.length > 0) {
                            yield {
                                type: 'message_complete',
                                content: event.part.text,
                                message_id: messageId
                            };
                        }
                    }
                    else if (event.type === 'response.output_text.done' && event.text) {
                        yield {
                            type: 'message_complete',
                            content: event.text,
                            message_id: messageId
                        };
                    }
                    else if (event.type === 'function_call.started' && event.function_call) {
                        currentToolCall = {
                            id: event.function_call.id || `call_${Date.now()}`,
                            type: 'function',
                            function: {
                                name: event.function_call.name,
                                arguments: ''
                            }
                        };
                    }
                    else if (event.type === 'function_call.argument.delta' &&
                        currentToolCall &&
                        event.delta &&
                        event.delta.value) {
                        currentToolCall.function.arguments += event.delta.value;
                    }
                    else if (event.type === 'function_call.completed' &&
                        currentToolCall &&
                        event.function_call) {
                        if (event.function_call.arguments) {
                            currentToolCall.function.arguments = event.function_call.arguments;
                        }
                        if (currentToolCall.function.arguments) {
                            yield {
                                type: 'tool_start',
                                tool_calls: [currentToolCall]
                            };
                        }
                        currentToolCall = null;
                    }
                    else if (event.type === 'response.output_item.added' &&
                        event.item &&
                        event.item.type === 'function_call') {
                        currentToolCall = {
                            id: event.item.id || event.item.call_id || `call_${Date.now()}`,
                            type: 'function',
                            function: {
                                name: event.item.name,
                                arguments: ''
                            }
                        };
                    }
                    else if (event.type === 'response.function_call_arguments.delta' &&
                        currentToolCall) {
                        currentToolCall.function.arguments += event.delta;
                    }
                    else if (event.type === 'response.function_call_arguments.done' &&
                        currentToolCall) {
                        if (event.arguments) {
                            currentToolCall.function.arguments = event.arguments;
                        }
                        yield {
                            type: 'tool_start',
                            tool_calls: [currentToolCall]
                        };
                        currentToolCall = null;
                    }
                    else if (event.type === 'response.output_item.done' &&
                        event.item &&
                        event.item.type === 'function_call' &&
                        currentToolCall) {
                        if (event.item.arguments) {
                            currentToolCall.function.arguments = event.item.arguments;
                        }
                        yield {
                            type: 'tool_start',
                            tool_calls: [currentToolCall]
                        };
                        currentToolCall = null;
                    }
                }
            }
            catch (streamError) {
                console.error('Error processing response stream:', streamError);
                yield {
                    type: 'error',
                    error: String(streamError)
                };
            }
            if (currentToolCall &&
                currentToolCall.function &&
                currentToolCall.function.name) {
                yield {
                    type: 'tool_start',
                    tool_calls: [currentToolCall]
                };
            }
        }
        catch (error) {
            console.error('Error in OpenAI streaming response:', error);
            yield {
                type: 'error',
                error: String(error)
            };
        }
    }
}
exports.OpenAIProvider = OpenAIProvider;
exports.openaiProvider = new OpenAIProvider();
//# sourceMappingURL=openai.js.map