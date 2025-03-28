import {ResponseInput} from '../types.js';

/**
 * LLM utility functions for the MAGI system.
 */
export function convertHistoryFormat(history: ResponseInput, structureMap?: (role: string, content: string, msg?: any) => any): any[] {
	if(!structureMap) {
		structureMap = (role, content) => !content ? null : {
			role: role === 'assistant' ? 'model' : 'user',
			content,
		};
	}

	return history.reduce((result: any[], msg) => {
		const role = ('role' in msg && msg.role !== 'developer') ? msg.role : 'system';

		let content: string = '';
		if ('content' in msg) {
			if (typeof msg.content === 'string') {
				content = msg.content;
			} else if ('text' in msg.content && typeof msg.content.text === 'string') {
				content = msg.content.text;
			}
		}

		const structuredMsg = structureMap(role, content, msg);
		if(structuredMsg) {
			// Add the message if we have content
			result.push(structuredMsg);
		}

		return result;
	}, []);
}
