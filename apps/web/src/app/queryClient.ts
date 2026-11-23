// The site's QueryClient: how reads retry and how writes behave without a connection.
import { QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from '../shared/lib/api';

/** What waiting a 429 asks for is honored, up to half a minute; without it, a short wait. */
const RATE_LIMITED_WAIT_MS = { fallback: 10_000, max: 30_000 };

const isRateLimited = (error: unknown): error is ApiRequestError =>
  error instanceof ApiRequestError && error.status === 429;

/** react-query's own back-off for everything else: 1 s, 2 s, 4 s… up to 30 s. */
function retryDelay(attempt: number, error: unknown): number {
  if (isRateLimited(error)) {
    const asked =
      error.retryAfter === null ? RATE_LIMITED_WAIT_MS.fallback : error.retryAfter * 1000;
    return Math.min(asked, RATE_LIMITED_WAIT_MS.max);
  }
  return Math.min(1000 * 2 ** attempt, 30_000);
}

/**
 * Every write (`useMutation`) goes out at once and fails in view when there is no connection: with the default
 * `online` mode it would sit paused, with its button on «saving» and no message, until the connection came back.
 * Set here and nowhere else (a test fixes that), so that a new write has it without asking.
 */
export const WRITE_DEFAULTS = { networkMode: 'always' } as const;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A 401, 403 or 404 is not fixed by retrying; a 429 is, after the wait it asks for.
        retry: (attempts, error) =>
          (isRateLimited(error) ||
            !(error instanceof ApiRequestError && error.status >= 400 && error.status < 500)) &&
          attempts < 2,
        retryDelay,
        refetchOnWindowFocus: false,
      },
      mutations: WRITE_DEFAULTS,
    },
  });
}
