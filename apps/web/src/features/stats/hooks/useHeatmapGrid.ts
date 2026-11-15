// The heatmap grid's state: the day that has the focus (one stop in the tab order), the day box that is open (on
// hover, or pinned by a click or the keyboard), the keys, and scrolling to today before it is painted.

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { cellValue, yearGrid } from '@qv/study';
import type { CellValue } from '@qv/study';
import { keyTarget } from '../model/keys';
import { gridScroll } from '../model/layout';

export interface OpenDay {
  day: number;
  rect: DOMRect;
  pinned: boolean;
  keyboard?: boolean;
}

export interface GridData {
  year: number;
  today: number | null;
  ready: boolean;
  studied: ReadonlyMap<number, number>;
  due: ReadonlyMap<number, number>;
  scale: number;
}

export function useHeatmapGrid({ year, today, ready, studied, due, scale }: GridData) {
  const grid = useMemo(() => yearGrid(year), [year]);
  const scroller = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLTableElement>(null);
  const [focusDay, setFocusDay] = useState<number | null>(null);
  const [open, setOpen] = useState<OpenDay | null>(null);
  const inYear = (d: number) => d >= grid.first && d <= grid.last;
  const current =
    focusDay !== null && inYear(focusDay)
      ? focusDay
      : today !== null && inYear(today)
        ? today
        : grid.first;

  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const max = box.scrollWidth - box.clientWidth;
    if (max <= 0) return;
    box.scrollLeft = gridScroll({ max, width: box.clientWidth }, today, grid);
    // Not while the student scrolls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, today, ready]);

  const valueOf = (day: number): CellValue | null =>
    ready && today !== null ? cellValue(day, today, studied, due, scale) : null;

  const cellOf = (day: number) =>
    table.current?.querySelector<HTMLElement>(`[data-day="${day}"]`) ?? null;

  const show = (day: number, pinned: boolean, keyboard = false) => {
    const el = cellOf(day);
    if (!el || !ready) return;
    setOpen({ day, rect: el.getBoundingClientRect(), pinned, keyboard });
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTableElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open?.pinned && open.day === current) setOpen(null);
      else show(current, true, true);
      return;
    }
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(null);
      return;
    }
    const next = keyTarget(e.key, current, grid);
    if (next === null) return;
    e.preventDefault();
    setFocusDay(next);
    if (open) setOpen(null);
    cellOf(next)?.focus();
  };

  const onClick = (day: number) => {
    setFocusDay(day);
    if (open?.pinned && open.day === day) setOpen(null);
    else show(day, true);
  };

  const onHover = (day: number) => {
    if (!open?.pinned) show(day, false);
  };

  const onClose = () => {
    const day = open!.day;
    setOpen(null);
    cellOf(day)?.focus();
  };

  return {
    grid,
    scroller,
    table,
    open,
    setOpen,
    current,
    valueOf,
    onKeyDown,
    onClick,
    onHover,
    onFocus: setFocusDay,
    onClose,
  };
}
