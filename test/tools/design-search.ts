interface ToolsOptions {
  verbose?: boolean;
  engine?: number;
}

interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
  results?: any;
}

const engines = [
    'dribbble',
    'behance',
    'envato',
    'pinterest',
    'awwwards',
    'siteinspire',
    'web_search',
];

export default async function designSearchTest(options: ToolsOptions = {}): Promise<ToolResult> {
  const { verbose = false, engine, limit = 9 } = options;
  let overallSuccess = true;
  let overallError = '';
  const results: Array<string> = [];

  if (verbose) {
    console.log('Testing design_search function...');
  }

  // If engine is specified, test only that engine
  if (engine !== undefined) {
    if (verbose) console.log(`\nTest: Searching ${engines[engine]}`);
    
    try {
      const result = await design_search(engines[engine], "customer support homepage", limit);
      results.push(result);

      // Validate the results
      const parsedResults = JSON.parse(result);

      // Check that we have at least one result
      if (!Array.isArray(parsedResults) || parsedResults.length === 0) {
        overallSuccess = false;
        overallError += `\nNo results returned from ${engines[engine]} search`;
        if (verbose) console.log(`FAIL: No results returned from ${engines[engine]} search`);
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
          overallError += `\n${invalidItems} results from ${engines[engine]} search are missing required fields`;
        } else {
          if (verbose) console.log(`SUCCESS: All results have required fields`);
        }
      }
    } catch (error) {
      overallSuccess = false;
      overallError += `\nError during ${engines[engine]} search: ${error.message}`;
      if (verbose) console.log(`FAIL: Error during search: ${error.message}`);
    }

    return {
      success: overallSuccess,
      message: overallSuccess ? `design_search ${engines[engine]} tested successfully` : `design_search ${engines[engine]} failed`,
      error: overallSuccess ? undefined : overallError.trim(),
      results,
    };
  } 
  // If no engine is specified, test all engines
  else {
    if (verbose) console.log("\nTest: Searching ALL engines");
    
    const engineResults = [];
    // Run searches on all engines in parallel
    const searchPromises = engines.map(async (engineName, idx) => {
      if (verbose) console.log(`\nTesting engine: ${engineName}`);
      try {
        const result = await design_search(engineName, "customer support homepage", limit);
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

            if (hasUrl && hasThumbnail && hasScreenshot) {
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
          result: result
        });
        
        return {
          engine: engineName, 
          success: engineSuccess,
          error: engineSuccess ? null : `Issues with ${engineName} search results`
        };
      } catch (error) {
        if (verbose) console.log(`FAIL: Error during ${engineName} search: ${error.message}`);
        return {
          engine: engineName,
          success: false,
          error: `Error during ${engineName} search: ${error.message}`
        };
      }
    });
    
    // Wait for all searches to complete
    const searchResults = await Promise.all(searchPromises);
    
    // Add successful results to the results array
    engineResults.forEach(result => {
      if (result.success) {
        results.push(result.result);
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
    
    if (verbose) console.log(`\nAll tests completed. ${successfulEngines} of ${engines.length} engines successful.`);
    
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