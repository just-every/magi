"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.grokProvider = exports.GrokProvider = void 0;
require("dotenv/config");
const uuid_1 = require("uuid");
class GrokProvider {
    constructor(apiKey) {
        this.apiKey = apiKey || process.env.XAI_API_KEY || '';
        if (!this.apiKey) {
            throw new Error('Failed to initialize Grok client. Make sure XAI_API_KEY is set.');
        }
    }
    async *createResponseStream(model, messages, tools, settings) {
        try {
            const grokMessages = messages.map(msg => {
                let role = 'system';
                if ('role' in msg) {
                    role = msg.role;
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
                let name = {};
                if ('name' in msg) {
                    name = { name: msg.name };
                }
                return {
                    role,
                    content,
                    name,
                };
            });
            const requestBody = {
                model: model,
                messages: grokMessages,
                stream: true,
                ...(settings?.temperature ? { temperature: settings.temperature } : {}),
                ...(settings?.max_tokens ? { max_tokens: settings.max_tokens } : {}),
                ...(settings?.top_p ? { top_p: settings.top_p } : {})
            };
            if (tools && tools.length > 0) {
                requestBody.tools = tools.map(tool => (tool.definition));
            }
            const requestOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(requestBody)
            };
            const response = await fetch('https://api.x.ai/v1/chat/completions', requestOptions);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Grok API error (${response.status}): ${errorText}`);
            }
            if (!response.body) {
                throw new Error('No response body returned from Grok API');
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let incompleteChunk = '';
            let currentToolCall = null;
            let contentBuffer = '';
            let sentComplete = false;
            const messageId = (0, uuid_1.v4)();
            let deltaPosition = 0;
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    const chunk = incompleteChunk + decoder.decode(value, { stream: true });
                    incompleteChunk = '';
                    const lines = chunk.split('\n');
                    if (!chunk.endsWith('\n') && lines.length > 0) {
                        incompleteChunk = lines.pop() || '';
                    }
                    for (const line of lines) {
                        if (!line.trim())
                            continue;
                        if (!line.startsWith('data: '))
                            continue;
                        const jsonStr = line.slice(6);
                        if (jsonStr === '[DONE]') {
                            if (contentBuffer && !sentComplete) {
                                yield {
                                    type: 'message_complete',
                                    content: contentBuffer,
                                    message_id: messageId
                                };
                                sentComplete = true;
                            }
                            continue;
                        }
                        try {
                            const eventData = JSON.parse(jsonStr);
                            if (eventData.choices && eventData.choices.length > 0) {
                                const choice = eventData.choices[0];
                                if (choice.delta && choice.delta.content) {
                                    yield {
                                        type: 'message_delta',
                                        content: choice.delta.content,
                                        message_id: messageId,
                                        order: deltaPosition++
                                    };
                                    contentBuffer += choice.delta.content;
                                }
                                if (choice.message && choice.message.content) {
                                    if (!choice.delta) {
                                        yield {
                                            type: 'message_delta',
                                            content: choice.message.content,
                                            message_id: messageId,
                                            order: 0
                                        };
                                    }
                                    yield {
                                        type: 'message_complete',
                                        content: choice.message.content,
                                        message_id: messageId
                                    };
                                    sentComplete = true;
                                    contentBuffer = choice.message.content;
                                }
                                if ((choice.delta && choice.delta.tool_calls) ||
                                    (choice.message && choice.message.tool_calls)) {
                                    const toolCalls = choice.delta?.tool_calls || choice.message?.tool_calls;
                                    if (toolCalls && toolCalls.length > 0) {
                                        if (choice.delta?.tool_calls) {
                                            const toolCall = toolCalls[0];
                                            if (!currentToolCall && toolCall.index === 0) {
                                                currentToolCall = {
                                                    id: toolCall.id || `call_${Date.now()}`,
                                                    type: 'function',
                                                    function: {
                                                        name: toolCall.function?.name || '',
                                                        arguments: toolCall.function?.arguments || ''
                                                    }
                                                };
                                            }
                                            else if (currentToolCall) {
                                                if (toolCall.function?.name) {
                                                    currentToolCall.function.name = toolCall.function.name;
                                                }
                                                if (toolCall.function?.arguments) {
                                                    currentToolCall.function.arguments += toolCall.function.arguments;
                                                }
                                            }
                                            if (currentToolCall) {
                                                yield {
                                                    type: 'tool_start',
                                                    tool_calls: [currentToolCall]
                                                };
                                            }
                                        }
                                        else if (choice.message?.tool_calls) {
                                            const toolCall = toolCalls[0];
                                            yield {
                                                type: 'tool_start',
                                                tool_calls: [{
                                                        id: toolCall.id || `call_${Date.now()}`,
                                                        type: 'function',
                                                        function: {
                                                            name: toolCall.function?.name || '',
                                                            arguments: toolCall.function?.arguments || ''
                                                        }
                                                    }]
                                            };
                                            currentToolCall = null;
                                        }
                                    }
                                }
                                if (choice.finish_reason === 'tool_calls' && currentToolCall) {
                                    yield {
                                        type: 'tool_start',
                                        tool_calls: [currentToolCall]
                                    };
                                    currentToolCall = null;
                                }
                                if (choice.finish_reason && contentBuffer && !sentComplete) {
                                    yield {
                                        type: 'message_complete',
                                        content: contentBuffer,
                                        message_id: messageId
                                    };
                                    sentComplete = true;
                                }
                            }
                        }
                        catch (parseError) {
                            console.error('Error parsing Grok API response chunk:', parseError);
                        }
                    }
                }
                if (currentToolCall) {
                    yield {
                        type: 'tool_start',
                        tool_calls: [currentToolCall]
                    };
                }
                if (contentBuffer && !sentComplete) {
                    yield {
                        type: 'message_complete',
                        content: contentBuffer,
                        message_id: messageId
                    };
                }
            }
            catch (streamError) {
                console.error('Error processing Grok stream:', streamError);
                yield {
                    type: 'error',
                    error: String(streamError)
                };
                if (contentBuffer && !sentComplete) {
                    yield {
                        type: 'message_complete',
                        content: contentBuffer,
                        message_id: messageId
                    };
                }
            }
        }
        catch (error) {
            console.error('Error in Grok streaming completion:', error);
            yield {
                type: 'error',
                error: String(error)
            };
            yield {
                type: 'message_complete',
                content: 'Error occurred while generating response. Please try again.',
                message_id: (0, uuid_1.v4)()
            };
        }
    }
}
exports.GrokProvider = GrokProvider;
exports.grokProvider = new GrokProvider();
//# sourceMappingURL=grok.js.map