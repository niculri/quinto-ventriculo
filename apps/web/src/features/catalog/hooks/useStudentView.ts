// What studying and counting go over: what the students have. In the admin mode the catalog and the decks are the
// draft's (to be looked at), so these read the published ones; for a student they are the catalog and deck themselves.
import { useQuery } from '@tanstack/react-query';
import type { DeckDetail } from '@qv/schema';
import { useApi } from '../../../shared/hooks/useApi';
import { ApiRequestError } from '../../../shared/lib/api';
import { publishedCatalogQuery, publishedDeckQuery } from '../api/queries';
import { useCatalog } from './useCatalog';

/** The catalog of the admin mode says so itself: only it has `adminOnly`. */
export function useIsAdminCatalog(): boolean {
  return useCatalog().data?.adminOnly !== undefined;
}

export function useStudentCatalog() {
  const api = useApi();
  const catalog = useCatalog();
  const admin = catalog.data?.adminOnly !== undefined;
  const published = useQuery(publishedCatalogQuery(api, admin));
  return admin ? published : catalog;
}

const NO_DECK = (deck: DeckDetail): DeckDetail => ({
  ...deck,
  noteCount: 0,
  cardCount: 0,
  subdecks: [],
  cards: [],
});

/** The deck with only the cards the students have; a deck that only the draft has is empty. */
export function useStudentDeck(deck: DeckDetail | undefined) {
  const api = useApi();
  const admin = useIsAdminCatalog();
  const published = useQuery(publishedDeckQuery(api, deck?.id ?? '', admin && !!deck));
  if (!admin) return { data: deck, error: null, refetch: () => undefined, isError: false };
  const draftOnly =
    published.error instanceof ApiRequestError && published.error.status === 404 && !!deck;
  return {
    data: draftOnly ? NO_DECK(deck) : published.data,
    error: draftOnly ? null : published.error,
    refetch: () => void published.refetch(),
    isError: published.isError && !draftOnly,
  };
}
