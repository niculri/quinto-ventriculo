// The cards of «Practicar estas»: the list's, with the filters of the URL, fixed when they are first known (practicing
// changes nothing of them).

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useNow } from '../../../shared/hooks/useNow';
import { useAnkiTree } from '../../catalog/hooks/useAnkiTree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { cardsScope, unitDeckIds, unitNode } from '../../catalog/model/scope';
import type { CardRef } from '../../progress/api/repository';
import { failedOf } from '../model/dayCards';
import { NO_FILTERS, applyFilters, parseKind, parseOrigins, parseState } from '../model/filters';
import { groupNotes } from '../model/groups';
import { practiceCards } from '../model/practice';
import { searchQuery } from '../model/search';
import { useCardsData } from './useCardsData';
import { useDayCards } from './useDayCards';
import { useFailed } from './useFailed';
import { useTextMatch } from './useTextMatch';

export function usePracticeCards(node: CourseDeckNode) {
  const { catalog, tree } = useAnkiTree();
  const [params] = useSearchParams();
  const scope = useMemo(
    () => (catalog.data ? cardsScope(catalog.data, node) : null),
    [catalog.data, node],
  );
  const now = useNow(60_000);
  const cards = useCardsData(scope, tree, now);
  const data = cards.data;
  const failed = useFailed(data?.prefs, now);
  const q = params.get('q') ?? '';
  const text = useTextMatch(data, searchQuery(q, !!data?.prefs.fullAnki), tree);
  const day = useDayCards(scope, data, params.get('day'));
  const state = parseState(params.get('state'));
  const queue = useMemo(() => {
    const failedCards = failedOf(day.value, failed.data);
    if (!data || !scope || !failedCards || text.waiting || day.waiting) return null;
    const unit = unitNode(scope.node, params.get('unit') ?? '');
    const { matched } = applyFilters(data.notes, {
      ...NO_FILTERS,
      unitDecks: unitDeckIds(unit),
      text: text.keys,
      day: day.value?.keys ?? null,
      failed: failedCards,
      state,
      origins: parseOrigins(params.get('origin')),
      kind: parseKind(params.get('kind')),
    });
    return practiceCards(groupNotes(matched), state);
  }, [data, scope, failed.data, text, day, state, params]);

  // The round starts from what the list had when it was opened: practicing changes nothing of it.
  const [first, setFirst] = useState<CardRef[] | null>(null);
  if (first === null && queue) setFirst(queue);
  return { params, cards, first };
}
