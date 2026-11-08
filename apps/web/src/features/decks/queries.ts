import { useQuery } from '@tanstack/react-query';
import { useServices } from '../../app/services';

export function useDeck(deckId: string, enabled = true) {
  const { api } = useServices();
  return useQuery({
    queryKey: ['deck', deckId],
    queryFn: ({ signal }) => api.deck(deckId, signal),
    staleTime: 5 * 60_000,
    enabled: enabled && !!deckId,
  });
}

/** A card with its signed images (they last at least one hour). */
export function cardQuery(
  api: ReturnType<typeof useServices>['api'],
  noteGuid: string,
  ord: number,
) {
  return {
    queryKey: ['card', noteGuid, ord],
    queryFn: ({ signal }: { signal: AbortSignal }) => api.card(noteGuid, ord, signal),
    // 10 minutes: a card taken off the site (step 1.5) stops showing soon.
    staleTime: 10 * 60_000,
    gcTime: 45 * 60_000,
  };
}

export function useCard(noteGuid: string, ord: number) {
  const { api } = useServices();
  return useQuery(cardQuery(api, noteGuid, ord));
}
