// The groups of a studied day in the heatmap's box, from the most answers to the fewest.

import type { CellValue, HeatmapData } from '@qv/study';

export function dayParts(
  cell: CellValue,
  days: HeatmapData['days'],
  groupOf: (deckId: string) => string,
  day: number,
): [string, number][] {
  if (cell.kind !== 'past' || cell.value === 0) return [];
  const by = new Map<string, number>();
  for (const d of days) {
    if (d.day !== day) continue;
    const label = groupOf(d.deckId);
    by.set(label, (by.get(label) ?? 0) + d.answers + d.practice);
  }
  return [...by].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
