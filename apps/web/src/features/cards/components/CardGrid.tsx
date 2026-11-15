// The table's grid: a header that sorts, and a fixed-height row per card or note, drawn only in view; the arrows,
// the pages, Home and End move the current row, with Mayús they select a range, and Ctrl/⌘+A selects every row.

import type { KeyboardEvent } from 'react';
import type { SchedTiming } from '@qv/srs';
import { card as cardStyle } from '../../../shared/ui/styles';
import { COLUMNS } from '../model/browseCards';
import type { BrowseCard, ColumnKey } from '../model/browseCards';
import { ROW, gridTarget, rowWindow } from '../model/grid';
import { useGridScroll } from '../hooks/useGridScroll';
import type { SelectKeys } from '../hooks/useSelection';
import type { ViewPrefs } from '../hooks/useViewPrefs';
import { GridHeader, GridRow } from './GridRow';

export function CardGrid({
  list,
  columns,
  sort,
  onSort,
  selected,
  current,
  onSelect,
  onSelectAll,
  timing,
  label,
}: {
  list: BrowseCard[];
  columns: ColumnKey[];
  sort: ViewPrefs['sort'];
  onSort: (c: ColumnKey) => void;
  selected: Set<string>;
  current: string | null;
  onSelect: (c: BrowseCard, e: SelectKeys) => void;
  onSelectAll: () => void;
  timing: SchedTiming;
  label: string;
}) {
  const currentIndex = list.findIndex((c) => c.key === current);
  const { scroller, top, setTop, height } = useGridScroll(currentIndex);
  const defs = columns.map((k) => COLUMNS.find((c) => c.key === k)!);
  const template = defs.map((d) => d.width).join(' ');
  const { first, last } = rowWindow(top, height, list.length);

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      onSelectAll();
      return;
    }
    const to = gridTarget(e.key, currentIndex, list.length);
    if (to === null || !list.length) return;
    e.preventDefault();
    const c = list[Math.max(0, Math.min(list.length - 1, to))]!;
    onSelect(c, { shiftKey: e.shiftKey, ctrlKey: false, metaKey: false });
  };

  return (
    <div
      ref={scroller}
      role="grid"
      aria-label={label}
      aria-multiselectable="true"
      aria-rowcount={list.length + 1}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onScroll={(e) => setTop(e.currentTarget.scrollTop)}
      className={`${cardStyle} mt-2 h-[calc(100dvh-20rem)] min-h-72 overflow-auto overscroll-contain text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand`}
    >
      <div style={{ minWidth: `${defs.length * 7}rem` }}>
        <GridHeader defs={defs} template={template} sort={sort} onSort={onSort} />
        {list.length === 0 ? (
          <p className="p-6 text-center text-muted">Ninguna tarjeta coincide con la búsqueda.</p>
        ) : (
          <div style={{ height: list.length * ROW, position: 'relative' }}>
            {list.slice(first, last).map((c, i) => (
              <GridRow
                key={c.key}
                card={c}
                index={first + i}
                defs={defs}
                template={template}
                selected={selected.has(c.key)}
                current={c.key === current}
                onSelect={onSelect}
                timing={timing}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
