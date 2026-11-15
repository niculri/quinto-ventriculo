// The heatmap's year as a grid of weeks: months on top, weekdays on the side, a day's box when one is open, and the
// error over it with «Reintentar».

import type { HeatmapData } from '@qv/study';
import { SHORT_MONTHS, cellValue } from '@qv/study';
import { sharedStrings } from '../../../shared/strings';
import { button } from '../../../shared/ui/styles';
import { useHeatmapGrid } from '../hooks/useHeatmapGrid';
import type { GridData } from '../hooks/useHeatmapGrid';
import type { HeatmapGroups } from '../model/groups';
import { GAP, GRID_WIDTH, columnLeft } from '../model/layout';
import { statsStrings as s } from '../strings';
import { DayBox } from './DayBox';
import { WeekRows } from './WeekRows';

export function HeatmapGrid({
  data,
  groups,
  error,
  onRetry,
  ...at
}: GridData & {
  data: HeatmapData | undefined;
  groups: HeatmapGroups;
  error: boolean;
  onRetry: () => void;
}) {
  const {
    grid,
    scroller,
    table,
    open,
    setOpen,
    valueOf,
    current,
    onKeyDown,
    onClick,
    onHover,
    onFocus,
    onClose,
  } = useHeatmapGrid(at);
  const { year, today, ready, studied, due, scale } = at;
  return (
    <div className="relative mt-3">
      <div
        ref={scroller}
        className="overflow-x-auto overscroll-x-contain pb-1"
        onScroll={() => open && setOpen(null)}
      >
        <div style={{ width: GRID_WIDTH }} className="relative">
          <div className="relative h-4 text-[0.6875rem] leading-4 text-muted" aria-hidden="true">
            {grid.months.map(({ month, column }) => (
              <span key={month} className="absolute top-0" style={{ left: columnLeft(column) }}>
                {SHORT_MONTHS[month]}
              </span>
            ))}
          </div>
          <table
            ref={table}
            role="grid"
            aria-label={s.grid(year)}
            aria-busy={!ready}
            onKeyDown={onKeyDown}
            onMouseLeave={() => setOpen((o) => (o?.pinned ? o : null))}
            className="table-fixed border-separate"
            style={{ borderSpacing: GAP, width: GRID_WIDTH }}
          >
            <WeekRows
              grid={grid}
              today={today}
              ready={ready}
              current={current}
              valueOf={valueOf}
              onClick={onClick}
              onHover={onHover}
              onFocus={onFocus}
            />
          </table>
        </div>
      </div>
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center gap-3 rounded-lg bg-surface/85 text-sm">
          <span className="text-muted">{s.loadFailed}</span>
          <button type="button" onClick={onRetry} className={`${button.base} ${button.secondary}`}>
            {sharedStrings.loadError.retry}
          </button>
        </div>
      ) : null}
      {open && data && today !== null ? (
        <DayBox
          open={open}
          today={today}
          cell={cellValue(open.day, today, studied, due, scale)}
          data={data}
          groups={groups}
          onClose={onClose}
          onOutside={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}
