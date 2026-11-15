// The table's view in this browser: cards or notes, the columns chosen and the sort.

import { useState } from 'react';
import { storageKeys } from '../../../shared/lib/storage';
import { COLUMNS, DEFAULT_COLUMNS } from '../model/browseCards';
import type { ColumnKey } from '../model/browseCards';

const PREFS_KEY = storageKeys.browserView;

export interface ViewPrefs {
  mode: 'cards' | 'notes';
  columns: ColumnKey[];
  sort: { column: ColumnKey; descending: boolean };
}

const DEFAULT_VIEW: ViewPrefs = {
  mode: 'cards',
  columns: DEFAULT_COLUMNS,
  sort: { column: 'sortField', descending: false },
};

export function useViewPrefs() {
  const [view, setView] = useState<ViewPrefs>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as ViewPrefs | null;
      const known = new Set(COLUMNS.map((c) => c.key));
      if (saved && Array.isArray(saved.columns) && saved.columns.every((c) => known.has(c))) {
        return { ...DEFAULT_VIEW, ...saved };
      }
    } catch {
      // nothing saved, or blocked storage
    }
    return DEFAULT_VIEW;
  });
  const update = (patch: Partial<ViewPrefs>) =>
    setView((v) => {
      const next = { ...v, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // blocked storage: for this visit
      }
      return next;
    });
  return [view, update] as const;
}
