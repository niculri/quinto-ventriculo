// The groups of a studied day in the heatmap's box, from the most answers to the fewest, each with how many were of
// Anki and how many questions of tests.

import type { CellValue, HeatmapData } from '@qv/study';
import type { HeatmapGroups } from './groups';

export interface DayPart {
  label: string;
  anki: number;
  tests: number;
}

export function dayParts(
  cell: CellValue,
  data: Pick<HeatmapData, 'days' | 'tests'>,
  groups: Pick<HeatmapGroups, 'groupOf' | 'groupOfQuiz'>,
  day: number,
): DayPart[] {
  if (cell.kind !== 'past' || cell.value === 0) return [];
  const by = new Map<string, DayPart>();
  const part = (label: string) => {
    const p = by.get(label) ?? { label, anki: 0, tests: 0 };
    by.set(label, p);
    return p;
  };
  for (const d of data.days) {
    if (d.day === day && d.answers + d.practice > 0) {
      part(groups.groupOf(d.deckId)).anki += d.answers + d.practice;
    }
  }
  for (const t of data.tests ?? []) {
    if (t.day === day && t.answers > 0) part(groups.groupOfQuiz(t.quizId)).tests += t.answers;
  }
  return [...by.values()].sort(
    (a, b) => b.anki + b.tests - (a.anki + a.tests) || a.label.localeCompare(b.label),
  );
}

/** How much of the day was Anki and how much tests. */
export const dayTotals = (parts: readonly DayPart[]) => ({
  anki: parts.reduce((t, p) => t + p.anki, 0),
  tests: parts.reduce((t, p) => t + p.tests, 0),
});
