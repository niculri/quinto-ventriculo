// The heatmap grid's state: the day that has the focus (one stop in the tab order), the day box that is open (on
// hover, or pinned by a click or the keyboard), the keys, and scrolling to today before it is painted.

import { useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
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
  const grid = yearGrid(year);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [focusDay, setFocusDay] = useState<number | null>(null);
  const [open, setOpen] = useState<OpenDay | null>(null);
  const inYear = (d: number) => d >= grid.first && d <= grid.last;
  const current =
    focusDay !== null && inYear(focusDay)
      ? focusDay
      : today !== null && inYear(today)
        ? today
        : grid.first;

  // The grid follows the year: only a new year, today or the data arriving scroll to today again.
  const scrollToToday = useEffectEvent(() => {
    const box = scrollerRef.current;
    if (!box) return;
    const max = box.scrollWidth - box.clientWidth;
    if (max <= 0) return;
    box.scrollLeft = gridScroll({ max, width: box.clientWidth }, today, grid);
  });
  useLayoutEffect(() => {
    scrollToToday();
  }, [year, today, ready]);

  const valueOf = (day: number): CellValue | null =>
    ready && today !== null ? cellValue(day, today, studied, due, scale) : null;

  const cellOf = (day: number) =>
    tableRef.current?.querySelector<HTMLElement>(`[data-day="${day}"]`);

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
    scrollerRef,
    tableRef,
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
