// A Workers rate limiting binding as the API's limiter: approximate and per Cloudflare location, as the binding is.
import type { RateLimiter } from '../../ports/rateLimit';

/** A binding that fails lets the request through: a broken limiter must not take the site down with it. */
export function bindingRateLimiter(binding: RateLimit): RateLimiter {
  return {
    async allow(key) {
      try {
        return (await binding.limit({ key })).success;
      } catch (e) {
        console.error('rate limit:', e);
        return true;
      }
    },
  };
}
