// Test file for image_utils.ts
// To run these tests with Jest, you would need to install the dependencies:
// npm install --save-dev jest @types/jest ts-jest

// Importing but not using this function yet since tests are commented out
// import { extractBase64Image } from './image_utils.js';

// Commenting out the tests to avoid type errors - uncomment when Jest is properly set up
/*
describe('extractBase64Image', () => {
  const sampleImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('should extract a single image and replace with placeholder', () => {
    const content = `This is a message with an image: ${sampleImage} and some text after.`;
    const result = extractBase64Image(content);

    expect(result.found).toBe(true);
    expect(result.originalContent).toBe(content);
    expect(result.image_id).not.toBeNull();
    expect(Object.keys(result.images).length).toBe(1);
    expect(result.images[result.image_id as string]).toBe(sampleImage);
    expect(result.replaceContent).toContain('[image ');
    expect(result.replaceContent).toContain('This is a message with an image:');
    expect(result.replaceContent).toContain('and some text after.');
  });

  it('should handle multiple images', () => {
    const content = `Multiple images: ${sampleImage} middle text ${sampleImage}`;
    const result = extractBase64Image(content);

    expect(result.found).toBe(true);
    expect(Object.keys(result.images).length).toBe(2);
    expect(result.replaceContent).toContain('[image ');
    expect(result.replaceContent).toContain('Multiple images:');
    expect(result.replaceContent).toContain('middle text');
  });

  it('should return original content when no images are found', () => {
    const content = 'No images here';
    const result = extractBase64Image(content);

    expect(result.found).toBe(false);
    expect(result.originalContent).toBe(content);
    expect(result.replaceContent).toBe(content);
    expect(result.image_id).toBeNull();
    expect(Object.keys(result.images).length).toBe(0);
  });
});
*/
