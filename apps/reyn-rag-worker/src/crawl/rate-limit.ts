/**
 * Per-host politeness throttle (pure: clock + sleep are injected so it's
 * unit-tested with no real timers). `wait()` ensures successive calls are
 * spaced by at least `minIntervalMs`: it sleeps only for the time still owed
 * since the previous call, and not at all once enough wall-clock has elapsed.
 */
export interface RateLimiterDeps {
  /** Current time in ms (e.g. `Date.now`). */
  now: () => number;
  /** Resolves after roughly `ms` ms (e.g. a setTimeout wrapper). */
  sleep: (ms: number) => Promise<void>;
  /** Minimum spacing between successive `wait()` resolutions, in ms. */
  minIntervalMs: number;
}

export class RateLimiter {
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly minIntervalMs: number;
  /** Wall-clock of the previous `wait()` resolution; null until first call. */
  private last: number | null = null;

  constructor(deps: RateLimiterDeps) {
    this.now = deps.now;
    this.sleep = deps.sleep;
    this.minIntervalMs = Math.max(0, deps.minIntervalMs);
  }

  /** Block until at least `minIntervalMs` has elapsed since the last call. */
  async wait(): Promise<void> {
    const current = this.now();
    if (this.last !== null) {
      const elapsed = current - this.last;
      const remaining = this.minIntervalMs - elapsed;
      if (remaining > 0) {
        await this.sleep(remaining);
      }
    }
    // Anchor on the post-sleep clock so drift in `sleep` doesn't accumulate.
    this.last = this.now();
  }
}
