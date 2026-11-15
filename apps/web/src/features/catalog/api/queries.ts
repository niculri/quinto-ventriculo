// The catalog's reads, with their keys: the catalog and a note's article.
import { queryOptions } from '@tanstack/react-query';
import type { ApiClient } from '../../../shared/lib/api';

export const catalogKeys = {
  catalog: ['catalog'] as const,
  note: (slug: string) => ['note', slug] as const,
};

export const catalogQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: catalogKeys.catalog,
    queryFn: ({ signal }) => api.catalog(signal),
    staleTime: 5 * 60_000,
  });

export const noteQuery = (api: ApiClient, slug: string) =>
  queryOptions({
    queryKey: catalogKeys.note(slug),
    queryFn: ({ signal }) => api.note(slug, signal),
    // Image URLs last at least one hour; 10 minutes so that a piece taken off the site stops showing soon.
    staleTime: 10 * 60_000,
    gcTime: 45 * 60_000,
  });
