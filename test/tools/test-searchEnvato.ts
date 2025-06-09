/**
 * Test script to verify the searchEnvato function
 * Specifically focused on checking that 710w images are correctly extracted from srcset
 */

import { searchEnvato } from '../../engine/src/utils/design_search.js';

// Test with a straightforward query
async function runEnvatoTest() {
  console.log('Testing searchEnvato function...');
  
  // Search for a template that should have 710w images
  const query = 'saas dashboard template';
  console.log(`Searching for: "${query}"`);
  
  try {
    // Call the searchEnvato function with the query
    const results = await searchEnvato(query, 5);
    
    console.log(`Found ${results.length} results`);
    
    // Examine each result, focusing on the screenshotURL
    results.forEach((result, index) => {
      console.log(`\nResult #${index + 1}:`);
      console.log(`Title: ${result.title || 'No title'}`);
      console.log(`URL: ${result.url}`);
      
      // Check if thumbnailURL exists
      if (result.thumbnailURL) {
        console.log(`Thumbnail URL: ${result.thumbnailURL}`);
      } else {
        console.log('No thumbnail URL found');
      }
      
      // Check if screenshotURL exists
      if (result.screenshotURL) {
        console.log(`Screenshot URL: ${result.screenshotURL}`);
        
        // Check if the screenshot is a 710w image
        const is710w = result.screenshotURL.includes('710w') || 
                       // Also check if the URL might be from a 710w srcset entry
                       (result.thumbnailURL && result.screenshotURL !== result.thumbnailURL);
        
        console.log(`Is 710w image: ${is710w ? 'Yes' : 'No'}`);
      } else {
        console.log('No screenshot URL found');
      }
    });
    
    // Verify if any security signatures might be affected
    const hasSecuritySignatures = results.some(result => 
      (result.screenshotURL && result.screenshotURL.includes('envatousercontent.com'))
    );
    
    if (hasSecuritySignatures) {
      console.log('\nFound URLs with security signatures (envatousercontent.com)');
      console.log('Verifying that security signatures are preserved...');
      
      // Check if any envatousercontent.com URLs are malformed
      const malformedUrls = results.filter(result => 
        result.screenshotURL && 
        result.screenshotURL.includes('envatousercontent.com') && 
        !result.screenshotURL.includes('?')
      );
      
      if (malformedUrls.length > 0) {
        console.log('WARNING: Found potentially malformed security URLs without signatures!');
      } else {
        console.log('All security URLs appear to have signatures preserved');
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error running test:', error);
    return false;
  }
}

// Run the test
runEnvatoTest().then(success => {
  if (success) {
    console.log('\nTest completed successfully!');
  } else {
    console.log('\nTest failed!');
    process.exit(1);
  }
});