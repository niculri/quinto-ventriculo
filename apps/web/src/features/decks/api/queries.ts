// What the decks' pages read from the API, with their keys: a deck and a card with its signed images.

import { queryOptions } from '@tanstack/react-query';
import type { ApiClient } from '../../../shared/lib/api';
import { CONTENT_QUERY } from '../../../shared/lib/contentQuery';

/** The cards pages read a card with the same key: the old browser shares its cache. */
export const deckKeys = {
  deck: (deckId: string) => ['deck', deckId] as const,
  card: (noteGuid: string | null, ord: number) => ['card', noteGuid, ord] as const,
};

export const deckQuery = (api: ApiClient, deckId: string, enabled: boolean) =>
  queryOptions({
    queryKey: deckKeys.deck(deckId),
    queryFn: ({ signal }) => api.deck(deckId, signal),
    meta: CONTENT_QUERY,
    staleTime: 5 * 60_000,
    enabled: enabled && !!deckId,
  });

export const cardQuery = (api: ApiClient, noteGuid: string, ord: number) =>
  queryOptions({
    queryKey: deckKeys.card(noteGuid, ord),
    queryFn: ({ signal }: { signal: AbortSignal }) => api.card(noteGuid, ord, signal),
    meta: CONTENT_QUERY,
    // 10 minutes: a card taken off the site stops showing soon.
    staleTime: 10 * 60_000,
    gcTime: 45 * 60_000,
  });
