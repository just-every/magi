/**
 * Tracks the state of processes in the system so we can monitor and communicate with them
 */
import {AgentProcess} from '../types.js';
import {ProcessEventMessage} from './communication.js';
import {addSystemMessage} from './history.js';

const truncateString = (string = '', maxLength = 200) =>
	string.length > maxLength
		? `${string.substring(0, maxLength)}…`
		: string;

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
	 * Get an existing process by ID
	 *
	 * @param processId string the process ID added
	 */
	getProcess(processId: string): AgentProcess | undefined {
		return this.processes.get(processId);
	}

	/**
	 * Get an existing process by ID
	 *
	 * @param processId string the process ID added
	 */
	getStatus(processId: string): string {
		const agentProcess = this.processes.get(processId);
		if(!agentProcess) {
			return `AgentID ${processId} not found`;
		}

		return `AgentID: ${processId}
Name: ${agentProcess.name}
Status: ${agentProcess.status}
History: 

${JSON.stringify(agentProcess.history, null, 2)}`;
	}



	/**
	 * Handle a process event to update process status
	 */
	async handleEvent(eventMessage: ProcessEventMessage): Promise<void> {
		const processId: string = eventMessage.processId;
		let process = this.processes.get(processId);
		if(!process) {
			console.error(`AgentID ${processId} not being tracked`, eventMessage);
			return;
		}

		if(eventMessage.event.type === 'process_running' || eventMessage.event.type === 'process_done' || eventMessage.event.type === 'process_terminated') {
			if(eventMessage.event.agentProcess) {
				process = eventMessage.event.agentProcess;
			}
		}

		if(eventMessage.event.type === 'process_running') {
			process.status = 'running';
			process.output = '';
		}
		else if(eventMessage.event.type === 'process_updated' || eventMessage.event.type === 'process_done') {
			process.output = eventMessage.event.output;
			process.history = eventMessage.event.history;

			if(eventMessage.event.type === 'process_done') {
				process.status = 'completed';
				await addSystemMessage(`AgentID ${processId} completed!\nOutput:\n${eventMessage.event.output}`);
			}
			else {
				process.status = 'running';
				await addSystemMessage(`AgentID ${processId} is still running.\nPartial Output:\n${eventMessage.event.output}`);
			}
		}
		else if(eventMessage.event.type === 'process_terminated') {
			process.status = 'terminated';
			await addSystemMessage(`AgentID ${processId} terminated.`);
		}

		this.processes.set(processId, process);
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
			result += `-\tAgentID: ${id}
\tName: ${agentProcess.name}
\tStatus: ${agentProcess.status}
\tCommand: ${agentProcess.command}
\tOutput: ${agentProcess.output ? truncateString(agentProcess.output) : 'Not complete'}
`;
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
