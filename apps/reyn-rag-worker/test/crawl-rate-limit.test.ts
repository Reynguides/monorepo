import { describe, expect, it } from "vitest";
import { RateLimiter } from "../src/crawl/rate-limit.ts";

/** A controllable clock + sleep that records every requested sleep duration. */
function makeClock(start = 0) {
  let t = start;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => t,
    sleep: async (ms: number): Promise<void> => {
      sleeps.push(ms);
      t += ms; // advancing the clock models time passing during the sleep.
      await Promise.resolve();
    },
    advance: (ms: number): void => {
      t += ms;
    },
  };
}

describe("RateLimiter", () => {
  it("does not sleep on the first call", async () => {
    const clock = makeClock();
    const rl = new RateLimiter({ now: clock.now, sleep: clock.sleep, minIntervalMs: 1000 });
    await rl.wait();
    expect(clock.sleeps).toEqual([]);
  });

  it("sleeps the remaining interval when calls are too close", async () => {
    const clock = makeClock();
    const rl = new RateLimiter({ now: clock.now, sleep: clock.sleep, minIntervalMs: 1000 });
    await rl.wait(); // anchors last = 0
    clock.advance(300); // only 300ms elapsed before the next call
    await rl.wait();
    expect(clock.sleeps).toEqual([700]); // owes 1000 - 300
  });

  it("does not sleep when enough time has already elapsed", async () => {
    const clock = makeClock();
    const rl = new RateLimiter({ now: clock.now, sleep: clock.sleep, minIntervalMs: 1000 });
    await rl.wait();
    clock.advance(1500); // more than the interval
    await rl.wait();
    expect(clock.sleeps).toEqual([]);
  });

  it("re-anchors on the post-sleep clock (no accumulated drift)", async () => {
    const clock = makeClock();
    const rl = new RateLimiter({ now: clock.now, sleep: clock.sleep, minIntervalMs: 1000 });
    await rl.wait(); // last = 0
    await rl.wait(); // 0 elapsed → sleeps 1000, clock now 1000, last = 1000
    await rl.wait(); // 0 elapsed → sleeps 1000 again
    expect(clock.sleeps).toEqual([1000, 1000]);
  });

  it("never sleeps when minIntervalMs is zero (or negative)", async () => {
    const clock = makeClock();
    const rl = new RateLimiter({ now: clock.now, sleep: clock.sleep, minIntervalMs: -5 });
    await rl.wait();
    await rl.wait();
    expect(clock.sleeps).toEqual([]);
  });
});
