/**
 * Common type definitions for the MAGI system.
 */

/**
 * Tool parameter type definitions using strict schema format for OpenAI function calling
 */
export interface ToolParameter {
  type: string;
  description?: string;
  enum?: string[];
  items?: ToolParameter | { type: string };
  properties?: Record<string, ToolParameter>;
  required?: string[];
  [key: string]: any;
}

/**
 * Definition for a tool that can be used by an agent
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, ToolParameter>;
      required: string[];
    };
  };
}

/**
 * Definition of an agent with model and tool settings
 */
export interface AgentDefinition {
  name: string;
  instructions: string;
  tools: ToolDefinition[];
  model: string;
  handoff_description?: string;
}

/**
 * Model settings for the OpenAI API
 */
export interface ModelSettings {
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  seed?: number;
  response_format?: { type: string };
  tool_choice?: 'auto' | 'any' | { type: string; function: { name: string } };
}

/**
 * Tool call data structure
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Response data from the LLM
 */
export interface LLMMessage {
  name?: string | undefined;
  role: string;
  content: string | null;
}

/**
 * Response data from the LLM
 */
export interface LLMResponse extends LLMMessage {
  role: 'assistant';
  tool_calls?: ToolCall[];
}

/**
 * Streaming event types
 */
export type StreamEventType = 'message' | 'tool_calls' | 'agent_updated' | 'error';

/**
 * Base streaming event interface
 */
export interface StreamEvent {
  type: StreamEventType;
  model: string;
}

/**
 * Message streaming event
 */
export interface MessageEvent extends StreamEvent {
  type: 'message';
  content: string;
}

/**
 * Tool call streaming event
 */
export interface ToolCallEvent extends StreamEvent {
  type: 'tool_calls';
  tool_calls: ToolCall[];
}

/**
 * Agent updated streaming event
 */
export interface AgentUpdatedEvent extends StreamEvent {
  type: 'agent_updated';
  agent: {
    name: string;
    model: string;
  };
}

/**
 * Error streaming event
 */
export interface ErrorEvent extends StreamEvent {
  type: 'error';
  error: string;
}

/**
 * Union type for all streaming events
 */
export type StreamingEvent = MessageEvent | ToolCallEvent | AgentUpdatedEvent | ErrorEvent;

/**
 * Model provider interface
 */
export interface ModelProvider {
  createResponse(
    model: string,
    messages: Array<LLMMessage>,
    tools?: ToolDefinition[],
    settings?: ModelSettings
  ): Promise<LLMResponse>;

  createResponseStream(
    model: string,
    messages: Array<LLMMessage>,
    tools?: ToolDefinition[],
    settings?: ModelSettings
  ): AsyncGenerator<StreamingEvent>;
}
