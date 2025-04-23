/**
 * Common type definitions for the MAGI system.
 *
 * THIS FILE IS LOCATED AT common/shared-types.ts
 * DO NOT COPY INTO ANOTHER LOCATION DURING DEVELOPMENT
 */
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace NodeJS {
        interface ProcessEnv {
            NODE_ENV: 'development' | 'production';
            PROCESS_ID: string;
            CONTROLLER_PORT: string;
            HOST_HOSTNAME: string;
            OPENROUTER_API_KEY?: string;
            OPENAI_API_KEY?: string;
            ANTHROPIC_API_KEY?: string;
            GOOGLE_API_KEY?: string;
            XAI_API_KEY?: string;
            DEEPSEEK_API_KEY?: string;
            BRAVE_API_KEY?: string;
            PROJECT_REPOSITORIES?: string;
            PROJECT_PARENT_PATH?: string;
            PROCESS_PROJECTS?: string;
        }
    }
}

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
    onToolCall?: (toolCall: ToolCall) => void;
    onToolResult?: (toolCall: ToolCall, result: string) => void;
    export(): AgentExportDefinition;
    asTool(): ToolFunction;
}

export interface AgentProcess {
    processId: string;
    started: Date;
    status:
        | 'started'
        | 'running'
        | 'waiting'
        | 'completed'
        | 'failed'
        | 'terminated';
    tool: ProcessToolType;
    command: string;
    name: string;
    output?: string;
    error?: string;
    history?: ResponseInput;
    project?: string[]; // List of git repositories to mount
}

export type ToolParameterType =
    | 'string'
    | 'number'
    | 'boolean'
    | 'object'
    | 'array'
    | 'null';
export const validToolParameterTypes: ToolParameterType[] = [
    'string',
    'number',
    'boolean',
    'object',
    'array',
    'null',
];

/**
 * Tool parameter type definitions using strict schema format for OpenAI function calling
 */
export interface ToolParameter {
    type: ToolParameterType;
    description?: string;
    enum?: string[];
    items?: ToolParameter | { type: ToolParameterType; enum?: string[] };
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
    injectAgentId?: boolean;
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

export type ToolParameterMap = {
    [key: string]:
        | string
        | {
              name?: string;
              description?: string;
              type?: ToolParameterType;
              enum?: string[];
              optional?: boolean;
          };
};

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
    modelClass?: ModelClassID;
    modelSettings?: ModelSettings;
    maxToolCalls?: number;
    maxToolCallRoundsPerTurn?: number; // Maximum number of tool call rounds per turn
    jsonSchema?: object; // JSON schema definition for structured output

    onToolCall?: (toolCall: ToolCall) => Promise<void>;
    onToolResult?: (toolCall: ToolCall, result: string) => Promise<void>;
    onRequest?: (
        agent: AgentInterface,
        messages: ResponseInput
    ) => Promise<[any, ResponseInput]>;
    onResponse?: (response: string) => Promise<string>;
    onThinking?: (message: ResponseThinkingMessage) => Promise<void>;
    tryDirectExecution?: (
        messages: ResponseInput
    ) => Promise<ResponseInput | null>; // Add this line

    params?: ToolParameterMap; // Map of parameter names to their definitions
    processParams?: (
        agent: AgentInterface,
        params: Record<string, any>
    ) => Promise<{
        prompt: string;
        intelligence?: 'low' | 'standard' | 'high';
    }>;
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
    top_k?: number;
    max_tokens?: number;
    stop_sequence?: string;
    seed?: number;
    text?: { format: string };
    tool_choice?:
        | 'auto'
        | 'none'
        | 'required'
        | { type: string; function: { name: string } };
    json_schema?: object; // JSON schema for structured output
    force_json?: boolean; // Force JSON output even if model doesn't natively support it

    // --- Multi-Model Ensemble Settings (Approach 1) ---
    /** Enable diverse multi-model sampling with LLM-as-Judge for response selection. */
    enableDiverseEnsemble?: boolean;
    /** Number of diverse models to sample in the ensemble (default: 3). */
    ensembleSamples?: number;
    /** Temperature for Softmax normalization of judge scores (default: 1.0). */
    ensembleTemperature?: number;
    /** Specific model ID to use as the judge LLM (defaults to agent's model or a strong reasoning model). */
    ensembleJudgeClass?: ModelClassID;
    /** Custom prompt template for the judge LLM. Must include {question} and {response} placeholders. */
    ensembleJudgePrompt?: string;
    /** Optional: Explicit list of model IDs to sample from for the ensemble. */
    ensembleModelPool?: string[];
    /** Enable refinement of the ensemble response using a separate model */
    enableRefinement?: boolean;

    // --- Inter-Agent Validation Settings (Approach 2) ---
    /** Look for confidence signal from workers */
    enableConfidenceMonitoring?: boolean;
    /** Instruct worker agents to include a 'Confidence [0-100]: X' score in their output. */
    enableConfidenceSignaling?: boolean;
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

export interface ToolCallHandler {
    onToolCall?: (toolCall: ToolCall) => void;
    onToolResult?: (toolCall: ToolCall, result: string) => void;
    onEvent?: (event: StreamingEvent) => void;
}

export interface ResponseContentText {
    type: 'input_text';
    text: string;
}

export interface ResponseContentImage {
    type: 'input_image';
    detail: 'high' | 'low' | 'auto';
    file_id?: string;
    image_url?: string;
}

export interface ResponseContentFileInput {
    type: 'input_file';
    file_data?: string;
    file_id?: string;
    filename?: string;
}

/**
 * ResponseContent
 */
export type ResponseContent =
    | string
    | Array<
          ResponseContentText | ResponseContentImage | ResponseContentFileInput
      >;

/**
 * ResponseInput
 */
export type ResponseInput = Array<ResponseInputItem>;
export type ResponseInputItem =
    | ResponseInputMessage
    | ResponseThinkingMessage
    | ResponseOutputMessage
    | ResponseInputFunctionCall
    | ResponseInputFunctionCallOutput;

/**
 * ResponseInputMessage
 */
export interface ResponseInputMessage {
    type?: 'message';
    name?: string; // deprecated
    content: ResponseContent;
    role: 'user' | 'system' | 'developer';
    status?: 'in_progress' | 'completed' | 'incomplete';
}

/**
 * ResponseThinkingMessage
 */
export interface ResponseThinkingMessage {
    type: 'thinking';
    content: ResponseContent;
    signature?: ResponseContent;
    role: 'assistant';
    status?: 'in_progress' | 'completed' | 'incomplete';
}

/**
 * ResponseOutputMessage
 */
export interface ResponseOutputMessage {
    type: 'message';
    content: ResponseContent;
    role: 'assistant';
    status: 'in_progress' | 'completed' | 'incomplete';
}

/**
 * Tool call data structure
 */
export interface ResponseInputFunctionCall {
    type: 'function_call';
    call_id: string;
    name: string;
    arguments: string;
    id?: string;
    status?: 'in_progress' | 'completed' | 'incomplete';
}

/**
 * Tool call data structure
 */
export interface ResponseInputFunctionCallOutput {
    type: 'function_call_output';
    call_id: string;
    name?: string;
    output: string;
    id?: string;
    status?: 'in_progress' | 'completed' | 'incomplete';
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
    | 'connected'
    | 'command_start'
    | 'command_done'
    | 'project_create'
    | 'project_ready'
    | 'project_update_description'
    | 'project_update_overview'
    | 'project_add_history'
    | 'project_get_details'
    | 'process_start'
    | 'process_running'
    | 'process_updated'
    | 'process_done'
    | 'process_failed'
    | 'process_waiting'
    | 'process_terminated'
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
    | 'file_start'
    | 'file_delta'
    | 'file_complete'
    | 'cost_update'
    | 'system_status'
    | 'quota_update'
    | 'screenshot'
    | 'error';

/**
 * Base streaming event interface
 */
export interface StreamEvent {
    type: StreamEventType;
    agent?: AgentExportDefinition;
    timestamp?: string; // Timestamp for the event, shared by all event types
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
    targetProcessId: string;
    command: string;
    timestamp?: string; // Timestamp for the event
}

/**
 * Project updated streaming event
 */
export interface ProjectEvent extends StreamEvent {
    type:
        | 'project_create'
        | 'project_ready'
        | 'project_update_description'
        | 'project_update_overview'
        | 'project_add_history'
        | 'project_get_details';
    project: string;
    description?: string;
    overview?: string;
    action?: string;
    taskId?: string;
}

export type ProcessToolType = 'research_engine' | 'godel_machine' | 'run_task';

/**
 * Agent updated streaming event
 */
export interface ProcessEvent extends StreamEvent {
    type:
        | 'process_start'
        | 'process_running'
        | 'process_updated'
        | 'process_done'
        | 'process_failed'
        | 'process_waiting'
        | 'process_terminated';
    agentProcess?: AgentProcess;
    output?: string;
    error?: string;
    history?: ResponseInput;
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
    type: 'message_start' | 'message_delta' | 'message_complete';
    content: string;
    message_id: string; // Added message_id for tracking deltas and completes
    order?: number; // Optional order property for message sorting
    thinking_content?: string;
    thinking_signature?: string;
}

/**
 * Message streaming event
 */
export interface FileEvent extends StreamEvent {
    type: 'file_start' | 'file_delta' | 'file_complete';
    message_id: string; // Added message_id for tracking deltas and completes
    mime_type?: string;
    data_format: 'base64';
    data: string;
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
    thinking_content?: string; // Added for compatibility with client code
    timestamp?: string; // Timestamp for the event
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
 * Audio streaming event
 */
export interface AudioEvent extends StreamEvent {
    type: 'audio_stream';
    timestamp: string;
    chunkIndex?: number;
    isFinalChunk?: boolean;
    data?: string;
    format?: string;
    pcmParameters?: {
        sampleRate?: number;
        channels?: number;
        bitDepth?: number;
    };
}

/**
 * Screenshot streaming event
 */
export interface ScreenshotEvent extends StreamEvent {
    type: 'screenshot';
    data: string; // Base64 encoded image data
    timestamp: string;
    url?: string; // Optional current URL
    viewport?: {
        // Optional viewport rectangle for cropping/highlighting
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

/**
 * Interface for model usage data
 */
export interface ModelUsage {
    model: string;
    cost?: number;
    input_tokens?: number; // Made optional to match model_data.ts
    output_tokens?: number; // Made optional to match model_data.ts
    cached_tokens?: number;
    image_count?: number; // Added to match model_data.ts
    metadata?: Record<string, any>; // Changed to 'any' for flexibility
    timestamp?: string | Date; // Support both string and Date types
    isFreeTierUsage?: boolean; // Added flag for free tier usage
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
    models: Record<string, { cost: number; calls: number }>; // Per-model cost and call count
}

/**
 * Cost update streaming event
 */
export interface CostUpdateEvent extends StreamEvent {
    type: 'cost_update';
    usage: ModelUsage;
    thought_delay?: number;
}

/**
 * Cost update streaming event
 */
export interface SystemStatusEvent extends StreamEvent {
    type: 'system_status';
    status: string;
}

/**
 * Quota update streaming event
 */
export interface QuotaUpdateEvent extends StreamEvent {
    type: 'quota_update';
    quotas: Record<string, any>;
}

/**
 * Union type for all streaming events
 */
export type StreamingEvent =
    | ConnectedEvent
    | CommandEvent
    | ProjectEvent
    | ProcessEvent
    | AgentEvent
    | MessageEvent
    | FileEvent
    | TalkEvent
    | ToolEvent
    | ErrorEvent
    | CostUpdateEvent
    | SystemStatusEvent
    | QuotaUpdateEvent
    | AudioEvent
    | ScreenshotEvent;

/**
 * Process status type (used by controller)
 */
export type ProcessStatus =
    | 'running'
    | 'completed'
    | 'failed'
    | 'terminated'
    | 'ending';

/**
 * MagiMessage format for communication between containers and controller
 */
export interface MagiMessage {
    processId: string;
    event: StreamingEvent;
}

/**
 * Global cost data structure for the controller
 */
export interface GlobalCostData {
    usage: CostUpdateData; // The accumulated global usage data
    costPerMinute: number; // Calculated cost per minute since system start
    numProcesses: number; // Current number of tracked processes
    systemStartTime: string; // ISO string timestamp of when tracking started
}

// Socket.io event interfaces

/**
 * Event sent when a new process is created
 */
export interface ProcessCreateEvent {
    id: string; // Process ID
    command: string; // Command that created the process
    name: string;
    status: ProcessStatus; // Initial status (usually 'running')
    colors: {
        rgb: string; // Primary color (rgb)
        bgColor: string; // Background color (rgba)
        textColor: string; // Text color (rgba)
    };
}

/**
 * Event sent when new logs are available for a process
 */
export interface ProcessLogsEvent {
    id: string; // Process ID
    logs: string; // Log content (may include markdown)
}

/**
 * Event sent when a structured message from a MAGI container is available
 */
export interface ProcessMessageEvent {
    id: string; // Process ID
    message: MagiMessage; // Structured message from the container
}

/**
 * Event sent when a process status changes
 */
export interface ProcessUpdateEvent {
    id: string; // Process ID
    status: ProcessStatus; // New status
}

/**
 * Event for sending a command to a specific process
 */
export interface ProcessCommandEvent {
    processId: string; // Target process ID
    command: string; // Command to send
    sourceProcessId?: string; // Optional source process ID for process-to-process communication
}

/**
 * Event for server information sent to clients
 */
export interface ServerInfoEvent {
    version: string; // Server version
}

/**
 * Position for absolute positioning of boxes
 */
export interface BoxPosition {
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
}

/**
 * Client-side DOM element references for processes
 */
export interface ProcessElement {
    box: HTMLElement; // Container element
    logs: HTMLElement; // Log output container
    status: HTMLElement; // Status indicator
    input?: HTMLInputElement; // Optional process-specific input field
}

/**
 * App settings interface for persisting UI and feature settings
 */
export interface AppSettings {
    uiMode: 'canvas' | 'column';
    isAudioEnabled: boolean;
    isTelegramEnabled: boolean;
}

/**
 * Status of a sequential agent run
 */
export enum RunStatus {
    SUCCESS = 'success',
    FAILURE = 'failure',
    NEEDS_RETRY = 'needs_retry',
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
 * Configuration for individual runner stages
 */
export interface RunnerStageConfig {
    input?: (
        history: ResponseInput,
        lastOutput: Record<string, string>
    ) => ResponseInput; // Prepares the input for the agent based on past conversation history

    agent: () => any; // Returns the agent for this stage

    next: (output: string) => string | null; // Determines the next stage based on the output. Null if this is the last stage
}

/**
 * Complete configuration for runner stages
 */
export type RunnerConfig = {
    [stage: string]: RunnerStageConfig;
};

/**
 * Model provider interface
 */
export interface ModelProvider {
    createResponseStream(
        model: string,
        messages: ResponseInput,
        agent?: any
    ): AsyncGenerator<StreamingEvent>;
}

/**
 * Model class identifier
 */
export type ModelClassID =
    // Model-specific identifiers
    | 'gpt-3.5'
    | 'gpt-4'
    | 'gpt-4-vision'
    | 'claude-haiku'
    | 'claude-sonnet'
    | 'claude-opus'
    | 'claude-3-haiku'
    | 'claude-3-sonnet'
    | 'claude-3-opus'
    | 'gemini-pro'
    | 'gemini-flash'
    | 'deepseek'
    | 'brave'
    | 'command-r'
    | 'llama3'
    | 'llama3-70b'
    | 'mistral-medium'
    | 'mixtral'
    | 'grok-1'
    | 'yi-large'
    | 'yi-small'
    | 'phi3-mini'

    // Capability-based identifiers
    | 'vision'
    | 'vision_mini' // Added for mini vision models
    | 'reasoning'
    | 'code'
    | 'mini'
    | 'summary'
    | 'monologue'
    | 'standard'
    | 'search'
    | 'writing' // Added for writing-focused models
    | 'image_generation' // Added for image generation models
    | 'embedding' // Added for embedding models

    // Embedding model identifiers
    | 'text-embedding-3-large'
    | 'text-embedding-3-small'
    | 'text-embedding-ada';

// --- Custom Signals for Task Flow Control ---

/**
 * Custom error used as a signal to indicate successful task completion.
 * This allows the runner to stop processing immediately when this tool is called.
 */
export class TaskCompleteSignal extends Error {
    public readonly result: string;
    public history?: ResponseInput | undefined;
    constructor(result: string) {
        super('Task completed successfully.');
        this.name = 'TaskCompleteSignal';
        this.result = result;
        // Ensure the prototype chain is set correctly for instanceof checks
        Object.setPrototypeOf(this, TaskCompleteSignal.prototype);
    }
}

/**
 * Custom error used as a signal to indicate a fatal task error.
 * This allows the runner to stop processing immediately when this tool is called.
 */
export class TaskFatalErrorSignal extends Error {
    public readonly errorDetails: string;
    public history?: ResponseInput | undefined;
    constructor(errorDetails: string) {
        super('Task failed due to a fatal error.');
        this.name = 'TaskFatalErrorSignal';
        this.errorDetails = errorDetails;
        // Ensure the prototype chain is set correctly for instanceof checks
        Object.setPrototypeOf(this, TaskFatalErrorSignal.prototype);
    }
}

// ======================================================================
// UNIFIED MESSAGING SYSTEM
// ======================================================================

/**
 * Direction of message flow between system components
 */
export type MessageDirection =
    | 'process->server' // From Magi Process to Controller Server (via WebSocket)
    | 'server->process' // From Controller Server to Magi Process (via WebSocket)
    | 'server->client' // From Controller Server to Controller Client (via Socket.IO)
    | 'client->server'; // From Controller Client to Controller Server (via Socket.IO)

/**
 * Client-to-server message types (extending existing StreamEventType)
 */
export type ClientServerMessageType =
    | 'CLIENT_COMMAND_RUN' // Run a new command
    | 'CLIENT_PROCESS_TERMINATE' // Terminate a process
    | 'CLIENT_PROCESS_COMMAND' // Send a command to a specific process
    | 'CLIENT_SET_PAUSE_STATE' // Set system pause state
    | 'CLIENT_SET_UIMODE_STATE' // Change UI mode
    | 'CLIENT_SET_AUDIO_STATE' // Toggle audio
    | 'CLIENT_SET_TELEGRAM_STATE' // Toggle Telegram
    | 'CLIENT_UPDATE_APP_SETTINGS'; // Update all app settings at once

/**
 * All possible message types
 */
export type MessageType = StreamEventType | ClientServerMessageType;

/**
 * Client->Server message payloads
 */
export interface ClientCommandRunPayload {
    command: string;
}

export interface ClientProcessTerminatePayload {
    processId: string;
}

export interface ClientProcessCommandPayload {
    processId: string;
    command: string;
    sourceProcessId?: string;
}

export interface ClientSetPauseStatePayload {
    pauseState: boolean;
}

export interface ClientSetUIModeStatePayload {
    uiMode: 'column' | 'canvas';
}

export interface ClientSetAudioStatePayload {
    audioState: boolean;
}

export interface ClientSetTelegramStatePayload {
    telegramState: boolean;
}

export interface ClientUpdateAppSettingsPayload {
    settings: AppSettings;
}

/**
 * Maps MessageType to its specific payload type
 */
export type MessagePayloads = {
    // Process->Server & Server->Client payloads (using existing event interfaces)
    connected: Omit<ConnectedEvent, 'type'>;
    command_start: Omit<CommandEvent, 'type'>;
    command_done: Omit<CommandEvent, 'type'>;
    project_create: Omit<ProjectEvent, 'type'>;
    project_ready: Omit<ProjectEvent, 'type'>;
    project_update_description: Omit<ProjectEvent, 'type'>;
    project_update_overview: Omit<ProjectEvent, 'type'>;
    project_add_history: Omit<ProjectEvent, 'type'>;
    project_get_details: Omit<ProjectEvent, 'type'>;
    process_start: Omit<ProcessEvent, 'type'>;
    process_running: Omit<ProcessEvent, 'type'>;
    process_updated: Omit<ProcessEvent, 'type'>;
    process_done: Omit<ProcessEvent, 'type'>;
    process_failed: Omit<ProcessEvent, 'type'>;
    process_waiting: Omit<ProcessEvent, 'type'>;
    process_terminated: Omit<ProcessEvent, 'type'>;
    agent_start: Omit<AgentEvent, 'type'>;
    agent_updated: Omit<AgentEvent, 'type'>;
    agent_done: Omit<AgentEvent, 'type'>;
    message_start: Omit<MessageEvent, 'type'>;
    message_delta: Omit<MessageEvent, 'type'>;
    message_complete: Omit<MessageEvent, 'type'>;
    talk_start: Omit<TalkEvent, 'type'>;
    talk_delta: Omit<TalkEvent, 'type'>;
    talk_complete: Omit<TalkEvent, 'type'>;
    audio_stream: Omit<AudioEvent, 'type'>;
    tool_start: Omit<ToolEvent, 'type'>;
    tool_delta: Omit<ToolEvent, 'type'>;
    tool_done: Omit<ToolEvent, 'type'>;
    file_start: Omit<FileEvent, 'type'>;
    file_delta: Omit<FileEvent, 'type'>;
    file_complete: Omit<FileEvent, 'type'>;
    cost_update: Omit<CostUpdateEvent, 'type'>;
    system_status: Omit<SystemStatusEvent, 'type'>;
    quota_update: Omit<QuotaUpdateEvent, 'type'>;
    screenshot: Omit<ScreenshotEvent, 'type'>;
    error: Omit<ErrorEvent, 'type'>;

    // Client->Server payloads
    CLIENT_COMMAND_RUN: ClientCommandRunPayload;
    CLIENT_PROCESS_TERMINATE: ClientProcessTerminatePayload;
    CLIENT_PROCESS_COMMAND: ClientProcessCommandPayload;
    CLIENT_SET_PAUSE_STATE: ClientSetPauseStatePayload;
    CLIENT_SET_UIMODE_STATE: ClientSetUIModeStatePayload;
    CLIENT_SET_AUDIO_STATE: ClientSetAudioStatePayload;
    CLIENT_SET_TELEGRAM_STATE: ClientSetTelegramStatePayload;
    CLIENT_UPDATE_APP_SETTINGS: ClientUpdateAppSettingsPayload;
};

/**
 * Unified Message Interface
 *
 * This is the core interface that should be used for all communication between
 * system components (Magi processes, Controller server, and Controller client).
 *
 * @typeparam T - Message type
 */
export interface UnifiedMessage<T extends MessageType = MessageType> {
    /** The type of message */
    type: T;

    /** Direction of message flow */
    direction: MessageDirection;

    /** Source/Target process ID where applicable */
    processId?: string;

    /** Timestamp for the message */
    timestamp?: string;

    /** Message-specific payload based on the type */
    payload: MessagePayloads[T];
}

/**
 * Factory functions to create UnifiedMessages in a type-safe way
 */
export const createProcessToServerMessage = <T extends StreamEventType>(
    type: T,
    processId: string,
    payload: MessagePayloads[T]
): UnifiedMessage<T> => ({
    type,
    direction: 'process->server',
    processId,
    timestamp: new Date().toISOString(),
    payload,
});

export const createServerToProcessMessage = <T extends StreamEventType>(
    type: T,
    processId: string,
    payload: MessagePayloads[T]
): UnifiedMessage<T> => ({
    type,
    direction: 'server->process',
    processId,
    timestamp: new Date().toISOString(),
    payload,
});

export const createServerToClientMessage = <T extends StreamEventType>(
    type: T,
    processId: string | undefined,
    payload: MessagePayloads[T]
): UnifiedMessage<T> => ({
    type,
    direction: 'server->client',
    processId,
    timestamp: new Date().toISOString(),
    payload,
});

export const createClientToServerMessage = <T extends ClientServerMessageType>(
    type: T,
    processId: string | undefined,
    payload: MessagePayloads[T]
): UnifiedMessage<T> => ({
    type,
    direction: 'client->server',
    processId,
    timestamp: new Date().toISOString(),
    payload,
});

// Event types
export interface MagiMessage {
    processId: string;
    event: StreamingEvent;
}

export interface ServerMessage {
    type:
        | 'command'
        | 'connect'
        | 'process_event'
        | 'project_ready'
        | 'system_message'
        | 'system_command';
}

export interface CommandMessage extends ServerMessage {
    type: 'command' | 'connect';
    command: string;
    args?: {
        sourceProcessId?: string; // Added for process-to-process communication
        [key: string]: any;
    };
}

export interface ProjectMessage extends ServerMessage {
    type: 'project_ready';
    project: string;
}

export interface SystemMessage extends ServerMessage {
    type: 'system_message';
    message: string;
}

export interface SystemCommandMessage extends ServerMessage {
    type: 'system_command';
    command: string;
}

export interface ProcessEventMessage extends ServerMessage {
    type: 'process_event';
    processId: string;
    event: StreamingEvent;
}

export interface ContainerConnection {
    processId: string;
    lastMessage: Date;
    messageHistory: MagiMessage[];
}

// Event handler type
export type EventHandler = (
    event: any,
    sourceProcessId?: string
) => Promise<any>;
