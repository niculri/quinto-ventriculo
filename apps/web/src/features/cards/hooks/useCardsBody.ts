// The cards page's state: its filters in the URL, the cards they leave grouped by lecture, the text, day and
// «Falladas» readings, and a pasted code that opens its card.

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { CardsQuery } from '../../../shared/lib/paths';
import { useNow } from '../../../shared/hooks/useNow';
import type { AnkiTree } from '../../catalog/model/tree';
import { lectureTitle, unitDeckIds, unitNode } from '../../catalog/model/scope';
import type { CardsScope } from '../../catalog/model/scope';
import { NO_FILTERS, applyFilters, parseKind, parseOrigins, parseState } from '../model/filters';
import { groupNotes } from '../model/groups';
import { noteByCode, searchQuery } from '../model/search';
import { practiceCards } from '../model/practice';
import type { Filters } from '../model/filters';
import { cardParam } from '../model/urlState';
import { failedOf } from '../model/dayCards';
import { useCardsData } from './useCardsData';
import { useDayCards } from './useDayCards';
import { useFailed } from './useFailed';
import { useTextMatch } from './useTextMatch';
import { useThumbQuery } from './useThumbQuery';
import { useHideAnswers } from './useHideAnswers';

export function useCardsBody(scope: CardsScope, tree: AnkiTree) {
  const [params, setParams] = useSearchParams();
  const now = useNow(60_000);
  const cards = useCardsData(scope, tree, now);
  const data = cards.data;
  const full = !!data?.prefs.fullAnki;
  const table = full && params.get('view') === 'table';
  const unit = params.get('unit') ?? '';
  const unitDeck = unitNode(scope.node, unit);
  const state = parseState(params.get('state'));
  const originText = params.get('origin');
  // The compiler leaves this one without a cache (its output shows it), so it stays by hand.
  const origins = useMemo(() => parseOrigins(originText), [originText]);
  const kind = parseKind(params.get('kind'));
  const q = params.get('q') ?? '';
  const [hideAnswers, setHideAnswers] = useHideAnswers();
  const [panel, setPanel] = useState(false);
  const failed = useFailed(data?.prefs, now);
  const text = useTextMatch(data, table ? '' : searchQuery(q, full), tree);
  const day = useDayCards(scope, data, params.get('day'));
  const thumbs = useThumbQuery();

  const set = (patch: Partial<Record<keyof CardsQuery, string | null>>, replace = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    // At once: the control the student touched shows its new state in the same frame (it is controlled).
    setParams(next, { replace, flushSync: true });
  };

  const filters = useMemo<Filters>(
    () => ({
      ...NO_FILTERS,
      unitDecks: unitDeckIds(unitDeck),
      text: text.keys,
      day: day.value?.keys ?? null,
      failed: failedOf(day.value, failed.data) ?? new Set(),
      state,
      origins,
      kind,
    }),
    [unitDeck, text.keys, day.value, failed.data, state, origins, kind],
  );
  const result = useMemo(() => (data ? applyFilters(data.notes, filters) : null), [data, filters]);
  const lectures = useMemo(() => (result ? groupNotes(result.matched) : []), [result]);
  const practice = useMemo(() => practiceCards(lectures, state), [lectures, state]);

  useEffect(() => {
    if (!data || !q) return;
    const found = noteByCode(data.notes, q);
    if (!found) return;
    setParams(
      new URLSearchParams({
        card: cardParam({ noteGuid: found.note.guid, ord: found.cards[0]!.ord }),
      }),
      { replace: true },
    );
  }, [data, q, setParams]);

  const titles = useMemo(
    () => new Map(lectures.map((l) => [l.id, lectureTitle(scope.node, tree.byId.get(l.id))])),
    [lectures, scope.node, tree],
  );
  const lectureTitles = (id: string) => titles.get(id) ?? '';
  return {
    params,
    set,
    cards,
    data,
    full,
    table,
    unit,
    unitDeck,
    state,
    origins,
    kind,
    q,
    hideAnswers,
    setHideAnswers,
    panel,
    setPanel,
    failed,
    text,
    day,
    thumbs,
    filters,
    result,
    lectures,
    practice,
    lectureTitles,
  };
}

export type CardsBodyState = ReturnType<typeof useCardsBody>;
