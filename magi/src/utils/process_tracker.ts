/**
 * Tracks the state of processes in the system so we can monitor and communicate with them
 */
import {AgentProcess} from '../types.js';

/**
 * Singleton class to track processes
 */
class ProcessTracker {
	private processes: Map<string, AgentProcess> = new Map();
	private started: Date = new Date();

	/**
	 * Record usage details from a model provider
	 *
	 * @param processId string the process ID added
	 * @param agent AgentInterface details of the agent
	 */
	addProcess(processId: string, process: AgentProcess): AgentProcess {

		this.processes.set(processId, process);

		return process;
	}

	/**
	 * List all active processes
	 *
	 * @returns A formatted string with process information
	 */
	listActive(): string {
		if (this.processes.size === 0) {
			return '- No active agents';
		}

		let result = '';
		for (const [id, agentProcess] of this.processes.entries()) {
			if(agentProcess.agent) {
				result += `- ${agentProcess.agent.name} (${id}): ${agentProcess.status}`;
				if (agentProcess.agent.description) {
					result += ` - ${agentProcess.agent.description}`;
				}
				result += '\n';
			}
		}
		return result;
	}


	/**
	 * Reset the cost tracker (mainly for testing)
	 */
	reset(): void {
		this.processes = new Map();
		this.started = new Date();
	}
}

// Export a singleton instance
export const processTracker = new ProcessTracker();
