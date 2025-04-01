import {ProcessToolType} from '../types.js';
import {runGodelMachine} from '../magi_agents/godel_machine/index.js';
import {runResearchEngine} from '../magi_agents/research_engine/index.js';
import {runTaskForce} from '../magi_agents/task_force/index.js';

export async function runProcessTool(
	tool: ProcessToolType,
	command: string,
): Promise<void> {

	switch (tool) {
		case 'research_engine':
			await runResearchEngine(command);
			break;
		case 'godel_machine':
			await runGodelMachine(command);
			break;
		case 'task_force':
			await runTaskForce(command);
			break;
	}
}
