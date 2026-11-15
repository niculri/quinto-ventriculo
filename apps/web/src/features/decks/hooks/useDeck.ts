// A deck from the API, with its cards and subdecks.

import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../shared/hooks/useApi';
import { deckQuery } from '../api/queries';

export function useDeck(deckId: string, enabled = true) {
  const api = useApi();
  return useQuery(deckQuery(api, deckId, enabled));
}
