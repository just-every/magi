/**
 * Test script for browser automation
 *
 * Run with: node dist/test-browser.js
 */

import { getPage, navigate, getText, getHTML } from './utils/browser_utils.js';
import { runBrowserDirectly } from './magi_agents/workers/browser_agent.js';
import {parseArgs} from 'node:util';

async function main() {
  // Parse command line arguments
  const options = {
    url: {type: 'string' as const, short: 'u'},
    test: {type: 'boolean' as const, short: 't', default: false},
  };
  const {values} = parseArgs({options, allowPositionals: true});

  // If URL is provided, use direct browser execution
  if (values.url) {
    console.log(`=== DIRECT BROWSER EXECUTION: ${values.url} ===`);
    try {
      const result = await runBrowserDirectly(values.url);
      console.log(result);
      return;
    } catch (error) {
      console.error('Error in direct browser execution:', error);
      process.exit(1);
    }
  }

  // Otherwise run the test suite
  console.log('=== BROWSER AUTOMATION TEST ===');

  try {
    // Test the direct browser implementation (this should bypass the LLM entirely)
    console.log('\n0. Testing runBrowserDirectly function...');
    console.log('Direct result from Yahoo:');
    const directResult = await runBrowserDirectly('https://www.yahoo.com/');
    console.log('First 200 chars of result:', directResult.substring(0, 200));
    console.log('Length of direct result:', directResult.length);

    // Test browser initialization
    console.log('\n1. Testing browser initialization...');
    await getPage();
    console.log('✓ Browser initialized successfully');

    // Test navigation to Yahoo
    console.log('\n2. Testing navigation to Yahoo...');
    const navResult = await navigate('https://www.yahoo.com/');
    console.log('Response:', JSON.stringify(navResult, null, 2));

    if (navResult.success) {
      console.log('✓ Navigation successful');
    } else {
      console.log('✗ Navigation failed');
    }

    // Test text extraction - entire page
    console.log('\n3. Testing text extraction (entire page)...');
    const textResult = await getText();
    console.log(`Text length: ${textResult.text.length} characters`);
    console.log('First 200 characters:', textResult.text.substring(0, 200));

    if (textResult.success && textResult.text.length > 0) {
      console.log('✓ Text extraction successful');
    } else {
      console.log('✗ Text extraction failed');
      console.error('Error message:', textResult.message);
    }

    // Test HTML extraction - entire page
    console.log('\n4. Testing HTML extraction (entire page)...');
    const htmlResult = await getHTML();
    console.log(`HTML length: ${htmlResult.html.length} characters`);
    console.log('First 200 characters:', htmlResult.html.substring(0, 200));

    if (htmlResult.success && htmlResult.html.length > 0) {
      console.log('✓ HTML extraction successful');
    } else {
      console.log('✗ HTML extraction failed');
      console.error('Error message:', htmlResult.message);
    }

    // Test text extraction - specific selector
    console.log('\n5. Testing text extraction (specific selector)...');
    const headlineResult = await getText('h1');
    if (headlineResult.success && headlineResult.text.length > 0) {
      console.log('✓ Headline extraction successful:', headlineResult.text);
    } else {
      console.log('✗ Headline extraction failed');
      console.error('Error message:', headlineResult.message);

      // Try another common selector
      const altHeadlineResult = await getText('div[role="heading"]');
      if (altHeadlineResult.success && altHeadlineResult.text.length > 0) {
        console.log('✓ Alternative headline extraction successful:', altHeadlineResult.text);
      }
    }

    console.log('\n=== TEST SUMMARY ===');
    console.log('Browser automation test completed');
  } catch (error) {
    console.error('\nFATAL ERROR:', error);
  }
}

main().catch(console.error);
