// A day's box over the heatmap: its date, its total and its groups; pinned, it links each group (and the whole) to
// the cards of that day and can be closed.

import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { Layers, X } from 'lucide-react';
import { answersText, dateText, dueText, isoOfDay } from '@qv/study';
import type { CellValue, HeatmapData } from '@qv/study';
import { paths } from '../../../shared/lib/paths';
import { sharedStrings } from '../../../shared/strings';
import { useDayBox } from '../hooks/useDayBox';
import type { OpenDay } from '../hooks/useHeatmapGrid';
import type { HeatmapGroups } from '../model/groups';
import { BOX_WIDTH, MARGIN, boxLeft } from '../model/layout';
import { statsStrings as s } from '../strings';

function total(cell: CellValue) {
  if (cell.kind === 'past') return cell.value > 0 ? answersText(cell.value) : s.noStudy;
  return cell.value > 0 ? dueText(cell.value) : s.nothingDue;
}

function DayParts({
  parts,
  day,
  pinned,
  placeOf,
}: {
  parts: [string, number][];
  day: number;
  pinned: boolean;
  placeOf: HeatmapGroups['placeOf'];
}) {
  return (
    <ul className="mt-2 space-y-1 border-t border-border pt-2">
      {parts.map(([label, n]) => {
        const place = pinned ? placeOf(label) : null;
        const inner = (
          <>
            <span className="min-w-0 truncate">{label}</span>
            <span className="flex-none text-muted tabular-nums">{s.count(n)}</span>
          </>
        );
        return (
          <li key={label}>
            {place ? (
              <Link
                to={paths.cards(place.ref, { day: isoOfDay(day) })}
                className="-mx-1 flex items-baseline justify-between gap-3 rounded px-1 hover:bg-surface-2"
              >
                {inner}
              </Link>
            ) : (
              <span className="flex items-baseline justify-between gap-3">{inner}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function DayBox({
  open,
  today,
  cell,
  data,
  groups: { groupOf, placeOf, whole },
  onClose,
  onOutside,
}: {
  open: OpenDay;
  today: number;
  cell: CellValue;
  data: HeatmapData;
  groups: HeatmapGroups;
  onClose: () => void;
  onOutside: () => void;
}) {
  const { box, titleId, bodyId, parts } = useDayBox({
    open,
    cell,
    data,
    groupOf,
    onClose,
    onOutside,
  });
  const { rect } = open;
  const all =
    open.pinned && cell.value > 0
      ? (whole ?? (parts.length === 1 ? placeOf(parts[0]![0]) : null))
      : null;
  return createPortal(
    <div
      ref={box}
      role={open.pinned ? 'dialog' : 'tooltip'}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      tabIndex={-1}
      className={`fixed z-50 rounded-xl border border-border bg-surface p-3 text-sm shadow-soft focus:outline-none ${
        open.pinned ? '' : 'pointer-events-none'
      }`}
      style={{
        width: BOX_WIDTH,
        left: boxLeft(rect, window.innerWidth),
        top: rect.bottom + MARGIN,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p id={titleId} className="font-medium first-letter:uppercase">
          {dateText(open.day, true)}
          {open.day === today ? s.today : ''}
        </p>
        {open.pinned ? (
          <button
            type="button"
            aria-label={sharedStrings.close}
            onClick={onClose}
            className="-mt-1 -mr-1 rounded p-1 text-muted hover:bg-surface-2 hover:text-ink"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div id={bodyId}>
        <p className="mt-0.5 text-muted tabular-nums" aria-live="polite">
          {total(cell)}
        </p>
        {parts.length ? (
          <DayParts parts={parts} day={open.day} pinned={open.pinned} placeOf={placeOf} />
        ) : null}
        {all ? (
          <Link
            to={paths.cards(all.ref, { day: isoOfDay(open.day) })}
            className="mt-2 flex items-center gap-1.5 border-t border-border pt-2 font-medium text-brand hover:underline"
          >
            <Layers className="size-3.5" aria-hidden="true" /> {s.seeCards}
          </Link>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
