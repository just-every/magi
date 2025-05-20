interface ToolsOptions {
  verbose?: boolean;
  engine?: string;
}

interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
  results?: any;
}

interface EngineResult {
  engine: string;
  success: boolean;
  result?: string;
  timeTaken?: number; // Time taken in milliseconds
  skipped?: boolean;
  error?: string | null;
}

// Available search engines
const engines = [
  'brave',
  'anthropic',
  'openai',
  'google',
  'sonar',
  'sonar-pro',
  'sonar-deep-research'
];

import { web_search } from '../../magi/src/utils/search_utils.js';

export default async function webSearchTest(options: ToolsOptions = {}): Promise<ToolResult> {
  const { verbose = false, engine } = options;
  const query = "Please provide a list of up to 9 URLs for the most popular sites matching \"customer support homepage\". Please return the results in JSON format [{url: 'https://...', title: 'Example Site'}, ...]. Only respond with the JSON, and not other text of comments.";
  const numResults = 5;

  let overallSuccess = true;
  let overallError = '';
  const results: Array<any> = [];

  if (verbose) {
    console.log('Testing web_search function...');
  }

  // If a specific engine is provided, test only that engine
  if (engine !== undefined) {
    if (verbose) console.log(`\nTest: Searching with ${engine} engine`);

    try {
      // Measure the time taken for the search
      const startTime = Date.now();

      // Call web_search directly with the correct parameter order
      const result = await web_search('{random_agent_id}', 'openai', `Please provide a list of up to ${numResults} URLs for the most popular sites matching \"customer support homepage\". Please return the results in JSON format [{url: 'https://...', title: 'Example Site'}, ...]. Only respond with the JSON, and not other text of comments.`, numResults);

      // Calculate the time taken
      const timeTaken = Date.now() - startTime;
      if (verbose) console.log(`Search took ${timeTaken}ms`);

      // Create result with timing information
      const engineResult = {
        engine,
        result,
        timeTaken,
        success: !result.startsWith('Error:')
      };

      results.push(engineResult);

      // Check if there was an error in the result
      if (result.startsWith('Error:')) {
        if (result.includes('API key not configured')) {
          if (verbose) console.log(`SKIPPED: ${engine} - API key not configured`);
          return {
            success: true, // Not a test failure
            message: `web_search with ${engine} skipped - API key not configured (${timeTaken}ms)`,
            results: [engineResult],
          };
        }

        overallSuccess = false;
        overallError += `\n${result}`;
        if (verbose) console.log(`FAIL: ${result}`);
      } else {
        try {
          // Try to parse the result as JSON to validate its structure
          const parsedResults = JSON.parse(result);

          // Check that we have at least one result
          if (Array.isArray(parsedResults) && parsedResults.length > 0) {
            // Check that each result has the required fields (URL, title, etc.)
            let validItems = 0;
            let invalidItems = 0;

            parsedResults.forEach((item, index) => {
              // Different engines might return different structures, so we'll check for common fields
              const hasUrl = typeof item.url === 'string' && item.url.trim() !== '';
              const hasTitle = item.title !== undefined;
              // Only Brave returns these consistently, other engines might not
              const hasContent = item.snippet !== undefined || item.content !== undefined || item.description !== undefined;

              if (hasUrl && hasTitle) {
                validItems++;
              } else {
                invalidItems++;
                if (verbose) {
                  console.log(`FAIL: Item ${index} missing required fields:`);
                  if (!hasUrl) console.log(`  - Missing url`);
                  if (!hasTitle) console.log(`  - Missing title field`);
                }
              }
            });

            if (verbose) {
              console.log(`Found ${parsedResults.length} results, ${validItems} valid, ${invalidItems} invalid`);
            }

            if (invalidItems > 0) {
              overallSuccess = false;
              overallError += `\n${invalidItems} results from ${engine} search are missing required fields`;
            } else {
              if (verbose) console.log(`SUCCESS: All results have required fields`);
            }
          } else if (typeof parsedResults === 'string') {
            // Some engines might return a formatted string instead of an array
            if (verbose) console.log(`SUCCESS: Received search results as a formatted string`);
          } else {
            overallSuccess = false;
            overallError += `\nNo results or invalid format returned from ${engine} search`;
            if (verbose) console.log(`FAIL: No results or invalid format returned from ${engine} search`);
          }
        } catch (parseError) {
          // If the result is not valid JSON, it might be a plain text response
          // which is acceptable for some engines like anthropic
          if (verbose) console.log(`NOTE: Result is not JSON. Treating as text response.`);

          // Check if the response seems reasonable (has some length)
          if (result.length > 100) {
            if (verbose) console.log(`SUCCESS: Received text search results (${result.length} characters)`);
          } else {
            overallSuccess = false;
            overallError += `\nReceived short or empty response from ${engine} search`;
            if (verbose) console.log(`FAIL: Received short or empty response from ${engine} search`);
          }
        }
      }
    } catch (error) {
      overallSuccess = false;
      overallError += `\nError during ${engine} search: ${error.message}`;
      if (verbose) console.log(`FAIL: Error during search: ${error.message}`);
    }

    if (verbose) console.log('\nTests completed!');

    return {
      success: overallSuccess,
      message: overallSuccess ?
        `web_search with ${engine} tested successfully` :
        `web_search with ${engine} failed`,
      error: overallSuccess ? undefined : overallError.trim(),
      results,
    };
  }
  // If no specific engine is provided, test all available engines
  else {
    if (verbose) console.log("\nTest: Searching with ALL engines");

    const engineResults: EngineResult[] = [];
    // Run searches on all engines in parallel
    const searchPromises = engines.map(async (engineName) => {
      if (verbose) console.log(`\nTesting engine: ${engineName}`);
      try {
        // Measure the time taken for the search
        const startTime = Date.now();

        // Call web_search with the correct parameter order
        const result = await web_search(engineName, query, numResults);

        // Calculate the time taken
        const timeTaken = Date.now() - startTime;
        if (verbose) console.log(`Search took ${timeTaken}ms`);

        // Check if there was an error in the result
        if (result.startsWith('Error:')) {
          if (verbose) console.log(`NOTE: ${result}`);
          // API key errors are expected, so we don't count them as test failures
          if (result.includes('API key not configured')) {
            if (verbose) console.log(`SKIPPED: ${engineName} - API key not configured`);
            return {
              engine: engineName,
              success: true, // Not a test failure
              skipped: true,
              timeTaken,
              error: null
            };
          }
          return {
            engine: engineName,
            success: false,
            timeTaken,
            error: result
          };
        }

        // Validate and add to results
        let engineSuccess = true;

        try {
          // Try to parse the result as JSON
          const parsedResults = JSON.parse(result);
          if ((Array.isArray(parsedResults) && parsedResults.length === 0) ||
              (!Array.isArray(parsedResults) && typeof parsedResults !== 'string')) {
            engineSuccess = false;
            if (verbose) console.log(`FAIL: No results or invalid format from ${engineName}`);
          } else {
            // Add to engine results
            engineResults.push({
              engine: engineName,
              success: true,
              result: result,
              timeTaken
            });
            if (verbose) console.log(`SUCCESS: ${engineName} search returned valid results`);
          }
        } catch (parseError) {
          // For text responses
          if (result.length > 100) {
            engineResults.push({
              engine: engineName,
              success: true,
              result: result,
              timeTaken
            });
            if (verbose) console.log(`SUCCESS: ${engineName} returned text search results (${result.length} characters)`);
          } else {
            engineSuccess = false;
            if (verbose) console.log(`FAIL: ${engineName} returned short or empty response`);
          }
        }

        return {
          engine: engineName,
          success: engineSuccess,
          timeTaken,
          error: engineSuccess ? null : `Issues with ${engineName} search results`
        };
      } catch (error) {
        if (verbose) console.log(`FAIL: Error during ${engineName} search: ${error.message}`);
        return {
          engine: engineName,
          success: false,
          timeTaken: 0, // Could not measure time for failed searches
          error: `Error during ${engineName} search: ${error.message}`
        };
      }
    });

    // Wait for all searches to complete
    const searchResults = await Promise.all(searchPromises);

    // Add successful results to the results array
    engineResults.forEach(result => {
      if (result.success) {
        results.push(result);
      }
    });

    // Determine overall success based on non-skipped engines
    const unskippedResults = searchResults.filter(result => !result.skipped);
    const failedEngines = unskippedResults.filter(result => !result.success);

    if (failedEngines.length > 0 && unskippedResults.length > 0) {
      overallSuccess = false;
      failedEngines.forEach(failed => {
        overallError += `${failed.engine}\n${failed.error}`;
      });
    }

    // Count successful and skipped engines
    const successfulEngines = searchResults.filter(result => result.success && !result.skipped).length;
    const skippedEngines = searchResults.filter(result => result.skipped).length;
    const testedEngines = engines.length - skippedEngines;

    if (verbose) {
      console.log(`\nAll tests completed.`);
      console.log(`${successfulEngines} of ${testedEngines} tested engines successful.`);
      console.log(`${skippedEngines} engines skipped due to missing API keys.`);

      // Display timing information for successful engines
      engineResults.forEach(result => {
        if (result.timeTaken !== undefined) {
          console.log(`${result.engine}: ${result.timeTaken}ms`);
        }
      });
    }

    return {
      success: overallSuccess || testedEngines === 0,
      message: overallSuccess ?
        `All configured web search engines tested successfully` :
        `${successfulEngines} of ${testedEngines} web search engines tested successfully`,
      error: overallSuccess ? undefined : overallError.trim(),
      results,
    };
  }
}
