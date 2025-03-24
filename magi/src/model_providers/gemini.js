"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.geminiProvider = exports.GeminiProvider = void 0;
require("dotenv/config");
const generative_ai_1 = require("@google/generative-ai");
const uuid_1 = require("uuid");
function convertToGeminiTools(tools) {
    return tools.map(tool => {
        const parameters = JSON.parse(JSON.stringify(tool.definition.function.parameters));
        if (parameters.type) {
            parameters.type = parameters.type.toUpperCase();
        }
        if (parameters.properties) {
            for (const property in parameters.properties) {
                if (parameters.properties[property].type) {
                    parameters.properties[property].type = parameters.properties[property].type.toUpperCase();
                }
            }
        }
        return {
            functionDeclarations: [{
                    name: tool.definition.function.name,
                    description: tool.definition.function.description,
                    parameters: parameters
                }]
        };
    });
}
class GeminiProvider {
    constructor(apiKey) {
        this.client = new generative_ai_1.GoogleGenerativeAI(apiKey || process.env.GOOGLE_API_KEY || '');
        if (!process.env.GOOGLE_API_KEY) {
            throw new Error('Failed to initialize Gemini client. Make sure GOOGLE_API_KEY is set.');
        }
    }
    async *createResponseStream(model, messages, tools, settings) {
        try {
            const genModel = this.client.getGenerativeModel({ model: model });
            const generationConfig = {
                temperature: settings?.temperature || 0.7,
                maxOutputTokens: settings?.max_tokens,
                topK: 40,
                topP: settings?.top_p || 0.95,
            };
            const safetySettings = [
                {
                    category: generative_ai_1.HarmCategory.HARM_CATEGORY_HARASSMENT,
                    threshold: generative_ai_1.HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    category: generative_ai_1.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                    threshold: generative_ai_1.HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    category: generative_ai_1.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                    threshold: generative_ai_1.HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    category: generative_ai_1.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    threshold: generative_ai_1.HarmBlockThreshold.BLOCK_NONE,
                },
            ];
            const geminiMessages = convertMessagesToGeminiFormat(messages);
            let geminiTools = undefined;
            if (tools && tools.length > 0) {
                geminiTools = convertToGeminiTools(tools);
            }
            const requestOptions = {
                generationConfig,
                safetySettings,
            };
            if (geminiTools) {
                requestOptions.tools = geminiTools;
            }
            const chat = genModel.startChat();
            const streamingResult = await chat.sendMessageStream(geminiMessages);
            let currentToolCall = null;
            let contentBuffer = '';
            let sentComplete = false;
            const messageId = (0, uuid_1.v4)();
            let deltaPosition = 0;
            try {
                for await (const chunk of streamingResult.stream) {
                    if (chunk.candidates?.[0]?.content?.parts) {
                        for (const part of chunk.candidates[0].content.parts) {
                            const partAny = part;
                            if (partAny.functionCall) {
                                const functionCall = partAny.functionCall;
                                currentToolCall = {
                                    id: `call_${Date.now()}`,
                                    type: 'function',
                                    function: {
                                        name: functionCall.name,
                                        arguments: typeof functionCall.args === 'string'
                                            ? functionCall.args
                                            : JSON.stringify(functionCall.args)
                                    }
                                };
                                yield {
                                    type: 'tool_start',
                                    tool_calls: [currentToolCall]
                                };
                                currentToolCall = null;
                            }
                            else if (part.text) {
                                yield {
                                    type: 'message_delta',
                                    content: part.text,
                                    message_id: messageId,
                                    order: deltaPosition++
                                };
                                contentBuffer += part.text;
                            }
                        }
                    }
                }
                if (contentBuffer && !sentComplete) {
                    yield {
                        type: 'message_complete',
                        content: contentBuffer,
                        message_id: messageId
                    };
                    sentComplete = true;
                }
            }
            catch (streamError) {
                console.error('Error processing Gemini stream:', streamError);
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
            console.error('Error in Gemini streaming completion:', error);
            yield {
                type: 'error',
                error: String(error)
            };
        }
    }
}
exports.GeminiProvider = GeminiProvider;
function convertMessagesToGeminiFormat(messages) {
    let systemMessage = '';
    let conversation = '';
    for (const message of messages) {
        let role = 'system';
        if ('role' in message) {
            role = message.role;
        }
        let content = '';
        if ('content' in message) {
            if (typeof message.content === 'string') {
                content = message.content;
            }
            else if ('text' in message.content && typeof message.content.text === 'string') {
                content = message.content.text;
            }
        }
        if (role === 'system') {
            systemMessage = content;
        }
        else if (role === 'user') {
            conversation += `User: ${content}\n\n`;
        }
        else if (role === 'assistant') {
            conversation += `Assistant: ${content}\n\n`;
        }
    }
    if (systemMessage) {
        return `${systemMessage}\n\n${conversation}`;
    }
    return conversation;
}
exports.geminiProvider = new GeminiProvider();
//# sourceMappingURL=gemini.js.map