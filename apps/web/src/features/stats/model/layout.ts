// Sizes of the heatmap's grid and where its day box goes: above the day if it fits, else below, always on screen.

import { COLUMNS } from '@qv/study';
import type { yearGrid } from '@qv/study';

type YearGrid = ReturnType<typeof yearGrid>;

export const CELL = 12;
export const GAP = 2;
const PITCH = CELL + GAP;
export const LABELS = 26;
export const GRID_WIDTH = GAP + LABELS + GAP + COLUMNS * PITCH;
export const BOX_WIDTH = 288;
export const MARGIN = 8;

export const columnLeft = (column: number) => GAP + LABELS + GAP + column * PITCH;

export function boxLeft(rect: DOMRect, viewportWidth: number) {
  return Math.min(
    Math.max(MARGIN, rect.left + rect.width / 2 - BOX_WIDTH / 2),
    Math.max(MARGIN, viewportWidth - BOX_WIDTH - MARGIN),
  );
}

export function boxTop(rect: DOMRect, height: number, viewportHeight: number) {
  let top = rect.top - MARGIN - height;
  if (top < MARGIN) top = rect.bottom + MARGIN;
  return Math.max(MARGIN, Math.min(top, viewportHeight - height - MARGIN));
}

/** How far to scroll the grid so that today shows (with four weeks after it), or a past year's end, a future one's start. */
export function gridScroll(
  scroll: { max: number; width: number },
  today: number | null,
  grid: YearGrid,
) {
  if (today !== null && today >= grid.first && today <= grid.last) {
    const column = Math.floor((today - grid.columns[0]![0]!) / 7);
    const x = columnLeft(column);
    return Math.min(scroll.max, Math.max(0, x - scroll.width + 4 * PITCH));
  }
  return today !== null && grid.first > today ? 0 : scroll.max;
}
