// The seven rows of the heatmap grid, Monday to Sunday: the weekday's label and a cell for each week of the year, with
// its color, its name for a screen reader, today's mark and the roving tab stop.

import { cellLabel, dateText } from '@qv/study';
import type { CellValue, yearGrid } from '@qv/study';
import { CELL, GAP, LABELS } from '../model/layout';
import { statsStrings as s } from '../strings';
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
  return (
    <tbody>
      {s.weekdays.map((label, row) => (
        <tr key={row}>
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
          {grid.columns.map((week, c) => {
            const day = week[row]!;
            if (day === null) {
              return (
                <td
                  key={c}
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
                key={c}
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
