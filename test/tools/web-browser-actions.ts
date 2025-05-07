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

  // Test navigate
  if (tools && tools.navigate) {
    if (verbose) console.log(`Attempting to navigate to: ${url}`);
    try {
      // navigate tool typically doesn't return a value, just resolves on success
      results.navigate = await tools.navigate(url);
      if (verbose) console.log('Navigate successful.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      results.navigate = { success: false, error: `Navigate failed: ${error.message || String(error)}` };
      overallSuccess = false;
      overallError += `Navigate failed: ${error.message || String(error)}\n`;
      console.error('Navigate failed:', error);
    }
  } else {
    results.navigate = { success: false, error: 'navigate tool not available' };
    overallSuccess = false;
    overallError += 'navigate tool not available\n';
    console.warn('navigate tool not available.');
  }

  // Test web_search (requires a search provider, might fail in isolation)
  if (tools && tools.web_search) {
    const searchTerm = 'test';
    if (verbose) console.log(`Attempting web search for: "${searchTerm}"`);
    try {
      const searchResult = await tools.web_search(searchTerm);
      results.webSearch = `Search result received (length: ${String(searchResult).length})`;
       if (verbose) {
         console.log('Web search successful. Result snippet:');
         console.log(String(searchResult).substring(0, 200) + '...');
       }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      results.webSearch = { success: false, error: `Web search failed: ${error.message || String(error)}` };
      overallSuccess = false;
      overallError += `Web search failed: ${error.message || String(error)}\n`;
      console.error('Web search failed:', error);
    }
  } else {
    results.webSearch = { success: false, error: 'web_search tool not available' };
    overallSuccess = false;
    overallError += 'web_search tool not available\n';
    console.warn('web_search tool not available.');
  }

  // Test js_evaluate (requires an active page)
   if (tools && tools.js_evaluate) {
    const scriptToEvaluate = 'document.title';
    if (verbose) console.log(`Attempting to evaluate JS: "${scriptToEvaluate}"`);
    try {
      // Pass the script directly as a string, not as an object
      results.jsEvaluate = await tools.js_evaluate(scriptToEvaluate);
      if (verbose) console.log('JS evaluate successful. Result:', results.jsEvaluate);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      results.jsEvaluate = { success: false, error: `JS evaluate failed: ${error.message || String(error)}` };
      overallSuccess = false;
      overallError += `JS evaluate failed: ${error.message || String(error)}\n`;
      console.error('JS evaluate failed:', error);
    }
  } else {
    results.jsEvaluate = { success: false, error: 'js_evaluate tool not available' };
    overallSuccess = false;
    overallError += 'js_evaluate tool not available\n';
    console.warn('js_evaluate tool not available.');
  }


  // Note: Testing click, type, press_keys, scroll_to, move, cdp_command
  // is more complex as it requires specific page structure and state.
  // We'll skip detailed tests for these for now, but their availability
  // is implicitly tested if the tool category is present.

  return {
    success: overallSuccess,
    message: overallSuccess ? 'Web browser actions tested (some may require active browser)' : 'Some web browser actions failed or were not available',
    error: overallSuccess ? undefined : overallError.trim(),
    results: results,
  };
}
