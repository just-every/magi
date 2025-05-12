/**
 * Test script to verify the fix for the OpenAI model provider
 * regarding reasoning items in requests.
 *
 * This script tests that reasoning items are only included when
 * both the current model and source model are o-class models.
 */

import { OpenAIProvider } from '../magi/src/model_providers/openai.js';
import { Agent } from '../magi/src/utils/agent.js';
import { AgentExportDefinition, ResponseInput, ToolFunction } from '../common/shared-types.js';

// Mock Agent class for testing
class MockAgent implements Agent {
    agent_id: string;
    name: string;
    description: string;
    instructions: string;
    modelSettings: Record<string, unknown>;
    maxToolCalls: number;
    args: Record<string, unknown> = {}; // Required by Agent interface

    constructor(agent_id: string, modelSettings: Record<string, unknown> = {}) {
        this.agent_id = agent_id;
        this.name = "TestAgent";
        this.description = "Test agent for model provider testing";
        this.instructions = "Test instructions";
        this.modelSettings = modelSettings;
        this.maxToolCalls = 10;
    }

    getTools(): ToolFunction[] {
        return [];
    }

    export(): AgentExportDefinition {
        return {
            agent_id: this.agent_id,
            name: this.name
        };
    }

    asTool(): ToolFunction {
        throw new Error("Not implemented");
    }
}

/**
 * Test function to verify handling of thinking messages with different models
 */
async function testReasoningItems() {
    console.log("=== Starting OpenAI Provider Reasoning Test ===");

    // Create an instance of OpenAIProvider
    const provider = new OpenAIProvider('fake-api-key');

    // Don't try to type-check this mock - we're deliberately creating a simpler mock
    // than what the OpenAI API expects
    // @ts-expect-error - we're mocking private property for testing
    provider.client = {
        responses: {
            // Simplified mock that just logs params and returns our mock stream
            create: function mockCreate(params: unknown) {
                // Just log the request parameters and return a mock stream
                console.log("\nRequest parameters:", JSON.stringify(params, null, 2));
                return mockStream();
            }
        }
    };

    // Mock agent
    const agent = new MockAgent("test-agent");

    // Test 1: o-class model with thinking from o-class model - should include reasoning
    console.log("\n=== Test 1: o-class model with thinking from o-class model ===");
    // @ts-expect-error - Using simplified message structure for testing
    const messages1: ResponseInput = [
        {
            type: "thinking" as const,
            content: "This is reasoning from o200-mini",
            thinking_id: "rs_abcd1234-0",
            model: "o200-mini",  // Source model is o-class
            role: "assistant" as const,   // Required for ResponseThinkingMessage
            status: "completed"
        }
    ];

    // Call createResponseStream with o-class model
    const stream1 = provider.createResponseStream("o200", messages1, agent);

    // Just start the generator to trigger the request
    try {
        const first = await stream1.next();
        console.log("Stream first result:", first);
    } catch (error) {
        console.error("Error in stream1:", error);
    }

    // Test 2: non-o-class model with thinking from o-class model - should NOT include reasoning
    console.log("\n=== Test 2: non-o-class model with thinking from o-class model ===");
    // @ts-expect-error - Using simplified message structure for testing
    const messages2: ResponseInput = [
        {
            type: "thinking" as const,
            content: "This is reasoning from o200",
            thinking_id: "rs_abcd1234-0",
            model: "o200",  // Source model is o-class
            role: "assistant" as const,
            status: "completed"
        }
    ];

    // Call createResponseStream with non-o-class model
    const stream2 = provider.createResponseStream("gpt-4o-mini", messages2, agent);

    // Just start the generator to trigger the request
    try {
        const first = await stream2.next();
        console.log("Stream first result:", first);
    } catch (error) {
        console.error("Error in stream2:", error);
    }

    // Test 3: o-class model with thinking from non-o-class model - should NOT include reasoning
    console.log("\n=== Test 3: o-class model with thinking from non-o-class model ===");
    // @ts-expect-error - Using simplified message structure for testing
    const messages3: ResponseInput = [
        {
            type: "thinking" as const,
            content: "This is reasoning from non-o model",
            thinking_id: "rs_abcd1234-0",
            model: "gpt-4",  // Source model is not o-class
            role: "assistant" as const,
            status: "completed"
        }
    ];

    // Call createResponseStream with o-class model
    const stream3 = provider.createResponseStream("o200", messages3, agent);

    // Just start the generator to trigger the request
    try {
        const first = await stream3.next();
        console.log("Stream first result:", first);
    } catch (error) {
        console.error("Error in stream3:", error);
    }

    console.log("\n=== OpenAI Provider Reasoning Test Complete ===");
}

// Mock stream function
function mockStream() {
    const mockEvents = [
        { type: "response.output_text.delta", delta: "This is a mock response", item_id: "mock_item" },
        { type: "response.output_text.done", text: "This is a mock response", item_id: "mock_item" }
    ];

    return {
        [Symbol.asyncIterator]() {
            let index = 0;

            return {
                async next() {
                    if (index < mockEvents.length) {
                        return { done: false, value: mockEvents[index++] };
                    } else {
                        return { done: true, value: undefined };
                    }
                }
            };
        }
    };
}

// Run the test
testReasoningItems().catch(error => {
    console.error("Test failed:", error);
});
