/**
 * Shared type definitions for the MAGI System
 * Used by both client and server
 */

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
			DEEPSEEK_API_KEY?: string;
			BRAVE_API_KEY?: string;
			PROJECT_PARENT_PATH?: string;
			PROJECT_REPOSITORIES?: string;
		}
	}
}
// Define types for communication with magi containers
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
	| 'audio_stream'
    | 'tool_start'
    | 'tool_delta'
    | 'tool_done'
    | 'cost_update'
    | 'branch_review'
    | 'pull_request'
    | 'project_create'
    | 'project_ready'
    | 'process_start'
    | 'process_running'
    | 'process_updated'
    | 'process_done'
	| 'process_waiting'
	| 'process_terminated'
    | 'system_message'
    | 'process_event'
    | 'error';

// Basic agent definition for messages
export interface AgentExportDefinition {
    agent_id: string;
    name: string;
    parent?: AgentExportDefinition;
	model?: string;
	modelClass?: string;
}

// Basic tool call interface
export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

// Base streaming event interface
export interface StreamEvent {
    type: StreamEventType;
    agent?: AgentExportDefinition;
    timestamp?: string;
}

// Connected event
export interface ConnectedEvent extends StreamEvent {
    type: 'connected';
    timestamp: string;
}

// Command event
export interface CommandEvent extends StreamEvent {
    type: 'command_start' | 'command_done';
    command: string;
}

// Agent event
export interface AgentEvent extends StreamEvent {
    type: 'agent_start' | 'agent_updated' | 'agent_done';
    agent: AgentExportDefinition;
    input?: string;
}

// Message event
export interface MessageEvent extends StreamEvent {
    type: 'message_start' | 'message_delta' | 'message_complete';
    content: string;
    message_id: string;
    order?: number;
	thinking_content?: string;
	thinking_signature?: string;
}

/**
 * Message streaming event
 */
export interface AudioEvent extends StreamEvent {
	type: 'audio_stream';
	timestamp: string;
	chunkIndex?: number;
	isFinalChunk?: boolean;
	data?: string;
	format?: string;
	pcmParameters?: any;
}

/**
 * Message streaming event
 */
export interface TalkEvent extends StreamEvent {
	type: 'talk_start' | 'talk_delta' | 'talk_complete';
	content: string;
	message_id: string; // Added message_id for tracking deltas and completes
	order?: number; // Optional order property for message sorting
	thinking_content?: string;
}

// Tool event
export interface ToolEvent extends StreamEvent {
    type: 'tool_start' | 'tool_delta' | 'tool_done';
    tool_calls: ToolCall[];
    results?: any;
    tool?: string;
    params?: any;
    data?: any;
    result?: any;
}

// New interface for the core cost data structure
export interface CostUpdateData {
	time: {
		start: string;
		now: string;
	};
	cost: {
		total: number; // Total cost accumulated
		last_min: number; // Cost accumulated in the last minute
	};
	tokens: {
		input: number; // Total input tokens accumulated
		output: number; // Total output tokens accumulated
	};
	models: Record<string, { cost: number; calls: number; }>; // Per-model cost and call count
}

export interface ModelUsage {
	model: string,
	cost?: number,
	input_tokens: number,
	output_tokens: number,
	cached_tokens?: number,
	metadata?: Record<string, number>,
	timestamp?: string;
}

/**
 * Cost update streaming event
 */
export interface CostUpdateEvent extends StreamEvent {
	type: 'cost_update';
	usage: ModelUsage;
	thought_delay?: number;
}

// Error event
export interface ErrorEvent extends StreamEvent {
    type: 'error';
    error: string;
}

// Branch Review event
export interface BranchReviewEvent extends StreamEvent {
    type: 'branch_review';
    project: string;
    branch: string;
}

// Pull Request event
export interface PullRequestEvent extends StreamEvent {
    type: 'pull_request';
    project: string;
    from_branch: string;
    to_branch: string;
}

// Union type for all streaming events
export type StreamingEvent = ConnectedEvent | CommandEvent | AgentEvent | MessageEvent | TalkEvent | AudioEvent | ToolEvent | CostUpdateEvent | ErrorEvent | BranchReviewEvent | PullRequestEvent;

/**
 * MagiMessage format for communication between containers and controller
 */
export interface MagiMessage {
	processId: string;
	event: StreamingEvent;
}

// Process status type
export type ProcessStatus = 'running' | 'completed' | 'failed' | 'terminated' | 'ending';


export interface GlobalCostData {
	usage: CostUpdateData; // The accumulated global usage data
	costPerMinute: number; // Calculated cost per minute since system start
	numProcesses: number; // Current number of tracked processes
	systemStartTime: string; // ISO string timestamp of when tracking started
	// latestThoughtDelay?: number; // Optional: could include the most recent delay
}

// Socket.io event interfaces

// Event sent when a new process is created
export interface ProcessCreateEvent {
	id: string;           // Process ID
	command: string;      // Command that created the process
	name: string;
	status: ProcessStatus;       // Initial status (usually 'running')
	colors: {
		rgb: string;		// Primary color (rgb)
		bgColor: string;	// Background color (rgba)
		textColor: string;	// Text color (rgba)
	};
}

// Event sent when new logs are available for a process
export interface ProcessLogsEvent {
	id: string;           // Process ID
	logs: string;         // Log content (may include markdown)
}

// Event sent when a structured message from a MAGI container is available
export interface ProcessMessageEvent {
	id: string;           // Process ID
	message: MagiMessage; // Structured message from the container
}

// Event sent when a process status changes
export interface ProcessUpdateEvent {
	id: string;           // Process ID
	status: ProcessStatus;       // New status
}

// Event for sending a command to a specific process
export interface ProcessCommandEvent {
	processId: string;    // Target process ID
	command: string;      // Command to send
	sourceProcessId?: string; // Optional source process ID for process-to-process communication
}

// Event for server information sent to clients
export interface ServerInfoEvent {
	version: string;      // Server version
}

// Position for absolute positioning of boxes
export interface BoxPosition {
    x: number;
    y: number;
    width: number;
	height: number;
	scale: number;
}

// Client-side DOM element references for processes
export interface ProcessElement {
    box: HTMLElement;      // Container element
    logs: HTMLElement;     // Log output container
    status: HTMLElement;   // Status indicator
    input?: HTMLInputElement; // Optional process-specific input field
}
