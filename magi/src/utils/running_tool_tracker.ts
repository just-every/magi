/**
 * Tracks functions initiated by operators and overseers that exceed timeout limits
 */
import { v4 as uuidv4 } from 'uuid';
import { addSystemMessage } from './history.js';
import { readableTime } from './date_tools.js';

// Helper function to truncate long strings
const truncateString = (string = '', maxLength = 200) =>
    string.length > maxLength ? `${string.substring(0, maxLength)}…` : string;

// Interface for a running function
export interface RunningTool {
    id: string;
    name: string;
    agent: string;
    args: string;
    status: 'running' | 'completed' | 'failed' | 'terminated';
    started: Date;
    duration?: number; // Duration in ms, calculated when complete
    output?: string;
    error?: string;
    abortController?: AbortController; // For potentially cancelling operations
}

/**
 * Singleton class to track long-running functions
 */
class RunningToolTracker {
    private functions: Map<string, RunningTool> = new Map();

    /**
     * Add a function to be tracked
     *
     * @param id Running Tool ID
     * @param name Running Tool name
     * @param agent Agent name that initiated the function
     * @param args Arguments as a JSON string
     * @returns The created running function object
     */
    addRunningTool(
        id: string,
        name: string,
        agent: string,
        args: string
    ): RunningTool {
        const runningTool: RunningTool = {
            id,
            name,
            agent,
            args,
            status: 'running',
            started: new Date(),
            abortController: new AbortController(),
        };

        this.functions.set(id, runningTool);
        return runningTool;
    }

    /**
     * Generate a new unique function ID
     *
     * @returns A UUID string
     */
    generateRunningToolId(): string {
        return uuidv4();
    }

    /**
     * Get a tracked function by ID
     *
     * @param id Running Tool ID
     * @returns The running function or undefined if not found
     */
    getRunningTool(id: string): RunningTool | undefined {
        return this.functions.get(id);
    }

    /**
     * Mark a function as complete
     *
     * @param id Running Tool ID
     * @param output The function's output
     * @returns true if the function was found and updated, false otherwise
     */
    async completeRunningTool(id: string, output: string): Promise<boolean> {
        const fn = this.functions.get(id);
        if (!fn) return false;

        // If already terminated, don't update
        if (fn.status === 'terminated') return false;

        fn.status = 'completed';
        fn.output = output;
        fn.duration = new Date().getTime() - fn.started.getTime();

        // Add system message with final output
        await addSystemMessage(
            `RunningTool ${fn.name} (id: ${id}) completed after ${readableTime(fn.duration)} with output: ${output}`,
            `RunningTool ${fn.name} (id: ${id}) completed`
        );

        // Remove from tracking
        this.functions.delete(id);

        return true;
    }

    /**
     * Mark a function as failed
     *
     * @param id Running Tool ID
     * @param error The error message
     * @returns true if the function was found and updated, false otherwise
     */
    async failRunningTool(id: string, error: string): Promise<boolean> {
        const fn = this.functions.get(id);
        if (!fn) return false;

        // If already terminated, don't update
        if (fn.status === 'terminated') return false;

        fn.status = 'failed';
        fn.error = error;
        fn.duration = new Date().getTime() - fn.started.getTime();

        // Add system message with error
        await addSystemMessage(
            `RunningTool ${fn.name} (id: ${id}) failed after ${readableTime(fn.duration)} with error: ${error}`,
            `RunningTool ${fn.name} (id: ${id}) failed`
        );

        // Remove from tracking
        this.functions.delete(id);

        return true;
    }

    /**
     * Terminate a running function
     *
     * @param id Running Tool ID
     * @returns true if the function was found and terminated, false otherwise
     */
    async terminateRunningTool(id: string): Promise<boolean> {
        const fn = this.functions.get(id);
        if (!fn) return false;

        // Only terminate running functions
        if (fn.status !== 'running') return false;

        fn.status = 'terminated';
        fn.duration = new Date().getTime() - fn.started.getTime();

        // Try to abort the operation if possible
        if (fn.abortController) {
            try {
                fn.abortController.abort();
            } catch (error) {
                console.error(`Error aborting function ${id}:`, error);
            }
        }

        // Add system message about termination
        await addSystemMessage(
            `RunningTool ${fn.name} (id: ${id}) was terminated after ${readableTime(fn.duration)}.`,
            `RunningTool ${fn.name} (id: ${id}) terminated`
        );

        // Keep in the map for reference
        return true;
    }

    /**
     * Get the status of a function
     *
     * @param id Running Tool ID
     * @returns A formatted string with function information or an error message
     */
    getStatus(id: string): string {
        const fn = this.functions.get(id);
        if (!fn) {
            return `RunningTool with ID ${id} not found`;
        }

        // Basic status
        let status = `RunningToolID: ${id}
Name: ${fn.name}
Agent: ${fn.agent}
Status: ${fn.status}
Started: ${fn.started.toISOString()}
Running Time: ${readableTime(new Date().getTime() - fn.started.getTime())}`;

        if (fn.args) {
            status += `\nArguments: ${fn.args}`;
        }
        if (fn.output) {
            status += `\n\nOutput so far (may be incomplete):\n${fn.output}`;
        }

        if (fn.error) {
            status += `\n\nError:\n${fn.error}`;
        }
        status += `\n\n[Stop with terminate_running_tool(${id})]`;

        return status;
    }

    /**
     * List all currently running functions
     *
     * @returns A formatted string listing active functions
     */
    listActive(): string {
        if (this.functions.size === 0) {
            return '- No tools running in the background';
        }

        let result = '';
        for (const [id, fn] of this.functions.entries()) {
            result += `- RunningToolID: ${id}
  Running Time: ${readableTime(new Date().getTime() - fn.started.getTime())}
  Agent: ${fn.agent}
  Status: ${fn.status}
  Tool Name: ${fn.name}\n`;
            if (fn.args) {
                result += `  Args: ${truncateString(fn.args)}\n`;
            }
        }

        return result;
    }

    /**
     * Reset the tracker (mainly for testing)
     */
    reset(): void {
        this.functions = new Map();
    }

    /**
     * Get all currently running tools
     *
     * @returns An array of all running tool objects
     */
    public getAllRunningTools(): RunningTool[] {
        return Array.from(this.functions.values());
    }
}

// Export a singleton instance
export const runningToolTracker = new RunningToolTracker();
