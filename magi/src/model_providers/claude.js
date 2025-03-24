"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.claudeProvider = exports.ClaudeProvider = void 0;
require("dotenv/config");
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const uuid_1 = require("uuid");
function convertToClaudeTools(tools) {
    return tools.map(tool => ({
        type: 'custom',
        custom: {
            name: tool.definition.function.name,
            description: tool.definition.function.description,
            parameters: tool.definition.function.parameters
        }
    }));
}
class ClaudeProvider {
    constructor(apiKey) {
        this.client = new sdk_1.default({
            apiKey: apiKey || process.env.ANTHROPIC_API_KEY
        });
        if (!this.client) {
            throw new Error('Failed to initialize Claude client. Make sure ANTHROPIC_API_KEY is set.');
        }
    }
    async *createResponseStream(model, messages, tools, settings) {
        try {
            const claudeMessages = messages.map(msg => {
                let role = 'system';
                if ('role' in msg && msg.role === 'user') {
                    role = 'user';
                }
                let content = '';
                if ('content' in msg) {
                    if (typeof msg.content === 'string') {
                        content = msg.content;
                    }
                    else if ('text' in msg.content && typeof msg.content.text === 'string') {
                        content = msg.content.text;
                    }
                }
                return {
                    ...msg,
                    role,
                    content,
                };
            });
            const requestParams = {
                model: model,
                messages: claudeMessages.filter(m => m.role !== 'system'),
                system: claudeMessages.filter(m => m.role === 'system'),
                stream: true,
                ...(settings?.temperature ? { temperature: settings.temperature } : {}),
                ...(settings?.max_tokens ? { max_tokens: settings.max_tokens } : {})
            };
            if (tools && tools.length > 0) {
                requestParams.tools = convertToClaudeTools(tools);
            }
            const stream = await this.client.messages.create(requestParams);
            let currentToolCall = null;
            let accumulatedContent = '';
            const messageId = (0, uuid_1.v4)();
            let deltaPosition = 0;
            try {
                for await (const event of stream) {
                    if (event.type === 'content_block_delta' && event.delta.text) {
                        yield {
                            type: 'message_delta',
                            content: event.delta.text,
                            message_id: messageId,
                            order: deltaPosition++
                        };
                        accumulatedContent += event.delta.text;
                    }
                    else if (event.type === 'content_block_start' &&
                        event.content_block.type === 'text') {
                        if (event.content_block.text) {
                            yield {
                                type: 'message_delta',
                                content: event.content_block.text,
                                message_id: messageId,
                                order: deltaPosition++
                            };
                            accumulatedContent += event.content_block.text;
                        }
                    }
                    else if (event.type === 'content_block_stop' &&
                        event.content_block.type === 'text') {
                        if (event.content_block.text) {
                            yield {
                                type: 'message_delta',
                                content: event.content_block.text,
                                message_id: messageId,
                                order: deltaPosition++
                            };
                            accumulatedContent += event.content_block.text;
                        }
                    }
                    else if (event.type === 'content_block_start' &&
                        event.content_block.type === 'tool_use') {
                        const toolUse = event.content_block.tool_use;
                        currentToolCall = {
                            id: toolUse.id || `call_${Date.now()}`,
                            type: 'function',
                            function: {
                                name: toolUse.name,
                                arguments: typeof toolUse.input === 'string'
                                    ? toolUse.input
                                    : JSON.stringify(toolUse.input)
                            }
                        };
                    }
                    else if (event.type === 'content_block_delta' &&
                        event.delta.type === 'tool_use' &&
                        currentToolCall) {
                        if (event.delta.tool_use && event.delta.tool_use.input) {
                            if (typeof event.delta.tool_use.input === 'string') {
                                currentToolCall.function.arguments += event.delta.tool_use.input;
                            }
                            else {
                                currentToolCall.function.arguments = JSON.stringify(event.delta.tool_use.input);
                            }
                        }
                        yield {
                            type: 'tool_start',
                            tool_calls: [currentToolCall]
                        };
                    }
                    else if (event.type === 'content_block_stop' &&
                        event.content_block.type === 'tool_use' &&
                        currentToolCall) {
                        if (event.content_block.tool_use && event.content_block.tool_use.input) {
                            currentToolCall.function.arguments = typeof event.content_block.tool_use.input === 'string'
                                ? event.content_block.tool_use.input
                                : JSON.stringify(event.content_block.tool_use.input);
                        }
                        yield {
                            type: 'tool_start',
                            tool_calls: [currentToolCall]
                        };
                        currentToolCall = null;
                    }
                    else if (event.type === 'message_stop') {
                        if (currentToolCall) {
                            yield {
                                type: 'tool_start',
                                tool_calls: [currentToolCall]
                            };
                            currentToolCall = null;
                        }
                        if (accumulatedContent) {
                            yield {
                                type: 'message_complete',
                                content: accumulatedContent,
                                message_id: messageId
                            };
                        }
                    }
                    else if (event.type === 'error') {
                        yield {
                            type: 'error',
                            error: event.error ? event.error.message : 'Unknown Claude API error'
                        };
                    }
                }
                if (accumulatedContent && !currentToolCall) {
                    yield {
                        type: 'message_complete',
                        content: accumulatedContent,
                        message_id: messageId
                    };
                }
            }
            catch (streamError) {
                console.error('Error processing Claude stream:', streamError);
                yield {
                    type: 'error',
                    error: String(streamError)
                };
                if (accumulatedContent) {
                    yield {
                        type: 'message_complete',
                        content: accumulatedContent,
                        message_id: messageId
                    };
                }
            }
        }
        catch (error) {
            console.error('Error in Claude streaming completion:', error);
            yield {
                type: 'error',
                error: String(error)
            };
        }
    }
}
exports.ClaudeProvider = ClaudeProvider;
exports.claudeProvider = new ClaudeProvider();
//# sourceMappingURL=claude.js.map