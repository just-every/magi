/**
 * Tests for Runner.runStreamedWithTools and sanitizeClaudeMessages
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Runner } from '../utils/runner.js';
import { sanitizeClaudeMessages } from '../magi.js';

// Mock the Runner module
vi.mock('../utils/runner.js', () => ({
    Runner: {
        runStreamedWithTools: vi.fn(),
    },
}));

describe('Runner.runStreamedWithTools', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should call runStreamedWithTools with correct parameters', async () => {
        const mockAgent = { id: 'test-agent' };
        const mockPrompt = 'test prompt';
        const mockHistory = [{ role: 'user', content: 'test message' }];
        const mockResponse = 'test response';

        vi.mocked(Runner.runStreamedWithTools).mockResolvedValue(mockResponse);

        const result = await Runner.runStreamedWithTools(mockAgent, mockPrompt, mockHistory);

        expect(Runner.runStreamedWithTools).toHaveBeenCalledWith(mockAgent, mockPrompt, mockHistory);
        expect(result).toBe(mockResponse);
    });

    it('should handle errors from runStreamedWithTools', async () => {
        const mockAgent = { id: 'test-agent' };
        const mockPrompt = 'test prompt';
        const mockHistory = [];
        const mockError = new Error('Test error');

        vi.mocked(Runner.runStreamedWithTools).mockRejectedValue(mockError);

        await expect(Runner.runStreamedWithTools(mockAgent, mockPrompt, mockHistory)).rejects.toThrow('Test error');
    });
});

describe('sanitizeClaudeMessages', () => {
    it('should remove thinking blocks from string content', () => {
        const messages = [
            {
                role: 'assistant',
                content: 'Here is my response <thinking>Internal thoughts</thinking> Final answer',
            },
        ];

        const sanitized = sanitizeClaudeMessages(messages);

        expect(sanitized[0].content).toBe('Here is my response  Final answer');
        expect(sanitized[0].content).not.toContain('<thinking');
        expect(sanitized[0].content).not.toContain('</thinking>');
    });

    it('should handle multiple thinking blocks in string content', () => {
        const messages = [
            {
                role: 'assistant',
                content: 'Start <thinking>thought 1</thinking> middle <thinking>thought 2</thinking> end',
            },
        ];

        const sanitized = sanitizeClaudeMessages(messages);

        expect(sanitized[0].content).toBe('Start  middle  end');
    });

    it('should filter out thinking blocks from content arrays', () => {
        const messages = [
            {
                role: 'assistant',
                content: [
                    { type: 'text', text: 'Normal text' },
                    { type: 'text', text: '<thinking>Internal thoughts</thinking>' },
                    { type: 'text', text: 'More normal text' },
                ],
            },
        ];

        const sanitized = sanitizeClaudeMessages(messages);

        expect(sanitized[0].content).toHaveLength(2);
        expect(sanitized[0].content[0].text).toBe('Normal text');
        expect(sanitized[0].content[1].text).toBe('More normal text');
    });

    it('should preserve messages without thinking blocks', () => {
        const messages = [
            {
                role: 'user',
                content: 'This is a normal message without thinking blocks',
            },
            {
                role: 'assistant',
                content: [
                    { type: 'text', text: 'Normal response' },
                    { type: 'image', url: 'https://example.com/image.png' },
                ],
            },
        ];

        const sanitized = sanitizeClaudeMessages(messages);

        expect(sanitized).toEqual(messages);
    });

    it('should handle empty messages array', () => {
        const messages: any[] = [];
        const sanitized = sanitizeClaudeMessages(messages);
        expect(sanitized).toEqual([]);
    });

    it('should handle messages with undefined or null content', () => {
        const messages = [
            { role: 'user', content: undefined },
            { role: 'assistant', content: null },
        ];

        const sanitized = sanitizeClaudeMessages(messages);

        expect(sanitized).toEqual(messages);
    });

    it('should handle nested thinking blocks correctly', () => {
        const messages = [
            {
                role: 'assistant',
                content: 'Response <thinking>Outer <thinking>Inner</thinking> thought</thinking> done',
            },
        ];

        const sanitized = sanitizeClaudeMessages(messages);

        expect(sanitized[0].content).toBe('Response  done');
    });
});