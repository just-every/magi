/**
 * LLM and Agent Tools Test Tool
 *
 * This tool tests LLM and agent-related tools available in the Magi environment:
 * `quick_llm_call`, `uuid`, and `agent_id`.
 */

interface LlmAgentToolsOptions {
  verbose?: boolean;
}

interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
  results?: {
    quick_llm_call?: string | { success: boolean; error: string };
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
  if (agent_id) {
      results.agentId = agent_id;
      if (verbose) console.log(`agent_id found: ${agent_id}`);
  } else {
      results.agentId = { success: false, error: 'agent_id not available' };
      overallSuccess = false;
      overallError += 'agent_id not available\n';
      console.error('agent_id not available.');
  }


  // Test uuid
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

  // Test quick_llm_call (requires an LLM provider, might fail in isolation)

    const prompt = 'Respond with the word "success".';
    if (verbose) console.log(`Attempting quick_llm_call with prompt: "${prompt}"`);
    try {
      // Use a simple model and prompt that should be quick and predictable
      const llmResponse = await quick_llm_call(
        prompt,
        'reasoning_mini'
    );

      if (typeof llmResponse === 'string' && llmResponse.toLowerCase().includes('success')) {
          results.quick_llm_call = `LLM responded: "${llmResponse.substring(0, 50)}..."`;
          if (verbose) console.log('quick_llm_call successful.');
      } else {
          results.quick_llm_call = { success: false, error: `LLM response did not contain "success": "${llmResponse}"` };
          overallSuccess = false;
          overallError += `LLM response did not contain "success": "${llmResponse}"\n`;
          console.error('quick_llm_call failed: Unexpected response.');
      }
    } catch (error: any) {
      results.quick_llm_call = { success: false, error: `quick_llm_call failed: ${error.message || String(error)}` };
      overallSuccess = false;
      overallError += `quick_llm_call failed: ${error.message || String(error)}\n`;
      console.error('quick_llm_call failed:', error);
    }


  return {
    success: overallSuccess,
    message: overallSuccess ? 'LLM and Agent tools tested (some may require providers)' : 'Some LLM or Agent tools failed or were not available',
    error: overallSuccess ? undefined : overallError.trim(),
    results: results,
  };
}
