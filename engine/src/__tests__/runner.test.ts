
import { describe, it, expect, vi } from 'vitest';
import { Runner } from '../utils/runner';

// Mock the stream provider to simulate responses
const mockStreamProvider = {
  stream: vi.fn(),
};

vi.mock('@just-every/ensemble', async () => {
  const original = await vi.importActual('@just-every/ensemble');
  return {
    ...original,
    streamProvider: (provider, model, options) => {
        return mockStreamProvider;
    }
  };
});

describe('Runner', () => {
  it('should not send a message to the Claude API ending with a thinking block', async () => {
    // Arrange
    const agent = {
      model: 'anthropic/claude-3-opus-20240229',
      // other necessary agent properties
    };
    const history = [{ role: 'user', content: 'test' }];
    const prompt = 'test prompt';
    
    // Act
    await Runner.runStreamedWithTools(agent, prompt, history);

    // Assert
    const sentMessages = mockStreamProvider.stream.mock.calls[0][0];
    const lastMessage = sentMessages[sentMessages.length - 1];
    expect(lastMessage.content.endsWith('<thinking>')).toBe(false);
  });
});
