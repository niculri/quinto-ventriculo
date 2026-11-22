// The color of a day in the heatmap: green steps for what was studied, grey ones for what is due.

import type { CellValue } from '@qv/study';

const STUDIED = [12, 22, 32, 42, 52, 62, 72, 82, 91, 100];
const DUE = [16, 24, 32, 40, 48, 56, 64, 72, 80, 88];

export function shade(cell: CellValue | null): string {
  if (!cell || cell.level === 0) return 'var(--surface-2)';
  const [color, base, steps] =
    cell.kind === 'past'
      ? ['var(--heat)', 'var(--brand-soft)', STUDIED]
      : ['var(--muted)', 'var(--surface-2)', DUE];
  return `color-mix(in oklab, ${color} ${String(steps[cell.level - 1])}%, ${base})`;
}
