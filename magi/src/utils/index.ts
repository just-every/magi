import type { ToolFunction } from '../types/shared-types.js';
import { getFileTools } from '../utils/file_utils.js';
import { getShellTools } from '../utils/shell_utils.js';
import { getSummaryTools } from '../utils/summary_utils.js';

/**
 * Get all summary tools as an array of tool definitions
 */
export function getCommonTools(): ToolFunction[] {
    return [...getFileTools(), ...getShellTools(), ...getSummaryTools()];
}
