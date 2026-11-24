// What «Días de estudio» counts each day: the answers and practice of Anki plus the questions answered in tests, and
// how much of a stretch of days was of each.

import { countsByDay } from './heatmap';
import type { HeatmapData, HeatmapTest } from './heatmap';

/** The decks and tests a page counts; a list left out counts all of its kind. */
export interface StudyScope {
  decks?: ReadonlySet<string> | null;
  quizzes?: ReadonlySet<string> | null;
}

export interface StudySplit {
  anki: number;
  tests: number;
}

type Heat = Pick<HeatmapData, 'days' | 'tests'>;

export function testsByDay(
  tests: readonly HeatmapTest[],
  today: number,
  only?: ReadonlySet<string> | null,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const t of tests) {
    if (t.day > today || t.answers <= 0 || (only && !only.has(t.quizId))) continue;
    out.set(t.day, (out.get(t.day) ?? 0) + t.answers);
  }
  return out;
}

export function studiedByDay(
  heat: Heat,
  today: number,
  only: StudyScope = {},
): Map<number, number> {
  const out = countsByDay(heat.days, today, only.decks ?? undefined);
  for (const [day, n] of testsByDay(heat.tests ?? [], today, only.quizzes)) {
    out.set(day, (out.get(day) ?? 0) + n);
  }
  return out;
}

/** The days of the current streak (from today, or from yesterday while today has nothing yet), oldest first. */
export function streakDays(byDay: ReadonlyMap<number, number>, today: number): number[] {
  let day = byDay.has(today) ? today : today - 1;
  const out: number[] = [];
  while (byDay.has(day)) out.unshift(day--);
  return out;
}

/** How much of the given days was Anki and how much tests; with no days, every day up to today. */
export function studySplit(
  heat: Heat,
  today: number,
  only: StudyScope = {},
  days: readonly number[] | null = null,
): StudySplit {
  const inside = days ? new Set(days) : null;
  const sum = (byDay: Map<number, number>) => {
    let total = 0;
    for (const [day, n] of byDay) if (!inside || inside.has(day)) total += n;
    return total;
  };
  return {
    anki: sum(countsByDay(heat.days, today, only.decks ?? undefined)),
    tests: sum(testsByDay(heat.tests ?? [], today, only.quizzes)),
  };
}
