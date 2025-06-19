import { describe, it, expect, vi } from 'vitest';
import { Runner } from '../utils/runner';

// Mock ensembleRequest to capture the messages sent
let capturedMessages: any[] = [];

vi.mock('@just-every/ensemble', async () => {
    const original = await vi.importActual('@just-every/ensemble');
    return {
        ...original,
        ensembleRequest: vi.fn((messages, _agent) => {
            capturedMessages = messages;
            // Return an async generator that yields a message_complete event
            return (async function* () {
                yield {
                    type: 'message_complete',
                    content: 'Test response',
                };
            })();
        }),
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
        expect(capturedMessages.length).toBeGreaterThan(0);
        const lastMessage = capturedMessages[capturedMessages.length - 1];

        // The last message should not end with an unclosed thinking block
        if (lastMessage.content) {
            expect(lastMessage.content.endsWith('<thinking>')).toBe(false);
            expect(lastMessage.content.endsWith('</thinking>')).toBe(false);
        }
    });
});
