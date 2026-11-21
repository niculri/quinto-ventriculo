// The table's search: the text in the box, Anki's search of the URL over the cards, and the rows it leaves, sorted.

import { useMemo, useState } from 'react';
import type { SchedTiming } from '@qv/srs';
import { SearchError } from '@qv/anki-search';
import { buildBrowseCards, notesOf } from '../model/browseCards';
import { sortCards } from '../model/columns';
import { matchCards, parseQuery, searchContext } from '../model/search';
import type { TableData } from '../model/tableData';
import type { ViewPrefs } from './useViewPrefs';
import { useSearchHistory } from './useSearchHistory';

export function useCardSearch({
  data,
  query,
  view,
  timing,
  now,
}: {
  data: TableData;
  query: string;
  view: ViewPrefs;
  timing: SchedTiming;
  now: number;
}) {
  const [text, setText] = useState(query);
  const [shownQuery, setShownQuery] = useState(query);
  if (shownQuery !== query) {
    setShownQuery(query);
    setText(query);
  }
  const cards = useMemo(
    () =>
      buildBrowseCards(
        data.notes,
        data.noteTypes,
        data.tree.byId,
        data.rows,
        data.prefs,
        data.decayOf,
        now,
      ),
    [data, now],
  );
  const parsed = useMemo(() => parseQuery(query), [query]);
  const history = useSearchHistory(parsed.node, timing.nextDayAt);
  const { waiting } = history;
  const found = useMemo(() => {
    if (!parsed.node || waiting) return [];
    const ctx = searchContext(
      data.tree.nodes,
      data.noteTypes,
      timing,
      data.prefs.learnAheadMinutes,
      history.rated,
      history.introduced,
    );
    return matchCards(parsed.node, ctx, cards);
  }, [parsed.node, waiting, cards, history.rated, history.introduced, data, timing]);
  const searchError = parsed.error ?? (found instanceof SearchError ? found.message : null);
  const list = useMemo(() => {
    const matched = found instanceof SearchError ? [] : found;
    const base = view.mode === 'notes' ? notesOf(matched) : matched;
    return sortCards(base, view.sort.column, view.sort.descending, timing);
  }, [found, view.mode, view.sort.column, view.sort.descending, timing]);
  return { text, setText, waiting, searchError, list };
}
