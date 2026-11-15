// A card from the API, with its signed images.

import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../shared/hooks/useApi';
import { cardQuery } from '../api/queries';

export function useCard(noteGuid: string, ord: number) {
  const api = useApi();
  return useQuery(cardQuery(api, noteGuid, ord));
}
