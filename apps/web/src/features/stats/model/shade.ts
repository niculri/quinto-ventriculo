// The color of a day in the heatmap: turquoise steps for what was studied; what is to come is only an outline, grey
// steps for what is due, so that it never weighs more than an empty day that passed.

import type { CellValue } from '@qv/study';

const STUDIED = [12, 22, 32, 42, 52, 62, 72, 82, 91, 100];
const DUE = [16, 24, 32, 40, 48, 56, 64, 72, 80, 88];

/** The levels the legend shows, from «Menos» to «Más». */
export const LEGEND_LEVELS = [0, 2, 4, 7, 10] as const;

const studied = (level: number) =>
  level === 0
    ? 'var(--surface-2)'
    : `color-mix(in oklab, var(--heat) ${String(STUDIED[level - 1])}%, var(--brand-soft))`;

export function shade(cell: CellValue | null): string {
  if (!cell) return 'var(--surface-2)';
  return cell.kind === 'due' ? 'var(--surface)' : studied(cell.level);
}

/** A day still to come: its outline, darker the more cards are due on it. */
export function outline(cell: CellValue | null): string | null {
  if (cell?.kind !== 'due') return null;
  const color =
    cell.level === 0
      ? 'var(--border)'
      : `color-mix(in oklab, var(--muted) ${String(DUE[cell.level - 1])}%, var(--border))`;
  return `inset 0 0 0 1px ${color}`;
}

/** The legend's swatch of a level of what was studied. */
export const legendShade = (level: number) => studied(level);
