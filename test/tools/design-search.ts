interface ToolsOptions {
    verbose?: boolean;
    engine?: string;
    limit?: number;
    query?: string;
}

interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
  results?: Array<string | EngineResult>;
}

interface EngineResult {
  engine: string;
  success: boolean;
  result?: string;
  timeTaken?: number; // Time taken in milliseconds
  error?: string | null;
}

const engines = [
    'dribbble',
    'behance',
    'envato',
    'pinterest',
    'awwwards',
    'web_search',
];


import { DesignSearchEngine, design_search, smart_design } from '../../magi/src/utils/design_search.js';

export default async function designSearchTest(options: ToolsOptions = {}): Promise<ToolResult> {
  const { verbose = false, engine, limit = 9, query = "customer support homepage" } = options;
  // Cast engine to DesignSearchEngine if provided
  let overallSuccess = true;
  let overallError = '';
  const results: Array<any> = [];

  if (verbose) {
    console.log('Testing design_search function...');
  }

  // If engine is specified, test only that engine
  if (engine !== undefined && engines.includes(engine)) {
    const timeTaken = 0;
    if (verbose) console.log(`\nTest: Searching ${engine}`);

    try {
      // Measure the time taken for the search
      const startTime = Date.now();

      const result = await design_search(engine, query, limit);

      // Calculate the time taken
      const timeTaken = Date.now() - startTime;
      if (verbose) console.log(`Search took ${timeTaken}ms`);

      results.push(result);

      // Validate the results
      const parsedResults = JSON.parse(result);

      // Check that we have at least one result
      if (!Array.isArray(parsedResults) || parsedResults.length === 0) {
        overallSuccess = false;
        overallError += `\nNo results returned from ${engine} search`;
        if (verbose) console.log(`FAIL: No results returned from ${engine} search`);
      } else {
        // Check that each result has the required fields
        let validItems = 0;
        let invalidItems = 0;

        parsedResults.forEach((item, index) => {
          const hasUrl = typeof item.url === 'string' && item.url.trim() !== '';
          const hasTitle = item.title !== undefined; // Title can be missing but the field should exist
          const hasThumbnail = typeof item.thumbnailURL === 'string' || item.thumbnailURL === undefined;
          const hasScreenshot = typeof item.screenshotURL === 'string' || item.screenshotURL === undefined;

          if (hasUrl && hasThumbnail && hasScreenshot) {
            validItems++;
          } else {
            invalidItems++;
            if (verbose) {
              console.log(`FAIL: Item ${index} missing required fields:`);
              if (!hasUrl) console.log(`  - Missing url`);
              if (!hasTitle) console.log(`  - Missing title field`);
              if (!hasThumbnail) console.log(`  - Invalid thumbnailURL`);
              if (!hasScreenshot) console.log(`  - Invalid screenshotURL`);
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
      }
    } catch (error) {
      overallSuccess = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      overallError += `\nError during ${engine} search: ${errorMessage}`;
      if (verbose) console.log(`FAIL: Error during search: ${errorMessage}`);
    }

    return {
      success: overallSuccess,
      message: overallSuccess ? `design_search ${engine} tested successfully (${timeTaken}ms)` : `design_search ${engine} failed`,
      error: overallSuccess ? undefined : overallError.trim(),
      results,
    };
  }
  // If no engine is specified, test all engines
  else {
    if (verbose) console.log("\nTest: Searching ALL engines");

    const engineResults: EngineResult[] = [];
    // Run searches on all engines in parallel
    const searchPromises = engines.map(async (engineName) => {
      if (verbose) console.log(`\nTesting engine: ${engineName}`);
      try {
        // Measure the time taken for the search
        const startTime = Date.now();

        const result = await design_search(engineName as DesignSearchEngine, query, limit);

        // Calculate the time taken
        const timeTaken = Date.now() - startTime;
        if (verbose) console.log(`${engineName} search took ${timeTaken}ms`);

        const parsedResults = JSON.parse(result);

        // Validate results
        let engineSuccess = true;
        let validItems = 0;
        let invalidItems = 0;

        if (!Array.isArray(parsedResults) || parsedResults.length === 0) {
          engineSuccess = false;
          if (verbose) console.log(`FAIL: No results returned from ${engineName} search`);
        } else {
          parsedResults.forEach((item, index) => {
            const hasUrl = typeof item.url === 'string' && item.url.trim() !== '';
            const hasTitle = item.title !== undefined;
            const hasThumbnail = typeof item.thumbnailURL === 'string' || item.thumbnailURL === undefined;
            const hasScreenshot = typeof item.screenshotURL === 'string' || item.screenshotURL === undefined;

            if (hasUrl && hasTitle && hasThumbnail && hasScreenshot) {
              validItems++;
            } else {
              invalidItems++;
              if (verbose) {
                console.log(`FAIL: Item ${index} missing required fields in ${engineName} results`);
              }
            }
          });

          if (verbose) {
            console.log(`${engineName}: Found ${parsedResults.length} results, ${validItems} valid, ${invalidItems} invalid`);
          }

          if (invalidItems > 0) {
            engineSuccess = false;
          } else {
            if (verbose) console.log(`SUCCESS: All ${engineName} results have required fields`);
          }
        }

        // Add to overall results
        engineResults.push({
          engine: engineName,
          success: engineSuccess,
          result: result,
          timeTaken: timeTaken
        });

        return {
          engine: engineName,
          success: engineSuccess,
          timeTaken: timeTaken,
          error: engineSuccess ? null : `Issues with ${engineName} search results`
        };
      } catch (error) {
        if (verbose) console.log(`FAIL: Error during ${engineName} search: ${error instanceof Error ? error.message : String(error)}`);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          engine: engineName,
          success: false,
          error: `Error during ${engineName} search: ${errorMessage}`
        };
      }
    });

    // Wait for all searches to complete
    const searchResults = await Promise.all(searchPromises);

    // Add successful results to the results array
    engineResults.forEach(result => {
      if (result.success && result.result) {
        results.push(result);
      }
    });

    // Determine overall success
    const failedEngines = searchResults.filter(result => !result.success);
    if (failedEngines.length > 0) {
      overallSuccess = false;
      failedEngines.forEach(failed => {
        overallError += `\n${failed.error}`;
      });
    }

    // Count successful engines
    const successfulEngines = searchResults.filter(result => result.success).length;

    if (verbose) {
      console.log(`\nAll tests completed. ${successfulEngines} of ${engines.length} engines successful.`);

      // Display timing information for successful engines
      engineResults.forEach(result => {
        if (result.timeTaken !== undefined) {
          console.log(`${result.engine}: ${result.timeTaken}ms`);
        }
      });
    }

    return {
      success: overallSuccess,
      message: overallSuccess ?
        `All design search engines tested successfully` :
        `${successfulEngines} of ${engines.length} design search engines tested successfully`,
      error: overallSuccess ? undefined : overallError.trim(),
      results,
    };
  }
}
