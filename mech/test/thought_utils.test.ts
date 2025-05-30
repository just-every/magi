import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    set_thought_delay,
    getThoughtDelay,
    setDelayInterrupted,
    isDelayInterrupted,
    runThoughtDelay,
    getDelayAbortSignal,
    getThoughtTools
} from '../thought_utils.js';

describe('Thought Utils', () => {
    beforeEach(() => {
        // Reset state
        set_thought_delay('0');
        setDelayInterrupted(false);
    });

    describe('Thought delay management', () => {
        it('should set and get thought delay', () => {
            expect(getThoughtDelay()).toBe('0');
            
            set_thought_delay('2');
            expect(getThoughtDelay()).toBe('2');
            
            set_thought_delay('8');
            expect(getThoughtDelay()).toBe('8');
            
            set_thought_delay('32');
            expect(getThoughtDelay()).toBe('32');
        });

        it('should validate delay values', () => {
            const result = set_thought_delay('invalid' as any);
            expect(result).toContain('Invalid delay');
            expect(getThoughtDelay()).toBe('0'); // Should remain at previous value
        });

        it('should only accept valid delays', () => {
            const validDelays = ['0', '2', '4', '8', '16', '32', '64', '128'];
            validDelays.forEach(delay => {
                set_thought_delay(delay as any);
                expect(getThoughtDelay()).toBe(delay);
            });
        });
    });

    describe('Delay interruption', () => {
        it('should set and check interruption state', () => {
            expect(isDelayInterrupted()).toBe(false);
            
            setDelayInterrupted(true);
            expect(isDelayInterrupted()).toBe(true);
            
            setDelayInterrupted(false);
            expect(isDelayInterrupted()).toBe(false);
        });

        it('should get abort signal', () => {
            const signal = getDelayAbortSignal();
            expect(signal).toBeInstanceOf(AbortSignal);
            expect(signal.aborted).toBe(false);
            
            setDelayInterrupted(true);
            const signal2 = getDelayAbortSignal();
            expect(signal2.aborted).toBe(true);
        });
    });

    describe('runThoughtDelay', () => {
        it('should complete immediately with 0 delay', async () => {
            set_thought_delay('0');
            const start = Date.now();
            
            await runThoughtDelay({} as any);
            
            const elapsed = Date.now() - start;
            expect(elapsed).toBeLessThan(50); // Should be nearly instant
        });

        it('should wait for specified delay', async () => {
            set_thought_delay('2');
            const start = Date.now();
            
            await runThoughtDelay({} as any);
            
            const elapsed = Date.now() - start;
            expect(elapsed).toBeGreaterThanOrEqual(2000);
            expect(elapsed).toBeLessThan(2100); // Some tolerance
        });

        it('should handle interruption', async () => {
            set_thought_delay('8'); // 8 seconds
            const start = Date.now();
            
            // Interrupt after 100ms
            setTimeout(() => setDelayInterrupted(true), 100);
            
            await runThoughtDelay({} as any);
            
            const elapsed = Date.now() - start;
            expect(elapsed).toBeLessThan(1000); // Should exit early
            expect(isDelayInterrupted()).toBe(false); // Should reset
        });

        it('should send status messages', async () => {
            const mockContext = {
                sendComms: vi.fn()
            };
            
            set_thought_delay('2');
            await runThoughtDelay(mockContext as any);
            
            // Should have sent delay start and complete messages
            expect(mockContext.sendComms).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'thought_delay',
                    delayMs: 2000
                })
            );
            
            expect(mockContext.sendComms).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'thought_complete'
                })
            );
        });
    });

    describe('getThoughtTools', () => {
        it('should return thought management tool', () => {
            const mockContext = {
                createToolFunction: vi.fn((fn, desc, params) => ({
                    function: fn,
                    definition: { type: 'function', function: { name: 'setThoughtDelay', description: desc, parameters: params } }
                }))
            };
            
            const tools = getThoughtTools(mockContext as any);
            
            expect(tools).toHaveLength(1);
            expect(mockContext.createToolFunction).toHaveBeenCalledWith(
                expect.any(Function),
                expect.stringContaining('thought delay'),
                expect.objectContaining({
                    delay: expect.any(String)
                })
            );
            
            // Test the tool function
            const toolFn = tools[0].function as any;
            const result = toolFn({ delay: '4' });
            expect(result).toContain('Thought delay set to 4 seconds');
            expect(getThoughtDelay()).toBe('4');
        });

        it('should handle missing createToolFunction', () => {
            const mockContext = {};
            const tools = getThoughtTools(mockContext as any);
            expect(tools).toEqual([]);
        });
    });

    describe('Edge cases', () => {
        it('should handle rapid interruptions', async () => {
            set_thought_delay('4');
            
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(runThoughtDelay({} as any));
                setDelayInterrupted(true);
                setDelayInterrupted(false);
            }
            
            await Promise.all(promises);
            expect(isDelayInterrupted()).toBe(false);
        });

        it('should handle concurrent delays', async () => {
            set_thought_delay('2');
            const mockContext = { sendComms: vi.fn() };
            
            // Start multiple delays
            const delay1 = runThoughtDelay(mockContext as any);
            const delay2 = runThoughtDelay(mockContext as any);
            
            // Interrupt after 500ms
            setTimeout(() => setDelayInterrupted(true), 500);
            
            await Promise.all([delay1, delay2]);
            
            // Both should have been interrupted
            expect(mockContext.sendComms).toHaveBeenCalledTimes(4); // 2 starts, 2 completes
        });
    });
});