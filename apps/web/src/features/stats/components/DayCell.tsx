// A day of the heatmap grid: its color, its name for a screen reader, today's mark and the roving tab stop.

import { cellLabel, dateText } from '@qv/study';
import type { CellValue } from '@qv/study';
import { shade } from '../model/shade';
import { CELL } from '../model/layout';

export function DayCell({
  day,
  cell,
  today,
  ready,
  current,
  onClick,
  onHover,
  onFocus,
}: {
  day: number;
  cell: CellValue | null;
  today: number | null;
  ready: boolean;
  current: boolean;
  onClick: () => void;
  onHover: () => void;
  onFocus: () => void;
}) {
  const isToday = day === today;
  return (
    <td
      role="gridcell"
      data-day={day}
      tabIndex={current ? 0 : -1}
      aria-label={cell && today !== null ? cellLabel(day, cell, today) : dateText(day)}
      aria-current={isToday ? 'date' : undefined}
      onClick={onClick}
      onMouseEnter={onHover}
      onFocus={onFocus}
      className={`p-0 ${ready ? '' : 'animate-pulse'} cursor-pointer rounded-[2px] focus-visible:outline-offset-1`}
      style={{
        width: CELL,
        height: CELL,
        background: shade(cell),
        boxShadow: isToday ? '0 0 0 1.5px var(--ink)' : undefined,
      }}
    />
  );
}
