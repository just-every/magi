/**
 * Claude concurrency limiter
 *
 * Ensures no more than a fixed number of Claude code provider instances
 * can be active simultaneously to prevent Anthropic authentication resets.
 */

export class ClaudeLimiter {
  private static readonly MAX_CONCURRENT = 2;
  private active = 0;

  /**
   * Attempt to acquire a Claude slot.
   *
   * @returns A release function to be called when the Claude operation completes
   * @throws Error if the concurrency limit is reached
   */
  async acquire(): Promise<() => void> {
    if (this.active >= ClaudeLimiter.MAX_CONCURRENT) {
      throw new Error('Claude concurrency limit reached');
    }

    this.active++;
    console.log(`[ClaudeLimiter] Acquired slot (${this.active}/${ClaudeLimiter.MAX_CONCURRENT} active)`);

    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.active--;
        console.log(`[ClaudeLimiter] Released slot (${this.active}/${ClaudeLimiter.MAX_CONCURRENT} active)`);
      }
    };
  }
}

// Singleton instance - shared across all imports
export const claudeLimiter = new ClaudeLimiter();
