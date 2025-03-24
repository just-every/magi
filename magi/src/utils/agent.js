"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Agent = void 0;
const uuid_1 = require("uuid");
const communication_js_1 = require("./communication.js");
const runner_js_1 = require("./runner.js");
class Agent {
    constructor(definition, modelSettings) {
        this.agent_id = definition.agent_id || (0, uuid_1.v4)();
        this.name = definition.name;
        this.description = definition.description;
        this.instructions = definition.instructions;
        this.tools = definition.tools || [];
        this.model = definition.model;
        this.modelClass = definition.modelClass;
        this.modelSettings = modelSettings;
        if (definition.workers) {
            this.workers = definition.workers.map((createAgentFn) => {
                const agent = createAgentFn();
                agent.parent = this;
                return agent;
            });
            this.tools = this.tools.concat(this.workers.map((worker) => worker.asTool()));
        }
    }
    asTool() {
        let description = `An AI agent called ${this.name}.\n\n${this.description}`;
        if (this.tools) {
            description += '\n\nThis agent has access to the following tools:\n';
            this.tools.forEach(tool => {
                description += `- ${tool.definition.function.name}: ${tool.definition.function.description}\n`;
            });
            description += '\nUse the tool list as a guide when to call the agent, but generally you should let the agent decide which tools to use. You do not need to specify the tools in the prompt, as the agent will automatically choose the best tool for the task.';
        }
        return {
            function: (...args) => runAgentTool(this, String(args[0])),
            definition: {
                type: 'function',
                function: {
                    name: this.name,
                    description,
                    parameters: {
                        type: 'object',
                        properties: {
                            prompt: {
                                type: 'string',
                                description: 'The task or question for the agent to process. The agent only has the information you provide in this prompt. They have no other context beyond this. As all your agents are AI agents, you should provide them with sufficient context to complete their tasks. The best approach is to give them an overall view of the general task and their specific goal within that task. Agents are expected to work autonomously, so will rarely ask additional questions.'
                            }
                        },
                        required: ['prompt']
                    }
                }
            }
        };
    }
    export() {
        const agentExport = {
            agent_id: this.agent_id,
            name: this.name,
        };
        if (this.model) {
            agentExport.model = this.model;
        }
        if (this.parent) {
            agentExport.parent = this.parent.export();
        }
        return agentExport;
    }
}
exports.Agent = Agent;
async function runAgentTool(agent, prompt) {
    const messages = [{ role: 'user', content: prompt }];
    let toolResultsToInclude = '';
    const toolCalls = [];
    try {
        const onToolCall = (toolCall) => {
            console.log(`${agent.name} intercepted tool call:`, toolCall);
            toolCalls.push(toolCall);
        };
        const onToolResult = (result) => {
            try {
                console.log(`${agent.name} intercepted tool result:`, result);
                if (result) {
                    const resultString = typeof result === 'string'
                        ? result
                        : JSON.stringify(result, null, 2);
                    toolResultsToInclude += resultString + '\n';
                    console.log(`${agent.name} captured tool result: ${resultString.substring(0, 100)}...`);
                }
            }
            catch (err) {
                console.error(`Error processing intercepted tool result in ${agent.name}:`, err);
            }
        };
        agent.onToolCall = onToolCall;
        agent.onToolResult = onToolResult;
        const comm = (0, communication_js_1.getCommunicationManager)();
        console.log(`runAgentTool using Runner.runStreamedWithTools for ${agent.name}`, prompt);
        const handlers = {
            onEvent: (event) => {
                comm.send(event);
                if (event.type === 'tool_done') {
                    try {
                        const toolEvent = event;
                        const results = toolEvent.results;
                        if (results) {
                            const resultString = typeof results === 'string'
                                ? results
                                : JSON.stringify(results, null, 2);
                            if (!toolResultsToInclude.includes(resultString.substring(0, Math.min(50, resultString.length)))) {
                                toolResultsToInclude += resultString + '\n';
                                console.log(`${agent.name} captured tool result from stream: ${resultString.substring(0, 100)}...`);
                            }
                        }
                    }
                    catch (err) {
                        console.error(`Error processing tool result in ${agent.name}:`, err);
                    }
                }
            }
        };
        let response = await runner_js_1.Runner.runStreamedWithTools(agent, prompt, messages, handlers);
        if (response && toolResultsToInclude &&
            !response.includes(toolResultsToInclude.substring(0, Math.min(50, toolResultsToInclude.length)))) {
            console.log(`${agent.name} appending tool results to response`);
            response += '\n\nTool Results:\n' + toolResultsToInclude;
        }
        console.log(`${agent.name} final response: ${response}`);
        return response || `No response from ${agent.name.toLowerCase()}`;
    }
    catch (error) {
        console.error(`Error in ${agent.name}: ${error}`);
        return `Error in ${agent.name}: ${error}`;
    }
}
//# sourceMappingURL=agent.js.map