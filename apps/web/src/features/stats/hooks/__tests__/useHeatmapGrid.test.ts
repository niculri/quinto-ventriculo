// Tests the heatmap grid's scroll: to today when the year, today or the data change, and never while the student scrolls.
import { act, renderHook } from '@testing-library/react';
import { yearGrid } from '@qv/study';
import { describe, expect, it } from 'vitest';
import { gridScroll } from '../../model/layout';
import { useHeatmapGrid } from '../useHeatmapGrid';
import type { GridData } from '../useHeatmapGrid';

const YEAR = 2026;
const grid = yearGrid(YEAR);
const TODAY = grid.first + 200;
/** Two months' names: one at the grid's start and one at 1.000 px. */
const MONTHS = [0, 1000].map((left) => {
  const label = document.createElement('span');
  label.dataset.monthLeft = String(left);
  return label;
});
const BOX = {
  scrollWidth: 2000,
  clientWidth: 500,
  scrollLeft: 0,
  querySelectorAll: () => MONTHS,
};

const data = (over: Partial<GridData> = {}): GridData => ({
  year: YEAR,
  today: TODAY,
  ready: true,
  studied: new Map(),
  due: new Map(),
  scale: 4,
  ...over,
});

// The effect runs after the mount, when the box is already in its ref, as in the page.
function heatmap(initial: GridData) {
  const hook = renderHook((props: GridData) => useHeatmapGrid(props), { initialProps: initial });
  hook.result.current.scrollerRef.current = BOX as unknown as HTMLDivElement;
  BOX.scrollLeft = 0;
  return hook;
}

const todayScroll = (today: number | null = TODAY, year = YEAR) =>
  gridScroll({ max: 1500, width: 500 }, today, yearGrid(year));

describe('scrolling the grid', () => {
  it('goes to today when the data is ready, and is not repeated by renders that change nothing', () => {
    const { rerender } = heatmap(data({ ready: false }));
    rerender(data({ ready: true }));
    expect(BOX.scrollLeft).toBe(todayScroll());
    BOX.scrollLeft = 123;
    rerender(data({ ready: true }));
    rerender(data({ ready: true, studied: new Map([[TODAY, 3]]), scale: 8 }));
    expect(BOX.scrollLeft).toBe(123);
  });

  it('goes again when today changes', () => {
    const { rerender } = heatmap(data());
    BOX.scrollLeft = 5;
    rerender(data({ today: TODAY + 30 }));
    expect(BOX.scrollLeft).toBe(todayScroll(TODAY + 30));
  });

  it('goes again when the year changes, to the end of a past year', () => {
    const { rerender } = heatmap(data());
    BOX.scrollLeft = 5;
    rerender(data({ year: YEAR - 1 }));
    expect(BOX.scrollLeft).toBe(todayScroll(TODAY, YEAR - 1));
    expect(BOX.scrollLeft).toBe(1500);
  });

  it('does nothing when there is nothing to scroll', () => {
    const { rerender } = heatmap(data({ ready: false }));
    Object.assign(BOX, { scrollWidth: 500 });
    rerender(data({ ready: true }));
    expect(BOX.scrollLeft).toBe(0);
    Object.assign(BOX, { scrollWidth: 2000 });
  });
});

describe('the months’ names', () => {
  const shown = () => MONTHS.map((m) => m.style.visibility !== 'hidden');

  it('show only those the part in view has whole, and follow the scroll', () => {
    const { result, rerender } = heatmap(data({ ready: false }));
    rerender(data({ ready: true }));
    expect(BOX.scrollLeft).toBeGreaterThan(0);
    expect(shown()).toEqual([false, BOX.scrollLeft <= 1000 && BOX.scrollLeft + 500 >= 1024]);
    BOX.scrollLeft = 0;
    act(() => result.current.onScroll());
    expect(shown()).toEqual([true, false]);
  });

  it('all show when the grid fits without scrolling', () => {
    const { rerender } = heatmap(data({ ready: false }));
    Object.assign(BOX, { scrollWidth: 500 });
    rerender(data({ ready: true }));
    expect(shown()).toEqual([true, true]);
    Object.assign(BOX, { scrollWidth: 2000 });
  });
});

describe('the grid', () => {
  it('is the year’s, and follows it', () => {
    const { result, rerender } = heatmap(data());
    expect(result.current.grid).toEqual(yearGrid(YEAR));
    rerender(data({ scale: 9 }));
    expect(result.current.grid).toEqual(yearGrid(YEAR));
    rerender(data({ year: YEAR - 1 }));
    expect(result.current.grid).toEqual(yearGrid(YEAR - 1));
  });
});
