/**
 * Mock for the OpenAI module
 */
import { vi } from 'vitest';

class MockOpenAI {
  responses = {
    create: vi.fn().mockResolvedValue({
      [Symbol.asyncIterator]: async function*() {
        yield {
          type: 'response.in_progress',
          response: { id: 'mock-response-id' }
        };
        yield {
          type: 'response.output_text.delta',
          delta: 'Hello,',
          item_id: 'mock-message-id'
        };
        yield {
          type: 'response.output_text.delta',
          delta: ' world!',
          item_id: 'mock-message-id'
        };
        yield {
          type: 'response.output_text.done',
          text: 'Hello, world!',
          item_id: 'mock-message-id'
        };
        yield {
          type: 'response.completed',
          response: {
            id: 'mock-response-id',
            usage: {
              input_tokens: 10,
              output_tokens: 20,
              input_tokens_details: {
                cached_tokens: 5
              }
            }
          }
        };
      }
    })
  };
}

// Export the mock class as the default export
export default function(config: any) {
  return new MockOpenAI();
}
