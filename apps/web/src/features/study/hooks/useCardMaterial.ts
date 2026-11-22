// The material (article and test) of the deck a card is in, read from the catalog.
import { useMemo } from 'react';
import { useCatalog } from '../../catalog/hooks/useCatalog';
import { materialByDeck } from '../model/material';
import type { CardMaterial } from '../model/material';

export function useCardMaterial(deckId: string | undefined): CardMaterial | null {
  const catalog = useCatalog();
  const map = useMemo(() => (catalog.data ? materialByDeck(catalog.data) : null), [catalog.data]);
  return deckId ? (map?.get(deckId) ?? null) : null;
}
