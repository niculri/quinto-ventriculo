// How many requests one student, or one address without a session, may make in a short window.
export interface RateLimiter {
  /** False once `key` used up its window: the request is answered 429 and does not count. */
  allow(key: string): Promise<boolean>;
}

/** The window of both limits, in seconds: what a refused request is told to wait (`Retry-After`). */
export const RATE_LIMIT_PERIOD = 10;

export const NO_RATE_LIMIT: RateLimiter = { allow: () => Promise.resolve(true) };
