import { ResponseInput } from '@just-every/ensemble';

/**
 * LLM utility functions for the MAGI system.
 */
export function convertHistoryFormat(
    history: ResponseInput,
    structureMap?: (
        role: string,
        content: string,
        msg?: any,
        result?: any[]
    ) => any
): any[] {
    if (!structureMap) {
        structureMap = (role, content) =>
            !content
                ? null
                : {
                      role: role === 'assistant' ? 'model' : 'user',
                      content,
                  };
    }

    return history.reduce((result: any[], msg) => {
        const role =
            'role' in msg && msg.role !== 'developer' ? msg.role : 'system';

        let content: string = '';
        if ('content' in msg) {
            if (typeof msg.content === 'string') {
                content = msg.content;
            } else if (
                'text' in msg.content &&
                typeof msg.content.text === 'string'
            ) {
                content = msg.content.text;
            }
        }

        const structuredMsg = structureMap(role, content, msg, result);
        if (structuredMsg) {
            // Add the message if we have content
            result.push(structuredMsg);
        }

        return result;
    }, []);
}

/**
 * Capitalizes first letters of words in string.
 * @param {string} str String to be modified
 * @param {boolean=false} lower Whether all other letters should be lowercased
 * @return {string}
 * @usage
 *   capitalize('fix this string');     // -> 'Fix This String'
 *   capitalize('javaSCrIPT');          // -> 'JavaSCrIPT'
 *   capitalize('javaSCrIPT', true);    // -> 'Javascript'
 */
export function capitalize(str: string, lower: boolean = true): string {
    return (lower ? str.toLowerCase() : str).replaceAll(
        /(?:^|\s|["'([{])+\S/g,
        match => match.toUpperCase()
    );
}
