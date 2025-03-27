/**
 * Common type definitions for the MAGI system.
 */

// Define the Agent interface to avoid circular dependency
export interface AgentInterface {
    agent_id: string;
    name: string;
    description: string;
    instructions: string;
    parent?: AgentInterface;
    workers?: AgentInterface[];
    tools?: ToolFunction[];
    model?: string;
    modelClass?: string;
    modelSettings?: ModelSettings;
    maxToolCalls?: number;
    onToolCall?: (toolCall: any) => void;
    onToolResult?: (result: any) => void;
    export(): AgentExportDefinition;
    asTool(): ToolFunction;
}

declare global {
	namespace NodeJS {
		interface ProcessEnv {
			NODE_ENV: 'development' | 'production';
			PROCESS_ID: string;
			CONTROLLER_PORT: string;
			HOST_HOSTNAME: string;
			OPENAI_API_KEY?: string;
			ANTHROPIC_API_KEY?: string;
			GOOGLE_API_KEY?: string;
			XAI_API_KEY?: string;
			BRAVE_API_KEY?: string;
		}
	}
}

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

export type ExecutableFunction = (...args: any[]) => Promise<string> | string;
export type WorkerFunction = (...args: any[]) => AgentInterface;

/**
 * Definition for a tool that can be used by an agent
 */
export interface ToolFunction {
	function: ExecutableFunction;
	definition: ToolDefinition;
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
 * Type definition for tool implementation functions
 */
export type ToolImplementationFn = (...args: any[]) => any | Promise<any>;

/**
 * Definition of an agent with model and tool settings
 */
export interface AgentDefinition {
	agent_id?: string;
	name: string;
	description: string;
	instructions: string;
	workers?: WorkerFunction[];
	tools?: ToolFunction[];
	model?: string;
	modelClass?: string;
	maxToolCalls?: number;
}

/**
 * Definition-exportable version of the agent
 */
export interface AgentExportDefinition {
	agent_id: string;
	name: string;
	parent?: AgentExportDefinition;
	model?: string;
	modelClass?: string;
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
	tool_choice?: 'auto' | 'none' | 'required' | { type: string; function: { name: string } };
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


export interface ResponseContentText {
	type: 'input_text',
	text: string,
}

export interface ResponseContentImage {
	type: 'input_image',
	detail: 'high' | 'low' | 'auto',
	file_id?: string,
	image_url?: string,
}

export interface ResponseContentFileInput {
	type: 'input_file',
	file_data?: string,
	file_id?: string,
	filename?: string,
}

/**
 * ResponseContent
 */
export type ResponseContent = string | Array<ResponseContentText | ResponseContentImage | ResponseContentFileInput>;


/**
 * ResponseInput
 */
export type ResponseInput = Array<ResponseInputMessage | ResponseOutputMessage | ResponseInputFunctionCall | ResponseInputFunctionCallOutput>;


/**
 * ResponseInputMessage
 */
export interface ResponseInputMessage {
	type?: 'message',
	name?: string, // deprecated
	content: ResponseContent,
	role: 'user' | 'system' | 'developer',
	status?: 'in_progress' | 'completed' | 'incomplete',
}

/**
 * ResponseInputMessage
 */
export interface ResponseOutputMessage {
	type: 'message',
	content: ResponseContent,
	role: 'assistant',
	status: 'in_progress' | 'completed' | 'incomplete',
}

/**
 * Tool call data structure
 */
export interface ResponseInputFunctionCall {
	type: 'function_call',
	call_id: string,
	name: string,
	arguments: string,
	id?: string,
	status?: 'in_progress' | 'completed' | 'incomplete',
}

/**
 * Tool call data structure
 */
export interface ResponseInputFunctionCallOutput {
	type: 'function_call_output',
	call_id: string,
	output: string,
	id?: string,
	status?: 'in_progress' | 'completed' | 'incomplete',
}

/**
 * Response data from the LLM
 */
export interface LLMMessage {
	name?: string | undefined;
	role: string;
	content: string | null;
	tool_calls?: ToolCall[];
	call_id?: string; // For tool response messages
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
export type StreamEventType =
	'connected'
	| 'command_start'
	| 'command_done'
	| 'agent_start'
	| 'agent_updated'
	| 'agent_done'
	| 'message_start'
	| 'message_delta'
	| 'message_complete'
	| 'talk_start'
	| 'talk_delta'
	| 'talk_complete'
	| 'tool_start'
	| 'tool_delta'
	| 'tool_done'
	| 'error';

/**
 * Base streaming event interface
 */
export interface StreamEvent {
	type: StreamEventType;
	agent?: AgentExportDefinition;
}

/**
 * Agent updated streaming event
 */
export interface ConnectedEvent extends StreamEvent {
	type: 'connected';
	timestamp: string;
}

/**
 * Agent updated streaming event
 */
export interface CommandEvent extends StreamEvent {
	type: 'command_start' | 'command_done';
	command: string;
}

/**
 * Agent updated streaming event
 */
export interface AgentEvent extends StreamEvent {
	type: 'agent_start' | 'agent_updated' | 'agent_done';
	agent: AgentExportDefinition;
	input?: string;
}

/**
 * Message streaming event
 */
export interface MessageEvent extends StreamEvent {
	type: 'message_start' | 'message_delta' | 'message_complete'; // Changed 'message_done' to 'message_complete'
	content: string;
	message_id: string; // Added message_id for tracking deltas and completes
	order?: number; // Optional order property for message sorting
}

/**
 * Message streaming event
 */
export interface TalkEvent extends StreamEvent {
	type: 'talk_start' | 'talk_delta' | 'talk_complete';
	content: string;
	message_id: string; // Added message_id for tracking deltas and completes
	order?: number; // Optional order property for message sorting
}

/**
 * Tool call streaming event
 */
export interface ToolEvent extends StreamEvent {
	type: 'tool_start' | 'tool_delta' | 'tool_done';
	tool_calls: ToolCall[];
	results?: any;
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
export type StreamingEvent = ConnectedEvent | CommandEvent | AgentEvent | MessageEvent | TalkEvent | ToolEvent | ErrorEvent;

/**
 * Status of a sequential agent run
 */
export enum RunStatus {
	SUCCESS = 'success',
	FAILURE = 'failure',
	NEEDS_RETRY = 'needs_retry'
}

/**
 * Result of a sequential agent run
 */
export interface RunResult {
	status: RunStatus;
	response: string;
	next?: string; // Optional name of the next agent to run
	metadata?: any; // Optional metadata to pass to the next agent
}

/**
 * Model provider interface
 */
export interface ModelProvider {
	createResponseStream(
		model: string,
		messages: ResponseInput,
		tools?: ToolFunction[],
		settings?: ModelSettings
	): AsyncGenerator<StreamingEvent>;
}
