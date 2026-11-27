// «Tarjetas»'s figures of a deck from the API, with the indexes of the assessments its cards are in (their code and
// front).
import { useQueries, useQuery } from '@tanstack/react-query';
import { useApi } from '../../../shared/hooks/useApi';
import type { Catalog } from '@qv/schema';
import { cardIndexQuery } from '../../cards/api/queries';
import type { AnkiTree, CourseDeckNode } from '../../catalog/model/tree';
import { cardQualityQuery } from '../api/queries';

export function useCardQuality(
  deck: CourseDeckNode | null,
  catalog: Catalog | undefined,
  tree: AnkiTree | null,
) {
  const api = useApi();
  const query = useQuery({ ...cardQualityQuery(api, deck?.id ?? ''), enabled: deck !== null });
  const report = query.data?.status === 'ok' ? query.data : null;
  const wanted = new Set(
    [...(report?.hardest ?? []), ...(report?.suspicious ?? [])].map(
      (c) => tree?.byId.get(c.deckId)?.assessmentId,
    ),
  );
  const refs = (catalog?.semesters ?? [])
    .flatMap((s) => s.courses.flatMap((c) => c.assessments))
    .filter((a) => wanted.has(a.id))
    .flatMap((a) => (a.cardIndex ? [{ id: a.id, hash: a.cardIndex.hash }] : []));
  const indexes = useQueries({
    queries: refs.map((r) => cardIndexQuery(api, r)),
    combine: (results) => results.flatMap((r) => (r.data ? [r.data] : [])),
  });
  return { query, indexes };
}
