import fs from 'fs';
import path from 'path';

interface ToolsOptions {
  verbose?: boolean;
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
  const { verbose = false } = options;
  let overallSuccess = true;
  let overallError = '';
  const finalPaths: Array<string> = [];

    if (verbose) {
        console.log('Testing generate_image function...');
    }

    // Test 1: Generate image with no output path (should use default location)
    if (verbose) console.log('\nTest 1: Generate image with default path');
    const defaultPath = await generate_image('A tall building in a futuristic city', undefined, undefined, 'https://upload.wikimedia.org/wikipedia/en/thumb/9/93/Burj_Khalifa.jpg/500px-Burj_Khalifa.jpg');
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

    // Test 2: Generate image with custom output path
    if (verbose) console.log('\nTest 2: Generate image with custom path');
    const customPath = path.join('/magi_output/shared/', 'custom_image_test.png');
    // Delete the file if it already exists
    if (fs.existsSync(customPath)) {
      fs.unlinkSync(customPath);
    }

    const customPathResult = await generate_image(
      'A logo with the name "magi" in a futuristic font',
      'square',
      'transparent',
      undefined,
      customPath
    );
    finalPaths.push(customPathResult);

    if (verbose) console.log(`Image saved to: ${customPathResult}`);

    // Verify the file exists and path matches what was requested
    if (customPathResult === customPath) {
      if (verbose) console.log('✅ Returned path matches requested path');
    } else {
        overallSuccess = false;
        overallError += `Path mismatch: expected ${customPath}, got ${customPathResult}\n`;
      if (verbose) console.error(`❌ Path mismatch: expected ${customPath}, got ${customPathResult}`);
    }

    if (fs.existsSync(customPath)) {
      if (verbose) console.log('✅ File exists at the custom path');
      // Get file size
      const stats = fs.statSync(customPath);
      if (verbose) console.log(`File size: ${stats.size} bytes`);
      if (stats.size > 1000) {
        if (verbose) console.log('✅ File size looks good (> 1KB)');
      } else {
        overallSuccess = false;
        overallError += 'File seems too small, might be empty or corrupted\n';
        if (verbose) console.error('❌ File seems too small, might be empty or corrupted');
      }
    } else {
        overallSuccess = false;
        overallError += 'File does not exist at the custom path\n';
      if (verbose) console.error('❌ File does not exist at the custom path');
    }

    if (verbose) console.log('\nTests completed!');

    return {
        success: overallSuccess,
        message: overallSuccess ? 'generate_image tested successfully' : 'generate_image failed',
        error: overallSuccess ? undefined : overallError.trim(),
        results: {
            finalPaths
        },
    };
}
