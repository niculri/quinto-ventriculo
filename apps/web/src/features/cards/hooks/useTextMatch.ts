// The cards page's search box: the keys of the cards its text finds (in Anki's syntax in «Modo avanzado»), and what
// is wrong with it.

import { useMemo } from 'react';
import { timingFor } from '@qv/study';
import type { AnkiTree } from '../../catalog/model/tree';
import type { CardsData } from '../model/cardsData';
import { parseQuery, searchContext, textKeys } from '../model/search';
import { useSearchHistory } from './useSearchHistory';

export function useTextMatch(data: CardsData | undefined, query: string, tree: AnkiTree | null) {
  const parsed = useMemo(
    () => (query.trim() ? parseQuery(query) : { node: null, error: null }),
    [query],
  );
  const timing = data ? timingFor(data.prefs) : null;
  const history = useSearchHistory(parsed.node, timing ? timing.nextDayAt : null);
  const { waiting } = history;
  const result = useMemo(() => {
    if (!parsed.node || !data || !tree || waiting) return { keys: null, error: parsed.error };
    const ctx = searchContext(
      tree.nodes,
      data.noteTypes,
      timingFor(data.prefs),
      data.prefs.learnAheadMinutes,
      history.rated,
      history.introduced,
    );
    return textKeys(parsed.node, ctx, data.cards);
  }, [parsed, data, tree, waiting, history.rated, history.introduced]);
  return { ...result, waiting: !!parsed.node && waiting };
}
