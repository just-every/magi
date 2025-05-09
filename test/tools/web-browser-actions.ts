/**
 * Web Browser Actions Test Tool
 *
 * This tool tests various web browser interaction tools available in the Magi environment.
 * Note: This tool requires an active browser session managed by the Magi system to pass.
 */

interface WebBrowserActionsOptions {
  url?: string;
  verbose?: boolean;
}

interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
  results?: {
    navigate?: string | { success: boolean; error: string };
    webSearch?: string | { success: boolean; error: string };
    jsEvaluate?: string | { success: boolean; error: string };
    // Add results for other actions if tested
  };
}

/**
 * Main function for the web-browser-actions tool
 */
export default async function webBrowserActionsTest(options: WebBrowserActionsOptions = {}): Promise<ToolResult> {
  const { url = 'https://www.example.com/', verbose = false } = options;

  if (verbose) {
    console.log(`Web Browser Actions Test Tool executing for URL: ${url}`);
  }

  const results: ToolResult['results'] = {};
  let overallSuccess = true;
  let overallError = '';

  // Test navigate function
  try {
    if (verbose) console.log(`Attempting to navigate to: ${url}`);

    // The navigate function will be available globally based on our declarations
    await navigate(url);
    results.navigate = "Navigate successful";

    if (verbose) console.log('Navigate successful.');
  } catch (error: unknown) {
    results.navigate = {
      success: false,
      error: `Navigate failed: ${error instanceof Error ? error.message : String(error)}`
    };
    overallSuccess = false;
    overallError += `Navigate failed: ${error instanceof Error ? error.message : String(error)}\n`;
    console.error('Navigate failed:', error);
  }

  // Test web_search function
  try {
    const searchTerm = 'test';
    if (verbose) console.log(`Attempting web search for: "${searchTerm}"`);

    // The web_search function will be available globally based on our declarations
    const searchResult = await web_search(searchTerm);
    results.webSearch = `Search result received (length: ${String(searchResult).length})`;

    if (verbose) {
      console.log('Web search successful. Result snippet:');
      console.log(String(searchResult).substring(0, 200) + '...');
    }
  } catch (error: unknown) {
    results.webSearch = {
      success: false,
      error: `Web search failed: ${error instanceof Error ? error.message : String(error)}`
    };
    overallSuccess = false;
    overallError += `Web search failed: ${error instanceof Error ? error.message : String(error)}\n`;
    console.error('Web search failed:', error);
  }

  // Test js_evaluate function
  try {
    const scriptToEvaluate = 'document.title';
    if (verbose) console.log(`Attempting to evaluate JS: "${scriptToEvaluate}"`);

    // The js_evaluate function will be available globally based on our declarations
    const evaluationResult = await js_evaluate(scriptToEvaluate);
    results.jsEvaluate = evaluationResult;

    if (verbose) console.log('JS evaluate successful. Result:', evaluationResult);
  } catch (error: unknown) {
    results.jsEvaluate = {
      success: false,
      error: `JS evaluate failed: ${error instanceof Error ? error.message : String(error)}`
    };
    overallSuccess = false;
    overallError += `JS evaluate failed: ${error instanceof Error ? error.message : String(error)}\n`;
    console.error('JS evaluate failed:', error);
  }

  // Note: Testing click, type, press_keys, scroll_to, move, cdp_command
  // is more complex as it requires specific page structure and state.
  // We could add TypeScript declarations for these and implement tests as needed.

  return {
    success: overallSuccess,
    message: overallSuccess
      ? 'Web browser actions tested successfully'
      : 'Some web browser actions failed',
    error: overallSuccess ? undefined : overallError.trim(),
    results: results,
  };
}
