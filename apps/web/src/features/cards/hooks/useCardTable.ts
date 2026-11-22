// The table's state: its data, the URL's search and selection, the view, the actions and the page's shortcuts.

import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { timingFor } from '@qv/study';
import { useNow } from '../../../shared/hooks/useNow';
import { combineSearch } from '../model/search';
import type { Combine } from '../model/search';
import type { TableSources } from '../model/tableData';
import { useActionRunner } from './useActionRunner';
import { useCardActions } from './useCardActions';
import { useCardSearch } from './useCardSearch';
import { useSelection } from './useSelection';
import { useTableData } from './useTableData';
import { useTableShortcuts } from './useTableShortcuts';
import { useViewPrefs } from './useViewPrefs';
import type { ViewPrefs } from './useViewPrefs';

export function useCardTable(sources: TableSources) {
  const data = useTableData(sources);
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const full = data.prefs.fullAnki;
  const [savedView, setView] = useViewPrefs();
  const view: ViewPrefs = full ? savedView : { ...savedView, mode: 'cards' };
  const now = useNow(30_000);
  // The same object until the preferences or the time change: the search is built again when it does.
  const timing = useMemo(() => timingFor(data.prefs, now), [data.prefs, now]);
  const search = useCardSearch({ data, query, view, timing, now });
  const { list } = search;
  const selection = useSelection({ list, mode: view.mode, params, setParams });
  const { chosen, focus } = selection;
  const runner = useActionRunner(full);
  const actions = useCardActions({ chosen, focus, timing, full, act: runner.act });
  const [filters, setFilters] = useState(false);
  const searchBox = useRef<HTMLInputElement>(null);

  const go = (q: string) => {
    const next = new URLSearchParams(params);
    if (q.trim()) next.set('q', q.trim());
    else next.delete('q');
    setParams(next, { replace: false });
    selection.clear();
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    go(search.text);
  };
  const onSidebar = (term: string, how: Combine, negate: boolean) => {
    setFilters(false);
    go(combineSearch(query, term, how, negate));
  };
  useTableShortcuts({
    full,
    busy: runner.busy,
    searchBox,
    undo: runner.undo,
    toggleSuspend: actions.toggleSuspend,
    toggleBury: actions.toggleBury,
    flag: actions.flag,
    forget: () => {
      if (chosen().length && !actions.blocked) actions.setForgetting(true);
    },
  });
  return {
    roots: sources.roots,
    data,
    params,
    setParams,
    query,
    full,
    view,
    setView,
    timing,
    search,
    selection,
    runner,
    actions,
    filters,
    setFilters,
    searchBox,
    go,
    onSubmit,
    onSidebar,
  };
}

export type CardTableState = ReturnType<typeof useCardTable>;
