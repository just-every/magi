/**
 * Unit tests for run_pty.ts
 */
import { describe, it, expect } from 'vitest';
import { runPty } from './run_pty.js';

describe('run_pty', () => {
    it('should use the provided messageId for all events', async () => {
        // Use a simple echo command to test
        const testMessageId = 'test-message-id-123';
        const { stream } = runPty('echo', ['hello world'], {
            cwd: process.cwd(),
            messageId: testMessageId,
        });

        // Collect all events to verify message_id
        const events = [];
        for await (const event of stream) {
            events.push(event);
        }

        // Check that we have at least two events (start and complete)
        expect(events.length).toBeGreaterThan(1);

        // Verify all events have the correct message_id
        for (const event of events) {
            expect(event.message_id).toBe(testMessageId);
        }
    });

    it('should respect emitComplete=false option', async () => {
        // Use echo command with emitComplete=false
        const { stream } = runPty('echo', ['hello'], {
            cwd: process.cwd(),
            emitComplete: false,
        });

        // Collect all events
        const events = [];
        for await (const event of stream) {
            events.push(event);
        }

        // Verify we don't have a message_complete event
        const completeEvents = events.filter(e => e.type === 'message_complete');
        expect(completeEvents.length).toBe(0);
    });

    it('should reset silence timeout for console events', async () => {
        // This is more difficult to test directly, as it involves timing
        // A meaningful test would require mocking the timeout and verifying it's reset
        // For now, we'll just test that the utility doesn't crash with a command
        // that produces console output
        const { stream } = runPty('echo', ['-e', '\\033[31mColored\\033[0m text'], {
            cwd: process.cwd(),
            silenceTimeoutMs: 1000, // Short timeout to detect issues
        });

        // Collect all events to complete the stream
        const events = [];
        for await (const event of stream) {
            events.push(event);
        }

        // Just verify we got some events
        expect(events.length).toBeGreaterThan(0);
    });
});
