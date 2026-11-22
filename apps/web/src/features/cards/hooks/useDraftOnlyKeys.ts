// The cards of a scope that only the draft has, in the admin mode: those of its indexes that the students' deck does not list.
import { useQuery } from '@tanstack/react-query';
import type { CardIndex } from '@qv/schema';
import { cardKey } from '@qv/study';
import { useApi } from '../../../shared/hooks/useApi';
import { ApiRequestError } from '../../../shared/lib/api';
import { publishedDeckQuery } from '../../catalog/api/queries';
import { useIsAdminCatalog } from '../../catalog/hooks/useStudentView';
import type { CardsScope } from '../../catalog/model/scope';

const NONE: ReadonlySet<string> = new Set();

/** `undefined` while it is not known; always empty for a student. */
export function useDraftOnlyKeys(
  scope: CardsScope | null,
  indexes: readonly CardIndex[] | undefined,
) {
  const api = useApi();
  const admin = useIsAdminCatalog();
  const students = useQuery(publishedDeckQuery(api, scope?.node.id ?? '', admin && !!scope));
  const theyHaveNone = students.error instanceof ApiRequestError && students.error.status === 404;
  if (!admin) return { keys: NONE, error: null, refetch: () => undefined };
  const known = !!indexes && (!!students.data || theyHaveNone);
  const have = new Set((students.data?.cards ?? []).map((c) => cardKey(c)));
  const keys = known
    ? new Set(
        indexes.flatMap((i) =>
          i.notes.flatMap((n) =>
            n.cards
              .map((c) => cardKey({ noteGuid: n.guid, ord: c.ord }))
              .filter((key) => !have.has(key)),
          ),
        ),
      )
    : undefined;
  return {
    keys,
    error: theyHaveNone ? null : students.error,
    refetch: () => void students.refetch(),
  };
}
