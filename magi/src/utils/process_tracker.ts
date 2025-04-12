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
			return `taskId ${processId} not found`;
		}

		return `taskId: ${processId}
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
			console.error(`taskId ${processId} not being tracked`, eventMessage);
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
				await addSystemMessage(`Task with taskId ${processId} completed!\nOutput:\n${eventMessage.event.output}`);
			}
			else {
				process.status = 'running';
				//await addSystemMessage(`taskId ${processId} is still running.\nPartial Output:\n${eventMessage.event.output}`);
			}
		}
		else if(eventMessage.event.type === 'process_waiting') {
			process.status = 'waiting';
			if(eventMessage.event.history) process.history = eventMessage.event.history;
			await addSystemMessage(`Task with taskId ${processId} has completed and is waiting further messages.`);
		}
		else if(eventMessage.event.type === 'process_failed') {
			process.status = 'failed';
			if(eventMessage.event.error) process.output = eventMessage.event.error;
			if(eventMessage.event.history) process.history = eventMessage.event.history;
			await addSystemMessage(`Task with taskId ${processId} FAILED. ${eventMessage.event.error || ''}`);
		}
		else if(eventMessage.event.type === 'process_terminated') {
			process.status = 'terminated';
			if(eventMessage.event.error) process.output = eventMessage.event.error;
			if(eventMessage.event.history) process.history = eventMessage.event.history;
			await addSystemMessage(`Task with taskId ${processId} terminated. ${eventMessage.event.error || ''}`);
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
			return '- No tasks';
		}

		let result = '';
		for (const [id, agentProcess] of this.processes.entries()) {
			if(agentProcess.status === 'terminated') continue;
			result += `- Task taskId: ${id}
  Name: ${agentProcess.name}
  Status: ${agentProcess.status}
`;
			if (agentProcess.project) {
				result += `  Project: ${agentProcess.project.join(', ')}\n`;
			}
			if (agentProcess.command) {
				result += `  Command: ${truncateString(agentProcess.command)}\n`;
			}
			if (agentProcess.output) {
				result += `  Output: ${truncateString(agentProcess.output)}\n`;
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
