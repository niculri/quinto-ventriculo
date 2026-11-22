// The material (article and test) of the deck a card is in, read from the catalog.

import { useCatalog } from '../../catalog/hooks/useCatalog';
import { materialByDeck } from '../model/material';
import type { CardMaterial } from '../model/material';

// Apart from the lookup: built with it, the compiler would build the map again for each deck a card comes from.
function useMaterialByDeck() {
  const catalog = useCatalog();
  return catalog.data ? materialByDeck(catalog.data) : null;
}

export function useCardMaterial(deckId: string | undefined): CardMaterial | null {
  const map = useMaterialByDeck();
  return deckId ? (map?.get(deckId) ?? null) : null;
}
