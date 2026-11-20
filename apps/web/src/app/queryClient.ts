// The site's QueryClient: how reads retry and how writes behave without a connection.
import { QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from '../shared/lib/api';

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
        // A 401, 403 or 404 is not fixed by retrying.
        retry: (attempts, error) =>
          !(error instanceof ApiRequestError && error.status >= 400 && error.status < 500) &&
          attempts < 2,
        refetchOnWindowFocus: false,
      },
      mutations: WRITE_DEFAULTS,
    },
  });
}
