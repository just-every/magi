"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Runner = void 0;
const types_js_1 = require("../types.js");
const model_provider_js_1 = require("../model_providers/model_provider.js");
const constants_js_1 = require("../magi_agents/constants.js");
const model_provider_js_2 = require("../model_providers/model_provider.js");
const tool_call_js_1 = require("./tool_call.js");
class Runner {
    static async *runStreamed(agent, input, conversationHistory = []) {
        const selectedModel = agent.model || (0, model_provider_js_2.getModelFromClass)(agent.modelClass || 'standard');
        const provider = (0, model_provider_js_1.getModelProvider)(selectedModel);
        const messages = [
            { role: 'system', content: agent.instructions },
            ...conversationHistory,
            { role: 'user', content: input }
        ];
        try {
            agent.model = selectedModel;
            yield {
                type: 'agent_start',
                agent: agent.export(),
                input,
            };
            const stream = provider.createResponseStream(selectedModel, messages, agent.tools, agent.modelSettings);
            for await (const event of stream) {
                event.agent = event.agent ? event.agent : agent.export();
                if (!event.agent.model)
                    event.agent.model = selectedModel;
                yield event;
            }
        }
        catch (error) {
            console.error(`[Runner] Error with model ${selectedModel}: ${error}`);
            console.log('[Runner] Attempting fallback to another model');
            let modelsToTry;
            modelsToTry = [...constants_js_1.MODEL_GROUPS['standard']];
            if (agent.modelClass && agent.modelClass !== 'standard') {
                const classModels = constants_js_1.MODEL_GROUPS[agent.modelClass] || [];
                modelsToTry = [...classModels, ...modelsToTry];
            }
            modelsToTry = modelsToTry.filter(model => model !== selectedModel);
            for (const alternativeModel of modelsToTry) {
                try {
                    console.log(`[Runner] Trying alternative model: ${alternativeModel}`);
                    const alternativeProvider = (0, model_provider_js_1.getModelProvider)(alternativeModel);
                    agent.model = alternativeModel;
                    yield {
                        type: 'agent_updated',
                        agent: agent.export()
                    };
                    const alternativeStream = alternativeProvider.createResponseStream(alternativeModel, messages, agent.tools, agent.modelSettings);
                    for await (const event of alternativeStream) {
                        yield event;
                    }
                    console.log(`[Runner] Successfully switched to model: ${alternativeModel}`);
                    return;
                }
                catch (alternativeError) {
                    console.error(`[Runner] Alternative model ${alternativeModel} also failed: ${alternativeError}`);
                }
            }
            console.error('[Runner] All fallback models failed');
            yield {
                type: 'error',
                agent: agent.export(),
                error: `Error using model ${selectedModel} and all fallbacks failed: ${error}`
            };
        }
    }
    static async runStreamedWithTools(agent, input, conversationHistory = [], handlers = {}) {
        let fullResponse = '';
        let collectedToolCalls = [];
        const collectedToolResults = [];
        try {
            const stream = this.runStreamed(agent, input, conversationHistory);
            for await (const event of stream) {
                if (handlers.onEvent) {
                    handlers.onEvent(event);
                }
                const eventType = event.type;
                switch (eventType) {
                    case 'message_delta':
                    case 'message_done':
                    case 'message_complete': {
                        const message = event;
                        if (message.content && message.content.trim()) {
                            if (handlers.onResponse) {
                                handlers.onResponse(message.content);
                            }
                            if (eventType === 'message_complete' || eventType === 'message_done') {
                                fullResponse = message.content;
                            }
                        }
                        break;
                    }
                    case 'tool_start': {
                        const toolEvent = event;
                        if (!toolEvent.tool_calls || toolEvent.tool_calls.length === 0) {
                            continue;
                        }
                        collectedToolCalls = [...collectedToolCalls, ...toolEvent.tool_calls];
                        toolEvent.tool_calls.forEach(call => {
                            let parsedArgs = {};
                            try {
                                if (call.function.arguments && call.function.arguments.trim()) {
                                    parsedArgs = JSON.parse(call.function.arguments);
                                }
                            }
                            catch (parseError) {
                                console.error('Error parsing tool arguments:', parseError);
                                parsedArgs = { _raw: call.function.arguments };
                            }
                            console.log(`[Tool Call] ${call.function.name}:`, parsedArgs);
                        });
                        const toolResult = await (0, tool_call_js_1.processToolCall)(toolEvent, agent);
                        let parsedResults;
                        try {
                            parsedResults = JSON.parse(toolResult);
                        }
                        catch (e) {
                            parsedResults = toolResult;
                        }
                        if (Array.isArray(parsedResults)) {
                            for (let i = 0; i < parsedResults.length; i++) {
                                const result = parsedResults[i];
                                if (i < toolEvent.tool_calls.length) {
                                    collectedToolResults.push({
                                        call_id: toolEvent.tool_calls[i].id,
                                        output: typeof result === 'string' ? result : JSON.stringify(result)
                                    });
                                }
                            }
                        }
                        else {
                            const resultStr = typeof parsedResults === 'string' ?
                                parsedResults : JSON.stringify(parsedResults);
                            if (toolEvent.tool_calls.length > 0) {
                                collectedToolResults.push({
                                    call_id: toolEvent.tool_calls[0].id,
                                    output: resultStr
                                });
                            }
                        }
                        if (handlers.onEvent) {
                            handlers.onEvent({
                                agent: event.agent,
                                type: 'tool_done',
                                tool_calls: toolEvent.tool_calls,
                                results: parsedResults,
                            });
                        }
                        break;
                    }
                    case 'error': {
                        const errorEvent = event;
                        console.error(`[Error] ${errorEvent.error}`);
                        break;
                    }
                }
            }
            if (collectedToolCalls.length > 0 && collectedToolResults.length > 0) {
                console.log(`[Runner] Collected ${collectedToolCalls.length} tool calls, running follow-up with results`);
                let toolCallMessages = [];
                toolCallMessages.push(...conversationHistory);
                toolCallMessages.push({ role: 'user', content: input });
                const messageItems = [...conversationHistory];
                messageItems.push({
                    type: 'message',
                    role: 'user',
                    content: input
                });
                for (const toolCall of collectedToolCalls) {
                    messageItems.push({
                        type: 'function_call',
                        call_id: toolCall.id,
                        name: toolCall.function.name,
                        arguments: toolCall.function.arguments
                    });
                    const result = collectedToolResults.find(r => r.call_id === toolCall.id);
                    if (result) {
                        messageItems.push({
                            type: 'function_call_output',
                            call_id: toolCall.id,
                            output: result.output
                        });
                    }
                }
                toolCallMessages = messageItems;
                console.log('[Runner] Running agent with tool call results');
                const followUpResponse = await this.runStreamedWithTools(agent, '', toolCallMessages, handlers);
                if (followUpResponse) {
                    fullResponse = followUpResponse;
                }
            }
            if (handlers.onComplete) {
                handlers.onComplete();
            }
            return fullResponse;
        }
        catch (error) {
            console.error(`Error in runStreamedWithTools: ${error}`);
            throw error;
        }
    }
    static async runSequential(agentSequence, input, initialStage, maxRetries = 3, maxTotalRetries = 10, handlers = {}) {
        if (!agentSequence[initialStage]) {
            throw new Error(`Initial stage "${initialStage}" not found in agent sequence`);
        }
        const results = {};
        let currentStage = initialStage;
        let currentInput = input;
        let currentMetadata = null;
        let totalRetries = 0;
        const stageRetries = {};
        const stageEventHandler = handlers.onEvent
            ? (event) => handlers.onEvent(event, currentStage)
            : undefined;
        const stageResponseHandler = handlers.onResponse
            ? (content) => handlers.onResponse(content, currentStage)
            : undefined;
        while (currentStage && totalRetries < maxTotalRetries) {
            console.log(`[Runner] Running sequential stage: ${currentStage}`);
            stageRetries[currentStage] = stageRetries[currentStage] || 0;
            if (stageRetries[currentStage] >= maxRetries) {
                console.error(`[Runner] Exceeded max retries (${maxRetries}) for stage: ${currentStage}`);
                results[currentStage] = {
                    status: types_js_1.RunStatus.FAILURE,
                    response: `Exceeded maximum retries (${maxRetries}) for this stage.`
                };
                break;
            }
            try {
                const agent = agentSequence[currentStage](currentMetadata);
                const response = await this.runStreamedWithTools(agent, currentInput, [], {
                    onEvent: stageEventHandler,
                    onResponse: stageResponseHandler
                });
                const result = {
                    status: types_js_1.RunStatus.SUCCESS,
                    response
                };
                if (response.includes('STATUS: NEEDS_RETRY') || response.includes('STATUS:NEEDS_RETRY')) {
                    result.status = types_js_1.RunStatus.NEEDS_RETRY;
                    stageRetries[currentStage]++;
                    totalRetries++;
                    console.log(`[Runner] Stage ${currentStage} requires retry (${stageRetries[currentStage]}/${maxRetries})`);
                }
                else if (response.includes('STATUS: FAILURE') || response.includes('STATUS:FAILURE')) {
                    result.status = types_js_1.RunStatus.FAILURE;
                    console.error(`[Runner] Stage ${currentStage} failed`);
                }
                else {
                    const nextStageMatch = response.match(/NEXT:\s*(\w+)/i);
                    if (nextStageMatch && nextStageMatch[1] && agentSequence[nextStageMatch[1]]) {
                        result.next = nextStageMatch[1];
                    }
                    else {
                        const stages = Object.keys(agentSequence);
                        const currentIndex = stages.indexOf(currentStage);
                        if (currentIndex < stages.length - 1) {
                            result.next = stages[currentIndex + 1];
                        }
                    }
                    const metadataMatch = response.match(/METADATA:\s*({.*})/s);
                    if (metadataMatch && metadataMatch[1]) {
                        try {
                            result.metadata = JSON.parse(metadataMatch[1]);
                        }
                        catch (err) {
                            console.warn(`[Runner] Failed to parse metadata JSON: ${err}`);
                        }
                    }
                }
                results[currentStage] = result;
                if (handlers.onStageComplete) {
                    handlers.onStageComplete(currentStage, result);
                }
                if (result.status === types_js_1.RunStatus.FAILURE) {
                    break;
                }
                else if (result.status === types_js_1.RunStatus.NEEDS_RETRY) {
                    continue;
                }
                if (result.next) {
                    currentStage = result.next;
                    currentInput = response;
                    currentMetadata = result.metadata;
                }
                else {
                    break;
                }
            }
            catch (error) {
                console.error(`[Runner] Error in sequential stage ${currentStage}: ${error}`);
                results[currentStage] = {
                    status: types_js_1.RunStatus.FAILURE,
                    response: `Error: ${error}`
                };
                stageRetries[currentStage]++;
                totalRetries++;
                if (stageRetries[currentStage] >= maxRetries) {
                    console.error(`[Runner] Exceeded max retries for stage ${currentStage}`);
                    break;
                }
            }
        }
        if (handlers.onComplete) {
            handlers.onComplete(results);
        }
        return results;
    }
}
exports.Runner = Runner;
//# sourceMappingURL=runner.js.map