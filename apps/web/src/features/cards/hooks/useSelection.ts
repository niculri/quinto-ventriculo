// The table's selection, as in Anki: a click chooses a row, Ctrl/⌘ adds or takes one away, Mayús a range; the
// current card is in the URL.

import { useState } from 'react';
import type { SetURLSearchParams } from 'react-router';
import { cardKey } from '@qv/study';
import { cardsOfRows } from '../model/browseCards';
import type { BrowseCard } from '../model/browseCards';
import type { ViewPrefs } from './useViewPrefs';

export interface SelectKeys {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export function useSelection({
  list,
  mode,
  params,
  setParams,
}: {
  list: BrowseCard[];
  mode: ViewPrefs['mode'];
  params: URLSearchParams;
  setParams: SetURLSearchParams;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const urlCard = params.get('note')
    ? cardKey({ noteGuid: params.get('note')!, ord: Number(params.get('ord') ?? '0') })
    : null;
  const currentKey =
    urlCard === null ? null : mode === 'notes' ? `note:${params.get('note')}` : urlCard;
  const current = list.find((c) => c.key === currentKey) ?? null;
  const effectiveSelection = selected.size ? selected : new Set(current ? [current.key] : []);

  const setCurrent = (c: BrowseCard | null) => {
    const next = new URLSearchParams(params);
    if (c) {
      next.set('note', c.noteGuid);
      next.set('ord', String(c.ord));
    } else {
      next.delete('note');
      next.delete('ord');
    }
    setParams(next, { replace: true });
  };

  const select = (c: BrowseCard, e: SelectKeys) => {
    if (e.shiftKey && anchor) {
      const a = list.findIndex((x) => x.key === anchor);
      const b = list.findIndex((x) => x.key === c.key);
      const [from, to] = a < b ? [a, b] : [b, a];
      setSelected(new Set(list.slice(from, to + 1).map((x) => x.key)));
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(effectiveSelection);
      if (next.has(c.key)) next.delete(c.key);
      else next.add(c.key);
      setSelected(next);
      setAnchor(c.key);
    } else {
      setSelected(new Set([c.key]));
      setAnchor(c.key);
    }
    setCurrent(c);
  };

  const chosen = (): BrowseCard[] =>
    cardsOfRows(
      list.filter((c) => effectiveSelection.has(c.key)),
      mode,
    );
  const focus = current ?? list.find((c) => effectiveSelection.has(c.key)) ?? null;
  return {
    urlCard,
    current,
    effectiveSelection,
    select,
    chosen,
    focus,
    clear: () => setSelected(new Set()),
    selectAll: () => setSelected(new Set(list.map((c) => c.key))),
  };
}
