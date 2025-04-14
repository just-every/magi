/**
 * Utility functions for summarizing task outputs and detecting failing tasks
 */
import { ResponseInput } from '../types.js';
import { Runner } from './runner.js';
import { createSummaryAgent } from '../magi_agents/common_agents/summary_agent.js';

const SUMMARIZE_AT_CHARS = 2000; // Below this length, we don't summarize
const SUMMARIZE_TRUNCATE_CHARS = 100000; // Below this length, we don't summarize

// Cache to avoid repeated summaries of the same content
const summaryCache = new Map<string, { summary: string, timestamp: number }>();
// Cache expiration time (5 minutes)
const CACHE_EXPIRATION_MS = 5 * 60 * 1000;

// Patterns that might indicate failing tasks
const FAILURE_PATTERNS = [
  /error|exception|failed|timeout|rejected|unable to|cannot|not found|invalid/gi,
  /retry.*attempt|retrying|trying again/gi,
  /no (?:such|valid) (?:file|directory|path|route)/gi,
  /unexpected|unknown|unhandled/gi
];

// Maximum number of retries before flagging a potential issue
const MAX_RETRIES = 3;
// Minimum frequency of error messages to consider as a potential issue
const ERROR_FREQUENCY_THRESHOLD = 0.3;


function truncate(text: string, length: number = SUMMARIZE_TRUNCATE_CHARS, separator: string = '\n\n...[truncated for summary]...\n\n'): string {
  text = text.trim();
  if (text.length <= length) {
    return text;
  }
  return text.substring(0, length*0.3) + separator + text.substring(text.length - (length*0.7) + separator.length);
}

export async function createSummary(
  document: string,
  context: string,
): Promise<string> {

  if(document.length <= SUMMARIZE_AT_CHARS) {
    return document;
  }

  // Truncate if it's too long
  document = truncate(document);

  // Create agent to summarize the document
  const agent = createSummaryAgent(context);

  // Generate the summary
  const summary = await Runner.runStreamedWithTools(agent, document, [], {}, ['cost_update']);
  return summary.trim();
}

/**
 * Summarize task output and detect potential issues
 * 
 * @param taskId The ID of the task
 * @param output The full output of the task
 * @param history The conversation history of the task
 * @returns An object containing the summary and potential issues
 */
export async function summarizeTaskOutput(
  taskId: string,
  output: string | undefined,
  history: ResponseInput | undefined
): Promise<{
  summary: string;
  potentialIssues: string | null;
  isLikelyFailing: boolean;
}> {
  if (!output && (!history || history.length === 0)) {
    return {
      summary: 'No task output or history available to summarize.',
      potentialIssues: null,
      isLikelyFailing: false
    };
  }

  // Generate a cache key based on output and history length
  const historyLength = history ? history.length : 0;
  const cacheKey = `${taskId}-${output?.length ?? 0}-${historyLength}`;
  
  // Check cache first
  const cachedSummary = summaryCache.get(cacheKey);
  if (cachedSummary && (Date.now() - cachedSummary.timestamp < CACHE_EXPIRATION_MS)) {
    // Add failure detection to cached summary
    const { isLikelyFailing, potentialIssues } = detectPotentialIssues(output, history);
    return {
      summary: cachedSummary.summary,
      potentialIssues,
      isLikelyFailing
    };
  }

  // Create content to summarize
  let contentToSummarize = '';

  // Add conversation history if available
  if (history && history.length > 0) {
    // Convert history to a readable format for summarization
    contentToSummarize += 'Task History:\n' + formatHistoryForSummary(history);
  }

  // Add output if available
  if (output) {
    if( contentToSummarize.length > 0) {
      contentToSummarize += '\n\n';
    }
    contentToSummarize += 'Task Output:\n' + output;
  }

  try {
    // Generate the summary
    const summary = await createSummary(contentToSummarize, 'The following is the output and history of a task performed by an AI agent in an autonomous system. Your summary will be used to understand the task\'s progress and results. Focus on core actions taken, the current status and any issues stopping current progress.');
    
    // Add to cache
    summaryCache.set(cacheKey, {
      summary: summary.trim(),
      timestamp: Date.now()
    });

    // Detect potential issues
    const { isLikelyFailing, potentialIssues } = detectPotentialIssues(output, history);

    return {
      summary: summary.trim(),
      potentialIssues,
      isLikelyFailing
    };
  } catch (error) {
    console.error(`Error generating task summary for ${taskId}:`, error);
    return {
      summary: 'Error generating summary. The task is running but summary generation failed.',
      potentialIssues: `Summary generation error: ${error}`,
      isLikelyFailing: false
    };
  }
}

/**
 * Format history for summarization
 * 
 * @param history The conversation history
 * @returns Formatted history as a string
 */
export function formatHistoryForSummary(history: ResponseInput): string {
  // Group related messages (especially tool calls with their outputs)
  const formattedItems: string[] = [];
  const processedIds = new Set<string>();
  
  for (let i = 0; i < history.length; i++) {
    const item = history[i];
    
    // Skip if already processed (part of a call-result pair)
    if ('type' in item && 
        item.type === 'function_call_output' && 
        'call_id' in item && 
        processedIds.has(item.call_id)) {
      continue;
    }
    
    // Format differently based on message type
    if ('role' in item && 'content' in item) {
      const content = typeof item.content === 'string' ? item.content : JSON.stringify(item.content);
      
      // Detect if this is likely a command
      if (item.role === 'user' && (
        content.toLowerCase().includes('command:') ||
        content.toLowerCase().startsWith('do ') ||
        content.toLowerCase().startsWith('please ') ||
        content.toLowerCase().startsWith('can you ')
      )) {
        formattedItems.push(`COMMAND (${item.role}):\n${truncate(content, (SUMMARIZE_TRUNCATE_CHARS/10))}`);
      }
      // Detect if this contains an error
      else if (content.toLowerCase().includes('error:') || content.toLowerCase().includes('failed')) {
        formattedItems.push(`ERROR (${item.role}):\n${truncate(content, (SUMMARIZE_TRUNCATE_CHARS/10))}`);
      }
      // Regular role-based message
      else {
        formattedItems.push(`${item.role.toUpperCase()}:\n${truncate(content, (SUMMARIZE_TRUNCATE_CHARS/10))}`);
      }
    } 
    // Handle tool calls and try to pair them with their results
    else if ('type' in item && item.type === 'function_call' && 'call_id' in item) {
      const callId = item.call_id;
      processedIds.add(callId);
      
      // Format the tool call
      let formattedCall = `TOOL CALL: ${item.name}(${truncate(item.arguments, (SUMMARIZE_TRUNCATE_CHARS/10))})`;
      
      // Look ahead for the matching result
      let resultItem = null;
      for (let j = i + 1; j < history.length; j++) {
        const potentialResult = history[j];
        if ('type' in potentialResult && 
            potentialResult.type === 'function_call_output' && 
            'call_id' in potentialResult &&
            potentialResult.call_id === callId) {
          resultItem = potentialResult;
          break;
        }
      }
      
      // If we found a matching result, combine them
      if (resultItem) {
        processedIds.add(callId); // Mark the result as processed
        formattedCall += `\nTOOL RESULT: ${truncate(resultItem.output, (SUMMARIZE_TRUNCATE_CHARS/10))}`;
      }
      
      formattedItems.push(formattedCall);
    } 
    // Handle orphaned tool results (shouldn't happen with proper pairing, but just in case)
    else if ('type' in item && item.type === 'function_call_output' && 'call_id' in item) {
      formattedItems.push(`TOOL RESULT (${item.name}):\n${truncate(item.output, (SUMMARIZE_TRUNCATE_CHARS/10))}`);
    }
    // Fallback for any other message types
    else {
      formattedItems.push(`OTHER: ${JSON.stringify(item)}`);
    }
  }
  
  return formattedItems.join('\n\n');
}

/**
 * Detect potential issues in task output and history
 * 
 * @param output The task output
 * @param history The task history
 * @returns Object with isLikelyFailing flag and potentialIssues message
 */
function detectPotentialIssues(
  output: string | undefined, 
  history: ResponseInput | undefined
): { isLikelyFailing: boolean; potentialIssues: string | null } {
  if (!output && (!history || history.length === 0)) {
    return { isLikelyFailing: false, potentialIssues: null };
  }

  let errorCount = 0;
  let contentLength = 0;
  let retryCount = 0;
  const issues = [];

  // Check the output
  if (output) {
    contentLength += output.length;
    
    // Count pattern matches in output
    FAILURE_PATTERNS.forEach(pattern => {
      const matches = output.match(pattern);
      if (matches) {
        errorCount += matches.length;
      }
    });

    // Count retry attempts in output
    const retryMatches = output.match(/retry.*attempt|retrying|trying again/gi);
    if (retryMatches) {
      retryCount += retryMatches.length;
    }
  }

  // Check the history
  if (history && history.length > 0) {
    // Look for error messages and retry patterns in function call outputs
    for (const item of history) {
      if ('type' in item && item.type === 'function_call_output') {
        contentLength += item.output.length;
        
        // Check for error patterns
        FAILURE_PATTERNS.forEach(pattern => {
          const matches = item.output.match(pattern);
          if (matches) {
            errorCount += matches.length;
          }
        });

        // Check for retry patterns
        const retryMatches = item.output.match(/retry.*attempt|retrying|trying again/gi);
        if (retryMatches) {
          retryCount += retryMatches.length;
        }
      }
    }

    // Check for repeated similar tool calls which might indicate the task is stuck
    const toolCalls = history.filter(item => 'type' in item && item.type === 'function_call');
    if (toolCalls.length > 5) {
      // Count similar consecutive tool calls
      const toolCallNames = toolCalls.map(call => 'name' in call ? call.name : '');
      
      let repeatedCallsCount = 0;
      for (let i = 1; i < toolCallNames.length; i++) {
        if (toolCallNames[i] === toolCallNames[i-1]) {
          repeatedCallsCount++;
        }
      }
      
      // If more than 3 consecutive identical tool calls, it might be stuck
      if (repeatedCallsCount > 3) {
        issues.push('Task may be stuck in a loop, repeatedly calling the same tools without making progress.');
      }
    }
  }

  // Calculate error frequency (errors per character)
  const errorFrequency = contentLength > 0 ? errorCount / contentLength : 0;
  
  // Determine if the task is likely failing
  const isLikelyFailing = (
    retryCount > MAX_RETRIES || 
    errorFrequency > ERROR_FREQUENCY_THRESHOLD
  );

  // Build potential issues message
  if (isLikelyFailing) {
    if (retryCount > MAX_RETRIES) {
      issues.push(`Task has attempted to retry ${retryCount} times, which exceeds the maximum of ${MAX_RETRIES}.`);
    }
    
    if (errorFrequency > ERROR_FREQUENCY_THRESHOLD) {
      issues.push(`Task output contains a high frequency of error messages (${(errorFrequency * 100).toFixed(2)}%).`);
    }
  }

  return {
    isLikelyFailing,
    potentialIssues: issues.length > 0 ? issues.join(' ') : null
  };
}
