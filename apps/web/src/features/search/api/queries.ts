// The search's read, with its key: the results of a text, keeping the previous ones while the next arrive.
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { ApiClient } from '../../../shared/lib/api';
import { CONTENT_QUERY } from '../../../shared/lib/contentQuery';

const searchKeys = {
  results: (q: string, limit: number) => ['search', q, limit] as const,
};

export const searchQuery = (api: ApiClient, q: string, limit: number) =>
  queryOptions({
    queryKey: searchKeys.results(q, limit),
    queryFn: ({ signal }) => api.search(q, limit, signal),
    meta: CONTENT_QUERY,
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
