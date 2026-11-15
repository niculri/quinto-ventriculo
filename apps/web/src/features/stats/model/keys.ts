// The day the heatmap's arrows, Home and End go to from the current one, kept inside the year.

import type { yearGrid } from '@qv/study';

type YearGrid = ReturnType<typeof yearGrid>;

const MOVES: Record<string, number> = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 };

export function keyTarget(key: string, current: number, grid: YearGrid): number | null {
  let next: number | null = null;
  if (key in MOVES) next = current + MOVES[key]!;
  else if (key === 'Home') next = grid.first;
  else if (key === 'End') next = grid.last;
  return next === null ? null : Math.min(grid.last, Math.max(grid.first, next));
}
