// The table's search: the text in the box, Anki's search of the URL over the cards, and the rows it leaves, sorted.

import { useState } from 'react';
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
  const { node, error } = parseQuery(query);
  // The hook comes before the values built after it: the compiler cannot keep one that a call changes after the hook.
  const history = useSearchHistory(node, timing.nextDayAt);
  const { waiting } = history;
  const cards = buildBrowseCards(
    data.notes,
    data.noteTypes,
    data.tree.byId,
    data.rows,
    data.prefs,
    data.decayOf,
    now,
    data.draftOnly,
  );
  const found =
    !node || waiting
      ? []
      : matchCards(
          node,
          searchContext(
            data.tree.nodes,
            data.noteTypes,
            timing,
            data.prefs.learnAheadMinutes,
            history.rated,
            history.introduced,
          ),
          cards,
        );
  const searchError = error ?? (found instanceof SearchError ? found.message : null);
  const matched = found instanceof SearchError ? [] : found;
  const base = view.mode === 'notes' ? notesOf(matched) : matched;
  const list = sortCards(base, view.sort.column, view.sort.descending, timing);
  return { text, setText, waiting, searchError, list };
}
