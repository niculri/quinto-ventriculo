// The seven rows of the heatmap grid, Monday to Sunday: the weekday's label and a cell for each week of the year, with
// its color, its name for a screen reader, today's mark and the roving tab stop.

import { cellLabel, dateText } from '@qv/study';
import { keyed } from '../../../shared/lib/keyed';
import type { CellValue, yearGrid } from '@qv/study';
import { CELL, GAP, LABELS } from '../model/layout';
import { weekRowsStrings as s } from './strings/WeekRows.strings';
import { shade } from '../model/shade';

export function WeekRows({
  grid,
  today,
  ready,
  current,
  valueOf,
  onClick,
  onHover,
  onFocus,
}: {
  grid: ReturnType<typeof yearGrid>;
  today: number | null;
  ready: boolean;
  current: number;
  valueOf: (day: number) => CellValue | null;
  onClick: (day: number) => void;
  onHover: (day: number) => void;
  onFocus: (day: number) => void;
}) {
  const columns = keyed(grid.columns, (week) => String(week.find((d) => d !== null)));
  return (
    <tbody>
      {keyed(s.weekdays, (label) => label).map(({ key: rowKey, item: label, index: row }) => (
        <tr key={rowKey}>
          <th
            scope="row"
            className="sticky left-0 z-10 bg-surface p-0 text-left text-[0.6875rem] leading-3 font-normal text-muted"
            // The shadows cover the gaps beside it, where the scrolled cells would show.
            style={{
              width: LABELS,
              height: CELL,
              boxShadow: `${GAP}px 0 0 var(--surface), -${GAP}px 0 0 var(--surface)`,
            }}
          >
            <span aria-hidden="true">{label}</span>
          </th>
          {columns.map(({ key: columnKey, item: week }) => {
            const day = week[row] ?? null;
            if (day === null) {
              return (
                <td
                  key={columnKey}
                  aria-hidden="true"
                  className="p-0"
                  style={{ width: CELL, height: CELL }}
                />
              );
            }
            const cell = valueOf(day);
            const isToday = day === today;
            return (
              <td
                key={columnKey}
                role="gridcell"
                data-day={day}
                tabIndex={day === current ? 0 : -1}
                aria-label={cell && today !== null ? cellLabel(day, cell, today) : dateText(day)}
                aria-current={isToday ? 'date' : undefined}
                onClick={() => onClick(day)}
                onMouseEnter={() => onHover(day)}
                onFocus={() => onFocus(day)}
                className={`p-0 ${ready ? '' : 'animate-pulse'} cursor-pointer rounded-[2px] focus-visible:outline-offset-1`}
                style={{
                  width: CELL,
                  height: CELL,
                  background: shade(cell),
                  boxShadow: isToday ? '0 0 0 1.5px var(--ink)' : undefined,
                }}
              />
            );
          })}
        </tr>
      ))}
    </tbody>
  );
}
