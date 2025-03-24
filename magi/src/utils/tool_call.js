"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processToolCall = processToolCall;
exports.handleToolCall = handleToolCall;
exports.createToolFunction = createToolFunction;
async function processToolCall(toolCall, agent) {
    try {
        const { tool_calls } = toolCall;
        if (!tool_calls || tool_calls.length === 0) {
            return 'No tool calls found in event';
        }
        const toolCallPromises = tool_calls.map(async (call) => {
            try {
                if (!call || !call.function || !call.function.name) {
                    console.error('Invalid tool call structure:', call);
                    return {
                        tool: null,
                        error: 'Invalid tool call structure',
                        input: call
                    };
                }
                let parsedArgs = {};
                try {
                    if (call.function.arguments && call.function.arguments.trim()) {
                        parsedArgs = JSON.parse(call.function.arguments);
                    }
                }
                catch (parseError) {
                    console.error('Error parsing arguments:', parseError);
                    parsedArgs = { _raw: call.function.arguments };
                }
                const result = await handleToolCall(call, agent);
                const toolResult = {
                    tool: call.function.name,
                    input: parsedArgs,
                    output: result
                };
                const { function: { name } } = call;
                console.log(`[Tool] ${name} executed successfully`, result);
                return toolResult;
            }
            catch (error) {
                console.error('Error executing tool:', error);
                let toolName = 'unknown';
                let toolInput = {};
                if (call && call.function) {
                    toolName = call.function.name || 'unknown';
                    try {
                        if (call.function.arguments && call.function.arguments.trim()) {
                            toolInput = JSON.parse(call.function.arguments);
                        }
                    }
                    catch (e) {
                        toolInput = { _raw: call.function.arguments };
                    }
                }
                return {
                    tool: toolName,
                    input: toolInput,
                    error: String(error)
                };
            }
        });
        const results = await Promise.all(toolCallPromises);
        return JSON.stringify(results, null, 2);
    }
    catch (error) {
        console.error('Error processing tool call:', error);
        return `{"error": "${String(error).replace(/"/g, '\\"')}"}`;
    }
}
async function handleToolCall(toolCall, agent) {
    if (!toolCall.function || !toolCall.function.name) {
        throw new Error('Invalid tool call structure: missing function name');
    }
    const { function: { name, arguments: argsString } } = toolCall;
    if (agent && agent.onToolCall) {
        try {
            agent.onToolCall(toolCall);
        }
        catch (error) {
            console.error('Error in onToolCall handler:', error);
        }
    }
    let args;
    try {
        if (!argsString || argsString.trim() === '') {
            args = {};
        }
        else {
            args = JSON.parse(argsString);
        }
    }
    catch (error) {
        console.error('Error parsing tool arguments:', error);
        console.error(`Arguments string: ${argsString}`);
        throw new Error(`Invalid JSON in tool arguments: ${error?.message || String(error)}`);
    }
    if (!agent.tools) {
        throw new Error(`Agent ${agent.name} has no tools defined`);
    }
    const tool = agent.tools.find(tool => tool.definition.function.name === name);
    if (!tool) {
        throw new Error(`Tool ${name} not found in agent ${agent.name}`);
    }
    try {
        let result;
        if (typeof args === 'object' && args !== null) {
            const paramNames = Object.keys(tool.definition.function.parameters.properties);
            console.log('***paramNames:', paramNames);
            if (paramNames.length > 0) {
                const orderedArgs = paramNames.map((param) => {
                    const value = args[param];
                    const paramSpec = tool.definition.function.parameters.properties[param];
                    console.log(`****Tool ${name} param: ${param}, value: ${value}, spec:`, paramSpec);
                    if (paramSpec && paramSpec.type) {
                        if (paramSpec.type === 'boolean' && typeof value !== 'boolean') {
                            return value === 'true' || value === true;
                        }
                        if (paramSpec.type === 'number' && typeof value !== 'number') {
                            return Number(value);
                        }
                    }
                    return value;
                });
                console.log('***orderedArgs:', orderedArgs);
                result = await tool.function(...orderedArgs);
            }
            else {
                const argValues = Object.values(args);
                result = await tool.function(...argValues);
            }
        }
        else {
            result = await tool.function(args);
        }
        if (agent && agent.onToolResult) {
            try {
                agent.onToolResult(result);
            }
            catch (error) {
                console.error('Error in onToolResult handler:', error);
            }
        }
        return result;
    }
    catch (error) {
        console.error(`Error executing tool ${name}:`, error);
        throw new Error(`Error executing tool ${name}: ${error?.message || String(error)}`);
    }
}
function createToolFunction(func, description, paramMap, returns) {
    const funcStr = func.toString();
    const funcName = func.name;
    let toolDescription = description || `Tool for ${funcName}`;
    if (returns) {
        toolDescription += ` Returns: ${returns}`;
    }
    const paramMatch = funcStr.match(/\(([^)]*)\)/);
    const properties = {};
    const required = [];
    if (paramMatch && paramMatch[1]) {
        const params = paramMatch[1].split(',').map(p => p.trim()).filter(Boolean);
        for (const param of params) {
            const nameMatch = param.match(/^(\w+)(?:\s*:\s*([^=]+))?(?:\s*=\s*.+)?$/);
            if (nameMatch) {
                const paramName = nameMatch[1];
                const tsParamType = (nameMatch[2] || '').trim();
                let paramInfo = paramMap?.[paramName];
                if (typeof paramInfo === 'string') {
                    paramInfo = { description: paramInfo };
                }
                const apiParamName = paramInfo?.name || paramName;
                let paramType = 'string';
                if (paramInfo?.type) {
                    paramType = paramInfo.type;
                }
                else if (tsParamType === 'number') {
                    paramType = 'number';
                }
                else if (tsParamType === 'boolean') {
                    paramType = 'boolean';
                }
                const paramDescription = paramInfo?.description;
                properties[apiParamName] = {
                    type: paramType,
                    description: paramDescription || `The ${paramName} parameter`
                };
                if (!param.includes('=')) {
                    required.push(apiParamName);
                }
            }
        }
    }
    return {
        function: func,
        definition: {
            type: 'function',
            function: {
                name: funcName,
                description: toolDescription,
                parameters: {
                    type: 'object',
                    properties,
                    required
                }
            }
        }
    };
}
//# sourceMappingURL=tool_call.js.map