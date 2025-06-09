/**
 * Generic async queue that allows pushing items and iterating over them asynchronously.
 * Used to bridge callback-based events to async iterator patterns.
 */
export class AsyncQueue<T> {
    private queue: T[] = [];
    private waiters: Array<(value: IteratorResult<T>) => void> = [];
    private completed = false;
    private errorState: unknown = null;

    /**
     * Push an item to the queue. If there are waiters, resolve the next one immediately.
     */
    push(item: T): void {
        if (this.completed) {
            // Silently ignore pushes after completion
            return;
        }

        if (this.waiters.length > 0) {
            const waiter = this.waiters.shift()!;
            waiter({ value: item, done: false });
        } else {
            this.queue.push(item);
        }
    }

    /**
     * Mark the queue as completed. No more items can be pushed.
     * Resolves any waiting iterators with done: true.
     */
    complete(): void {
        this.completed = true;
        while (this.waiters.length > 0) {
            const waiter = this.waiters.shift()!;
            waiter({ value: undefined, done: true });
        }
    }

    /**
     * Mark the queue as errored. Rejects any waiting iterators.
     */
    setError(err: unknown): void {
        this.errorState = err;
        this.completed = true;
        while (this.waiters.length > 0) {
            const waiter = this.waiters.shift()!;
            waiter({ value: undefined, done: true });
        }
    }

    /**
     * Get the async iterator for this queue
     */
    async *[Symbol.asyncIterator](): AsyncIterator<T> {
        while (true) {
            // If we have items in queue, yield them
            if (this.queue.length > 0) {
                const item = this.queue.shift()!;
                yield item;
                continue;
            }

            // If completed and no items, we're done
            if (this.completed) {
                if (this.errorState) {
                    throw this.errorState;
                }
                return;
            }

            // Wait for next item
            const result = await new Promise<IteratorResult<T>>((resolve) => {
                this.waiters.push(resolve);
            });

            if (result.done) {
                if (this.errorState) {
                    throw this.errorState;
                }
                return;
            }

            yield result.value;
        }
    }

    /**
     * Get the current queue size
     */
    get size(): number {
        return this.queue.length;
    }

    /**
     * Check if the queue is completed
     */
    get isCompleted(): boolean {
        return this.completed;
    }

    /**
     * Check if the queue has an error
     */
    get hasError(): boolean {
        return this.errorState !== null;
    }
}