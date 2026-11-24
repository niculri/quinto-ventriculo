// A rate limiter in memory, a fixed window per key: what the Workers binding does, for the tests.
import type { RateLimiter } from '../../ports/rateLimit';

/** `now` in seconds; a refused request does not count, as with the binding. */
export function memoryRateLimiter(
  limit: number,
  periodSeconds: number,
  now: () => number,
): RateLimiter {
  const windows = new Map<string, { window: number; used: number }>();
  return {
    allow(key) {
      const window = Math.floor(now() / periodSeconds);
      const seen = windows.get(key);
      const used = seen?.window === window ? seen.used : 0;
      if (used >= limit) return Promise.resolve(false);
      windows.set(key, { window, used: used + 1 });
      return Promise.resolve(true);
    },
  };
}
