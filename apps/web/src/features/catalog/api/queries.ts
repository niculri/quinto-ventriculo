// The catalog's reads, with their keys: the catalog and a note's article.
import { queryOptions } from '@tanstack/react-query';
import type { ApiClient } from '../../../shared/lib/api';
import { CONTENT_QUERY } from '../../../shared/lib/contentQuery';

export const catalogKeys = {
  catalog: ['catalog'] as const,
  published: ['catalog', 'published'] as const,
  publishedDeck: (deckId: string) => ['deck', 'published', deckId] as const,
  note: (slug: string) => ['note', slug] as const,
};

export const catalogQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: catalogKeys.catalog,
    queryFn: ({ signal }) => api.catalog(signal),
    staleTime: 5 * 60_000,
    meta: CONTENT_QUERY,
  });

export const noteQuery = (api: ApiClient, slug: string) =>
  queryOptions({
    queryKey: catalogKeys.note(slug),
    queryFn: ({ signal }) => api.note(slug, signal),
    meta: CONTENT_QUERY,
    // Image URLs last at least one hour; 10 minutes so that a piece taken off the site stops showing soon.
    staleTime: 10 * 60_000,
    gcTime: 45 * 60_000,
  });

/** The admin mode's reading of what the students have: the catalog they get, a course turned off included. */
export const publishedCatalogQuery = (api: ApiClient, enabled: boolean) =>
  queryOptions({
    queryKey: catalogKeys.published,
    queryFn: ({ signal }) => api.catalog(signal, { published: true }),
    meta: CONTENT_QUERY,
    staleTime: 5 * 60_000,
    enabled,
  });

/** A deck as the students have it; a 404 is a deck they do not have yet. */
export const publishedDeckQuery = (api: ApiClient, deckId: string, enabled: boolean) =>
  queryOptions({
    queryKey: catalogKeys.publishedDeck(deckId),
    queryFn: ({ signal }) => api.deck(deckId, signal, { published: true }),
    meta: CONTENT_QUERY,
    staleTime: 5 * 60_000,
    enabled: enabled && !!deckId,
  });
