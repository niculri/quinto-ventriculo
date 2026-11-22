// The cards page's search box: the keys of the cards its text finds (in Anki's syntax in «Modo avanzado»), and what
// is wrong with it.

import { timingFor } from '@qv/study';
import type { AnkiTree } from '../../catalog/model/tree';
import type { CardsData } from '../model/cardsData';
import { parseQuery, searchContext, textKeys } from '../model/search';
import { useSearchHistory } from './useSearchHistory';

export function useTextMatch(data: CardsData | undefined, query: string, tree: AnkiTree | null) {
  const { node, error } = query.trim() ? parseQuery(query) : { node: null, error: null };
  const timing = data ? timingFor(data.prefs) : null;
  // The hook comes before the values built after it: the compiler cannot keep one that a call changes after the hook.
  const history = useSearchHistory(node, timing ? timing.nextDayAt : null);
  const { waiting } = history;
  const result =
    !node || !data || !tree || waiting
      ? { keys: null, error }
      : textKeys(
          node,
          searchContext(
            tree.nodes,
            data.noteTypes,
            timingFor(data.prefs),
            data.prefs.learnAheadMinutes,
            history.rated,
            history.introduced,
          ),
          data.cards,
        );
  return { ...result, waiting: !!node && waiting };
}
