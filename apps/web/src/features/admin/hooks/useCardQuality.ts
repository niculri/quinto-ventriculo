// «Tarjetas»'s figures of a deck from the API, with the indexes of the assessments its cards are in (their code and
// front).
import { useQueries, useQuery } from '@tanstack/react-query';
import { useApi } from '../../../shared/hooks/useApi';
import { cardIndexQuery } from '../../cards/api/queries';
import type { AnkiTree, CourseDeckNode } from '../../catalog/model/tree';
import { cardQualityQuery } from '../api/queries';
import { indexRefs } from '../model/cardQuality';

/** `deck`: null when there is nothing to look at, and then nothing is asked. */
export function useCardQuality(deck: CourseDeckNode | null, tree: AnkiTree | null) {
  const api = useApi();
  const query = useQuery({ ...cardQualityQuery(api, deck?.id ?? ''), enabled: deck !== null });
  const report = query.data?.status === 'ok' ? query.data : null;
  const refs = indexRefs([...(report?.hardest ?? []), ...(report?.suspicious ?? [])], tree);
  const indexes = useQueries({
    queries: refs.map((r) => cardIndexQuery(api, r)),
    combine: (results) => results.flatMap((r) => (r.data ? [r.data] : [])),
  });
  return { query, indexes };
}
