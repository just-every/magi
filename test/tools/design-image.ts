import fs from 'fs';

interface ToolsOptions {
    verbose?: boolean;
    type?: string;
    query?: string;
    with_inspiration?: boolean;
}

interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
  results?: {
    finalPaths?: Array<string>;
  };
}

export default async function generateImageTest(options: ToolsOptions = {}): Promise<ToolResult> {
  const { verbose = false, type = "primary_logo", query = "Design a logo for an app builder called JustEvery. The logo should feature the text JustEvery with an underscore at the end like JustEvery_ which indicates that it can be used to build lots of different things.", with_inspiration = true } = options;
  let overallSuccess = true;
  let overallError = '';
  const finalPaths: Array<string> = [];

    if (verbose) {
        console.log('Testing design_image function...');
    }

    // Test 1: Generate image with no output path (should use default location)
    if (verbose) console.log('\nTest 1: Generate image with default path');
    const defaultPath = await design_image(type, query, with_inspiration, []);
    finalPaths.push(defaultPath);
    if (verbose) console.log(`Image saved to: ${defaultPath}`);

    // Verify the file exists
    if (fs.existsSync(defaultPath)) {
      if (verbose) console.log('✅ File exists at the default path');
      // Get file size to verify it's not empty
      const stats = fs.statSync(defaultPath);
      if (verbose) console.log(`File size: ${stats.size} bytes`);
      if (stats.size > 1000) {
        if (verbose) console.log('✅ File size looks good (> 1KB)');
      } else {
        overallSuccess = false;
        overallError += 'File seems too small, might be empty or corrupted\n';
        if (verbose) console.error('❌ File seems too small, might be empty or corrupted');
      }
    } else {
      if (verbose) console.error('❌ File does not exist at the default path');
    }

    if (verbose) console.log('\nTests completed!');

    return {
        success: overallSuccess,
        message: overallSuccess ? 'design_image tested successfully' : 'design_image failed',
        error: overallSuccess ? undefined : overallError.trim(),
        results: {
            finalPaths
        },
    };
}
