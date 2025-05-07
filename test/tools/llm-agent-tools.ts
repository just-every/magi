/**
 * LLM and Agent Tools Test Tool
 *
 * This tool tests LLM and agent-related tools available in the Magi environment:
 * `quickLlmCall`, `get_summary_source`, `uuid`, and `agent_id`.
 */

interface LlmAgentToolsOptions {
  verbose?: boolean;
}

interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
  results?: {
    quickLlmCall?: string | { success: boolean; error: string };
    getSummarySource?: string | { success: boolean; error: string };
    uuid?: string | { success: boolean; error: string };
    agentId?: string | { success: boolean; error: string };
  };
}

/**
 * Main function for the llm-agent-tools tool
 */
export default async function llmAgentToolsTest(options: LlmAgentToolsOptions = {}): Promise<ToolResult> {
  const { verbose = false } = options;

  if (verbose) {
    console.log('LLM and Agent Tools Test Tool executing...');
  }

  const results: ToolResult['results'] = {};
  let overallSuccess = true;
  let overallError = '';

  // Test agent_id access
  if (verbose) console.log(`Checking agent_id access...`);
  if (agentId) {
      results.agentId = agentId;
      if (verbose) console.log(`agent_id found: ${agentId}`);
  } else {
      results.agentId = { success: false, error: 'agent_id not available' };
      overallSuccess = false;
      overallError += 'agent_id not available\n';
      console.error('agent_id not available.');
  }


  // Test uuid
  if (tools && tools.uuid) {
    if (verbose) console.log(`Attempting to generate UUID...`);
    try {
      const generatedUuid = tools.uuid();
      if (typeof generatedUuid === 'string' && generatedUuid.length > 0) {
          results.uuid = generatedUuid;
          if (verbose) console.log(`UUID generated: ${generatedUuid}`);
      } else {
          results.uuid = { success: false, error: 'uuid tool did not return a valid string' };
          overallSuccess = false;
          overallError += 'uuid tool did not return a valid string\n';
          console.error('uuid tool did not return a valid string.');
      }
    } catch (error: any) {
      results.uuid = { success: false, error: `uuid tool failed: ${error.message || String(error)}` };
      overallSuccess = false;
      overallError += `uuid tool failed: ${error.message || String(error)}\n`;
      console.error('uuid tool failed:', error);
    }
  } else {
    results.uuid = { success: false, error: 'uuid tool not available' };
    overallSuccess = false;
    overallError += 'uuid tool not available\n';
    console.warn('uuid tool not available.');
  }

  // Test quickLlmCall (requires an LLM provider, might fail in isolation)
  if (tools && tools.quickLlmCall) {
    const prompt = 'Respond with the word "success".';
    if (verbose) console.log(`Attempting quickLlmCall with prompt: "${prompt}"`);
    try {
      // Use a simple model and prompt that should be quick and predictable
      const llmResponse = await tools.quickLlmCall({
          name: 'TestAgent',
          description: 'A simple test agent',
          instructions: prompt,
          modelClass: 'reasoning_mini', // Use a small, fast model class if available
      });

      if (typeof llmResponse === 'string' && llmResponse.toLowerCase().includes('success')) {
          results.quickLlmCall = `LLM responded: "${llmResponse.substring(0, 50)}..."`;
          if (verbose) console.log('quickLlmCall successful.');
      } else {
          results.quickLlmCall = { success: false, error: `LLM response did not contain "success": "${llmResponse}"` };
          overallSuccess = false;
          overallError += `LLM response did not contain "success": "${llmResponse}"\n`;
          console.error('quickLlmCall failed: Unexpected response.');
      }
    } catch (error: any) {
      results.quickLlmCall = { success: false, error: `quickLlmCall failed: ${error.message || String(error)}` };
      overallSuccess = false;
      overallError += `quickLlmCall failed: ${error.message || String(error)}\n`;
      console.error('quickLlmCall failed:', error);
    }
  } else {
    results.quickLlmCall = { success: false, error: 'quickLlmCall tool not available' };
    overallSuccess = false;
    overallError += 'quickLlmCall tool not available\n';
    console.warn('quickLlmCall tool not available.');
  }

   // Test get_summary_source (requires a summary source provider, might fail in isolation)
  if (tools && tools.get_summary_source) {
    if (verbose) console.log(`Attempting to get summary source...`);
    try {
      // get_summary_source typically returns a string or null/undefined
      const summarySource = await tools.get_summary_source();
      if (summarySource === null || summarySource === undefined || typeof summarySource === 'string') {
          results.getSummarySource = `Summary source received (type: ${typeof summarySource}, length: ${String(summarySource).length})`;
          if (verbose) console.log('get_summary_source successful.');
      } else {
          results.getSummarySource = { success: false, error: `get_summary_source returned unexpected type: ${typeof summarySource}` };
          overallSuccess = false;
          overallError += `get_summary_source returned unexpected type: ${typeof summarySource}\n`;
          console.error('get_summary_source failed: Unexpected return type.');
      }
    } catch (error: any) {
      results.getSummarySource = { success: false, error: `get_summary_source failed: ${error.message || String(error)}` };
      overallSuccess = false;
      overallError += `get_summary_source failed: ${error.message || String(error)}\n`;
      console.error('get_summary_source failed:', error);
    }
  } else {
    results.getSummarySource = { success: false, error: 'get_summary_source tool not available' };
    overallSuccess = false;
    overallError += 'get_summary_source tool not available\n';
    console.warn('get_summary_source tool not available.');
  }


  return {
    success: overallSuccess,
    message: overallSuccess ? 'LLM and Agent tools tested (some may require providers)' : 'Some LLM or Agent tools failed or were not available',
    error: overallSuccess ? undefined : overallError.trim(),
    results: results,
  };
}
