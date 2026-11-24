// A deck's statistics page: the student's numbers for the deck and everything below it, the advanced mode, and the
// code and front of the cards forgotten most often (from the indexes of their assessments).

import { useQueries, useQuery } from '@tanstack/react-query';
import { useApi } from '../../../shared/hooks/useApi';
import { useStudyRepository } from '../../progress/api/context';
import { usePreferences } from '../../progress/queries';
import { useCatalog } from '../../catalog/hooks/useCatalog';
import { cardsScope } from '../../catalog/model/scope';
import { descendants } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { cardIndexQuery } from '../../cards/api/queries';
import { cardStatsQuery } from '../api/queries';
import { hardCardRows } from '../model/hardCards';

export function useCardStats(node: CourseDeckNode) {
  const study = useStudyRepository();
  const api = useApi();
  const catalog = useCatalog().data;
  const { prefs } = usePreferences();
  const below = descendants(node);
  const query = useQuery(
    cardStatsQuery(
      study,
      node.id,
      below.map((n) => n.id),
    ),
  );
  const hardest = query.data?.hardest ?? [];
  const assessmentOf = new Map(below.map((n) => [n.id, n.assessmentId]));
  const wanted = new Set(hardest.map((h) => assessmentOf.get(h.deckId)));
  // A deck's screen is drawn once the catalog arrived: the fallback only satisfies the types.
  /* v8 ignore next -- @preserve */
  const assessments = catalog ? cardsScope(catalog, node).assessments : [];
  const refs = assessments
    .filter((a) => wanted.has(a.id))
    .flatMap((a) => (a.cardIndex ? [{ id: a.id, hash: a.cardIndex.hash }] : []));
  const indexes = useQueries({
    queries: refs.map((r) => cardIndexQuery(api, r)),
    combine: (results) => results.flatMap((r) => (r.data ? [r.data] : [])),
  });
  return {
    query,
    advanced: !!prefs?.fullAnki,
    hard: hardCardRows(hardest, indexes),
  };
}
