// A row of the table's grid and its header: a card's cells, colored by its state or flag as in Anki, and the
// columns' names, each sorting by itself.

import type { MouseEvent } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { SchedTiming } from '@qv/srs';
import { FLAGS } from '@qv/study';
import { cellText } from '../model/columns';
import type { BrowseCard } from '../model/browseCards';
import type { COLUMNS, ColumnKey } from '../model/columns';
import { ROW } from '../model/grid';
import type { SelectKeys } from '../hooks/useSelection';
import type { ViewPrefs } from '../hooks/useViewPrefs';

type Column = (typeof COLUMNS)[number];

const rowClass = (c: BrowseCard, selected: boolean) => {
  if (selected) return 'bg-brand-soft text-ink';
  if (c.flag) return '';
  if (c.queue === 'suspended') return 'bg-[#fff8c5] dark:bg-[#3b3417]';
  if (c.queue === 'buried') return 'text-muted';
  return '';
};

export function GridRow({
  card: c,
  index,
  defs,
  template,
  selected,
  current,
  onSelect,
  timing,
}: {
  card: BrowseCard;
  index: number;
  defs: Column[];
  template: string;
  selected: boolean;
  current: boolean;
  onSelect: (c: BrowseCard, e: SelectKeys) => void;
  timing: SchedTiming;
}) {
  const color = FLAGS.find((f) => f.flag === c.flag)?.color;
  return (
    <div
      role="row"
      aria-rowindex={index + 2}
      aria-selected={selected}
      onClick={(e: MouseEvent) => onSelect(c, e)}
      className={`absolute inset-x-0 grid cursor-default items-center border-b border-border/60 select-none ${rowClass(c, selected)} ${current ? 'outline-2 -outline-offset-2 outline-brand' : ''}`}
      style={{
        top: index * ROW,
        height: ROW,
        gridTemplateColumns: template,
        ...(color && !selected
          ? { backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)` }
          : {}),
      }}
    >
      {defs.map((d) => (
        <div
          key={d.key}
          role="gridcell"
          className={`truncate px-2 ${d.numeric ? 'text-right tabular-nums' : ''} ${d.key === 'code' ? 'font-mono text-xs' : ''}`}
        >
          {cellText(c, d.key, timing)}
        </div>
      ))}
    </div>
  );
}

export function GridHeader({
  defs,
  template,
  sort,
  onSort,
}: {
  defs: Column[];
  template: string;
  sort: ViewPrefs['sort'];
  onSort: (c: ColumnKey) => void;
}) {
  return (
    <div
      role="row"
      aria-rowindex={1}
      className="sticky top-0 z-10 grid border-b border-border bg-surface"
      style={{ gridTemplateColumns: template }}
    >
      {defs.map((d) => (
        <div
          key={d.key}
          role="columnheader"
          aria-sort={
            sort.column === d.key ? (sort.descending ? 'descending' : 'ascending') : 'none'
          }
          className="min-w-0"
        >
          <button
            type="button"
            onClick={() => onSort(d.key)}
            className={`flex w-full items-center gap-1 px-2 py-2 text-xs font-semibold text-muted hover:text-ink ${d.numeric ? 'justify-end' : ''}`}
          >
            <span className="truncate">{d.label}</span>
            {sort.column === d.key ? (
              sort.descending ? (
                <ArrowDown className="size-3 flex-none" aria-hidden="true" />
              ) : (
                <ArrowUp className="size-3 flex-none" aria-hidden="true" />
              )
            ) : null}
          </button>
        </div>
      ))}
    </div>
  );
}
