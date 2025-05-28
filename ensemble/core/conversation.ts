// ================================================================
// Conversation class for managing dialogue state
// ================================================================

import { ResponseInputItem, ResponseOutputMessage, ToolCall } from '../types.js';

/**
 * Manages the state of a conversation as an array of ResponseInputItem
 */
export class Conversation {
    private _entries: ResponseInputItem[];

    constructor(initialEntries?: ResponseInputItem[]) {
        this._entries = initialEntries ? [...initialEntries] : [];
    }

    /**
     * Get read-only access to conversation entries
     */
    public get entries(): ReadonlyArray<ResponseInputItem> {
        return this._entries;
    }

    /**
     * Add a single message to the conversation
     */
    public add(item: ResponseInputItem): void {
        this._entries.push(item);
    }

    /**
     * Add multiple messages to the conversation
     */
    public addMany(items: ResponseInputItem[]): void {
        this._entries.push(...items);
    }

    /**
     * Add a user message to the conversation (convenience method)
     */
    public addUserMessage(content: string, name?: string): ResponseInputItem {
        const message: ResponseInputItem = {
            type: 'message',
            role: 'user',
            content,
            timestamp: Date.now(),
            ...(name && { name })
        };
        this.add(message);
        return message;
    }

    /**
     * Get the last assistant message in the conversation
     */
    public lastAssistantMessage(): ResponseInputItem | undefined {
        for (let i = this._entries.length - 1; i >= 0; i--) {
            const entry = this._entries[i];
            if (entry.type === 'message' && (entry as any).role === 'assistant') {
                return entry;
            }
        }
        return undefined;
    }

    /**
     * Get the last message of any role
     */
    public lastMessage(): ResponseInputItem | undefined {
        return this._entries[this._entries.length - 1];
    }

    /**
     * Get all messages by role
     */
    public getMessagesByRole(role: string): ResponseInputItem[] {
        return this._entries.filter(entry => {
            if (entry.type === 'message') {
                return (entry as any).role === role;
            }
            return false;
        });
    }

    /**
     * Get all tool calls in the conversation
     */
    public getAllToolCalls(): ToolCall[] {
        const toolCalls: ToolCall[] = [];
        for (const entry of this._entries) {
            if (entry.type === 'message' && (entry as any).role === 'assistant' && (entry as any).tool_calls) {
                toolCalls.push(...(entry as any).tool_calls);
            } else if (entry.type === 'function_call' && 'tool_calls' in entry) {
                toolCalls.push(...(entry as any).tool_calls);
            }
        }
        return toolCalls;
    }

    /**
     * Get conversation length (number of entries)
     */
    public get length(): number {
        return this._entries.length;
    }

    /**
     * Check if conversation is empty
     */
    public get isEmpty(): boolean {
        return this._entries.length === 0;
    }

    /**
     * Create a deep clone of the conversation
     */
    public clone(): Conversation {
        // Deep clone entries to avoid reference issues
        const clonedEntries = JSON.parse(JSON.stringify(this._entries));
        return new Conversation(clonedEntries);
    }

    /**
     * Get conversation as a plain array for serialization or direct use
     */
    public toJSON(): ResponseInputItem[] {
        return [...this._entries];
    }

    /**
     * Get a slice of the conversation
     */
    public slice(start?: number, end?: number): Conversation {
        return new Conversation(this._entries.slice(start, end));
    }

    /**
     * Get recent entries (last N entries)
     */
    public recent(count: number): Conversation {
        const startIndex = Math.max(0, this._entries.length - count);
        return this.slice(startIndex);
    }

    /**
     * Clear all entries from the conversation
     */
    public clear(): void {
        this._entries = [];
    }

    /**
     * Remove the last entry from the conversation
     */
    public pop(): ResponseInputItem | undefined {
        return this._entries.pop();
    }

    /**
     * Find entries matching a predicate
     */
    public find(predicate: (entry: ResponseInputItem) => boolean): ResponseInputItem | undefined {
        return this._entries.find(predicate);
    }

    /**
     * Filter entries by a predicate
     */
    public filter(predicate: (entry: ResponseInputItem) => boolean): ResponseInputItem[] {
        return this._entries.filter(predicate);
    }

    /**
     * Check if conversation contains any entries matching a predicate
     */
    public some(predicate: (entry: ResponseInputItem) => boolean): boolean {
        return this._entries.some(predicate);
    }

    /**
     * Get a summary of the conversation structure for debugging
     */
    public getSummary(): string {
        const summary = this._entries.map((entry, index) => {
            let description = `${index}: ${entry.type === 'message' && 'role' in entry ? entry.role : entry.type}`;
            if (entry.type === 'message') {
                const content = typeof entry.content === 'string' ? entry.content : '[complex content]';
                description += ` - ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`;
            } else if (entry.type === 'function_call') {
                description += ` - tool call`;
            } else if (entry.type === 'function_call_output') {
                description += ` - tool result`;
            } else if (entry.type === 'thinking') {
                description += ` - thinking`;
            }
            return description;
        });
        return summary.join('\n');
    }
}