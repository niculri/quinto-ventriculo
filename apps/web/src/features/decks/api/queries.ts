// Data hooks for a deck from the API and for a card with its signed images.

import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../shared/hooks/useApi';
import type { ApiClient } from '../../../shared/lib/api';

export function useDeck(deckId: string, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: ['deck', deckId],
    queryFn: ({ signal }) => api.deck(deckId, signal),
    staleTime: 5 * 60_000,
    enabled: enabled && !!deckId,
  });
}

export function cardQuery(api: ApiClient, noteGuid: string, ord: number) {
  return {
    queryKey: ['card', noteGuid, ord],
    queryFn: ({ signal }: { signal: AbortSignal }) => api.card(noteGuid, ord, signal),
    // 10 minutes: a card taken off the site stops showing soon.
    staleTime: 10 * 60_000,
    gcTime: 45 * 60_000,
  };
}

export function useCard(noteGuid: string, ord: number) {
  const api = useApi();
  return useQuery(cardQuery(api, noteGuid, ord));
}
