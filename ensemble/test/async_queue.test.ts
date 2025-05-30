import { describe, it, expect, vi } from 'vitest';
import { AsyncQueue } from '../utils/async_queue.js';

describe('AsyncQueue', () => {
    it('should handle basic push and iteration', async () => {
        const queue = new AsyncQueue<number>();
        const values: number[] = [];

        // Push some values
        queue.push(1);
        queue.push(2);
        queue.push(3);
        queue.complete();

        // Iterate and collect
        for await (const value of queue) {
            values.push(value);
        }

        expect(values).toEqual([1, 2, 3]);
    });

    it('should handle async iteration with delayed pushes', async () => {
        const queue = new AsyncQueue<string>();
        const values: string[] = [];

        // Start iteration in background
        const iterationPromise = (async () => {
            for await (const value of queue) {
                values.push(value);
            }
        })();

        // Push values with delays
        await new Promise(resolve => setTimeout(resolve, 10));
        queue.push('first');
        
        await new Promise(resolve => setTimeout(resolve, 10));
        queue.push('second');
        
        await new Promise(resolve => setTimeout(resolve, 10));
        queue.push('third');
        queue.complete();

        await iterationPromise;
        expect(values).toEqual(['first', 'second', 'third']);
    });

    it('should handle errors properly', async () => {
        const queue = new AsyncQueue<number>();
        const error = new Error('Test error');

        // Set error
        queue.setError(error);

        // Should throw when iterating
        await expect(async () => {
            for await (const _ of queue) {
                // Should not reach here
            }
        }).rejects.toThrow('Test error');
    });

    it('should handle completion without values', async () => {
        const queue = new AsyncQueue<string>();
        const values: string[] = [];

        queue.complete();

        for await (const value of queue) {
            values.push(value);
        }

        expect(values).toEqual([]);
    });

    it('should handle interleaved push and pull', async () => {
        const queue = new AsyncQueue<number>();
        const results: number[] = [];

        // Start consuming before producing
        const consumer = (async () => {
            for await (const value of queue) {
                results.push(value);
                // Simulate slow processing
                await new Promise(resolve => setTimeout(resolve, 5));
            }
        })();

        // Producer
        for (let i = 0; i < 5; i++) {
            queue.push(i);
            await new Promise(resolve => setTimeout(resolve, 3));
        }
        queue.complete();

        await consumer;
        expect(results).toEqual([0, 1, 2, 3, 4]);
    });

    it('should not allow pushing after completion', async () => {
        const queue = new AsyncQueue<number>();
        
        queue.push(1);
        queue.complete();
        
        // These should be ignored
        queue.push(2);
        queue.push(3);

        const values: number[] = [];
        for await (const value of queue) {
            values.push(value);
        }

        expect(values).toEqual([1]);
    });

    it('should handle multiple consumers (first wins)', async () => {
        const queue = new AsyncQueue<number>();
        
        queue.push(1);
        queue.push(2);
        queue.complete();

        const consumer1Values: number[] = [];
        const consumer2Values: number[] = [];

        // Two consumers trying to consume same queue
        const consumer1 = (async () => {
            for await (const value of queue) {
                consumer1Values.push(value);
            }
        })();

        const consumer2 = (async () => {
            for await (const value of queue) {
                consumer2Values.push(value);
            }
        })();

        await Promise.all([consumer1, consumer2]);

        // Only one consumer should get all values
        expect(consumer1Values.length + consumer2Values.length).toBe(2);
        expect([...consumer1Values, ...consumer2Values].sort()).toEqual([1, 2]);
    });
});