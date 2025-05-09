/**
 * Sample Custom Tool with TypeScript Declarations
 *
 * This file demonstrates how to create a custom tool that uses the
 * globally available tool functions injected by the tool executor.
 * Type definitions are provided by ambient declarations in tool-types.d.ts.
 *
 * NOTE: The import below is just to satisfy TypeScript and is not used at runtime.
 */

/**
 * Process a markdown file by adding frontmatter, extracting content,
 * and optionally enhancing it with AI-generated summaries.
 *
 * @param filePath Path to the markdown file to process
 * @param addFrontmatter Whether to add YAML frontmatter to the file
 * @param generateSummary Whether to add an AI-generated summary
 * @returns Promise<string> containing the result of the operation
 */
export async function processMarkdownFile(
  filePath: string,
  addFrontmatter: boolean = true,
  generateSummary: boolean = false
): Promise<string> {
  console.log(`Processing markdown file: ${filePath}`);

  try {
    // Example 1: Reading file content
    const fileContent = await read_file(filePath);
    console.log(`Read file with ${fileContent.length} characters`);

    // Basic content analysis
    const hasTitle = fileContent.includes('# ');
    const wordCount = fileContent.split(/\s+/).length;

    // Example 2: Generate frontmatter using content analysis
    let processedContent = fileContent;

    if (addFrontmatter) {
      // Extract title from first heading
      let title = 'Untitled Document';
      const titleMatch = fileContent.match(/^#\s+(.+)$/m);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].trim();
      }

      // Create frontmatter
      const frontmatter = [
        '---',
        `title: "${title}"`,
        `date: "${new Date().toISOString().split('T')[0]}"`,
        `word_count: ${wordCount}`,
        `last_modified: "${new Date().toISOString()}"`,
        '---\n\n'
      ].join('\n');

      // Add frontmatter at the beginning if it doesn't already have it
      if (!fileContent.startsWith('---')) {
        processedContent = frontmatter + processedContent;
      }
    }

    // Example 3: Generate AI summary if requested
    if (generateSummary) {
      // Use quick_llm_call to generate a summary
      const summaryPrompt = `Please summarize the following markdown document in 2-3 sentences:

${fileContent.substring(0, 1500)}${fileContent.length > 1500 ? '...' : ''}`;

      const summary = await quick_llm_call(summaryPrompt, 'reasoning_mini');

      // Add the summary to the processed content
      processedContent = processedContent.replace(
        /^(---\s*[\s\S]*?---\s*|)/,
        `$1## Summary\n\n${summary}\n\n`
      );
    }

    // Example 4: Write the processed content back to file
    await write_file(filePath, processedContent);

    // Example 5: Running a shell command to verify the file
    const verifyResult = await execute_command(`wc -w "${filePath}"`);

    // Build a result object with information about the processing
    const result = {
      status: 'success',
      agent_id,  // Include the current agent ID in the result
      file: filePath,
      original_size: fileContent.length,
      processed_size: processedContent.length,
      word_count: wordCount,
      has_title: hasTitle,
      verify_output: verifyResult.trim(),
      added_frontmatter: addFrontmatter,
      added_summary: generateSummary
    };

    // Return the result as a JSON string
    return JSON.stringify(result, null, 2);
  } catch (error) {
    // Always handle errors and return a useful error message
    console.error('Error processing markdown file:', error);
    return JSON.stringify({
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
      file: filePath
    }, null, 2);
  }
}

/**
 * Alternative sample function that demonstrates using multiple
 * tool functions together to create a comprehensive utility.
 *
 * @param searchDir Directory to search for code files
 * @param filePattern File pattern to search for (e.g., "*.ts")
 * @param functionName Specific function name to find usages of
 * @returns Promise<string> containing the analysis results
 */
export async function analyzeCodeUsage(
  searchDir: string,
  filePattern: string = "*.ts",
  functionName: string
): Promise<string> {
  console.log(`Analyzing usage of "${functionName}" in ${searchDir}/**/${filePattern}`);

  try {
    // First, run a find command to locate all matching files
    const findCommand = `find "${searchDir}" -type f -name "${filePattern}" | sort`;
    const filesOutput = await execute_command(findCommand);

    const files = filesOutput.trim().split('\n').filter(f => f.length > 0);
    console.log(`Found ${files.length} matching files`);

    if (files.length === 0) {
      return JSON.stringify({
        status: 'warning',
        message: 'No matching files found',
        search_dir: searchDir,
        pattern: filePattern
      }, null, 2);
    }

    // Build a summary of function usage
    const usageData = [];

    for (const file of files) {
      // Skip node_modules and dist directories
      if (file.includes('node_modules/') || file.includes('/dist/')) {
        continue;
      }

      // Read each file
      const content = await read_file(file);

      // Count occurrences of the function name
      const regex = new RegExp(`\\b${functionName}\\s*\\(`, 'g');
      const matches = content.match(regex) || [];

      if (matches.length > 0) {
        // For files with matches, extract the surrounding context
        const lines = content.split('\n');
        const matchingLines = [];

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(`${functionName}(`)) {
            // Get contextual lines (2 before and after)
            const startLine = Math.max(0, i - 2);
            const endLine = Math.min(lines.length - 1, i + 2);
            const context = lines.slice(startLine, endLine + 1).join('\n');

            matchingLines.push({
              line: i + 1,
              context: context.trim()
            });
          }
        }

        usageData.push({
          file: file.replace(searchDir + '/', ''),
          occurrences: matches.length,
          examples: matchingLines
        });
      }
    }

    // Generate a summary using the LLM if there are matches
    let summary = '';
    if (usageData.length > 0) {
      // Calculate total occurrences across all files
      const totalOccurrences = usageData.reduce((acc, item) => acc + item.occurrences, 0);

      const summaryPrompt = `Analyze this usage data of the "${functionName}" function (${totalOccurrences} total occurrences):

${JSON.stringify(usageData, null, 2)}

Please provide a 2-3 sentence technical summary of how this function appears to be used based on these examples.`;

      summary = await quick_llm_call(summaryPrompt, 'reasoning_mini');
    }

    // Build the final result
    const result = {
      status: 'success',
      agent_id,  // Include the agent ID in the result
      function_name: functionName,
      total_files_analyzed: files.length,
      files_with_usage: usageData.length,
      total_occurrences: usageData.reduce((acc, item) => acc + item.occurrences, 0),
      usage_analysis: summary,
      detailed_usage: usageData,
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(result, null, 2);
  } catch (error) {
    console.error('Error analyzing code usage:', error);
    return JSON.stringify({
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
      function_name: functionName,
      search_dir: searchDir
    }, null, 2);
  }
}
