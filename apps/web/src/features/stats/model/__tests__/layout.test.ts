// Tests where the heatmap's day box goes (above its day, else below, always on screen) and how far the grid scrolls.
import { yearGrid } from '@qv/study';
import { describe, expect, it } from 'vitest';
import { BOX_WIDTH, MARGIN, boxLeft, boxTop, columnLeft, gridScroll, monthShown } from '../layout';

const rect = (left: number, top: number, size = 12) =>
  ({ left, top, width: size, height: size, right: left + size, bottom: top + size }) as DOMRect;

describe('the box’s left edge', () => {
  it('is centred on the day when there is room', () => {
    expect(boxLeft(rect(500, 0, 12), 1200)).toBe(506 - BOX_WIDTH / 2);
  });

  it('never goes past the left margin, nor past the right one', () => {
    expect(boxLeft(rect(10, 0), 1200)).toBe(MARGIN);
    expect(boxLeft(rect(1180, 0), 1200)).toBe(1200 - BOX_WIDTH - MARGIN);
  });

  it('keeps the left margin on a screen narrower than the box', () => {
    expect(boxLeft(rect(100, 0), 200)).toBe(MARGIN);
  });
});

describe('the box’s top edge', () => {
  it('goes above the day when it fits there', () => {
    expect(boxTop(rect(0, 300), 100, 800)).toBe(300 - MARGIN - 100);
  });

  it('goes below the day when above it would leave the screen or its margin', () => {
    expect(boxTop(rect(0, 50), 100, 800)).toBe(62 + MARGIN);
    expect(boxTop(rect(0, 112), 100, 800)).toBe(124 + MARGIN);
    expect(boxTop(rect(0, 116), 100, 800)).toBe(MARGIN);
  });

  it('is pulled up to stay on the screen when below does not fit either', () => {
    expect(boxTop(rect(0, 50), 300, 340)).toBe(340 - 300 - MARGIN);
  });

  it('keeps the top margin on a screen shorter than the box', () => {
    expect(boxTop(rect(0, 50), 500, 300)).toBe(MARGIN);
  });
});

describe('how far the grid scrolls', () => {
  // 2024 starts on a Monday, so its first week has no empty cell.
  const grid = yearGrid(2024);
  const scroll = { max: 400, width: 300 };

  it('shows today with four weeks after it', () => {
    expect(gridScroll(scroll, grid.first + 210, grid)).toBe(columnLeft(30) - 300 + 4 * 14);
  });

  it('does not scroll at the start of the year, nor past the end at its end', () => {
    expect(gridScroll(scroll, grid.first, grid)).toBe(0);
    expect(gridScroll({ max: 10, width: 300 }, grid.last, grid)).toBe(10);
  });

  it('goes to the end of a past year and to the start of a future one', () => {
    expect(gridScroll(scroll, grid.last + 30, grid)).toBe(400);
    expect(gridScroll(scroll, grid.first - 30, grid)).toBe(0);
  });

  it('goes to the end when there is no today yet', () => {
    expect(gridScroll(scroll, null, grid)).toBe(400);
  });

  // Known error, not fixed yet: in a year that does not start on a Monday the first cell of the first
  // column is empty, so `grid.columns[0][0]` is null and today's column comes out in the thousands (the grid goes to
  // its end, December on a phone, whatever today is). Take the `.fails` off when it is fixed.
  it.fails('shows today with four weeks after it also in a year that starts on a Thursday', () => {
    const thursday = yearGrid(2026);
    expect(thursday.columns[0]![0]).toBeNull();
    expect(gridScroll(scroll, thursday.first + 210, thursday)).toBe(columnLeft(30) - 300 + 4 * 14);
  });
});

describe('a month’s name', () => {
  const view = { left: 100, width: 300 };
  it('shows when the part in view has it whole, never cut at an edge', () => {
    expect(monthShown(100, view)).toBe(true);
    expect(monthShown(376, view)).toBe(true);
    expect(monthShown(90, view)).toBe(false);
    expect(monthShown(380, view)).toBe(false);
  });
});
