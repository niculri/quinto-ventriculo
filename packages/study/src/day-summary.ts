// The summary of «Listo por hoy»: today's answers in what was studied, how many were not «Otra vez», the cards
// failed, and the streak of «Días de estudio».

import { countsByDay, heatmapStats } from './heatmap';
import type { HeatmapData } from './heatmap';
import type { RatedAnswer } from '@qv/schema/user';

export interface DaySummary {
  answers: number;
  correct: number;
  failedCards: number;
  streak: number;
  courseStreak: number | null;
}

export function daySummary(
  answers: readonly (RatedAnswer & { deckId: string })[],
  decks: ReadonlySet<string>,
  heat: HeatmapData,
  today: number,
  courseDecks: ReadonlySet<string> | null = null,
): DaySummary {
  let total = 0;
  let correct = 0;
  const failed = new Set<string>();
  for (const a of answers) {
    if (!decks.has(a.deckId)) continue;
    total++;
    if (a.rating === 1) failed.add(`${a.noteGuid}\u001f${a.ord}`);
    else correct++;
  }
  return {
    answers: total,
    correct,
    failedCards: failed.size,
    streak: heatmapStats(countsByDay(heat.days, today), today).currentStreak,
    courseStreak: courseDecks
      ? heatmapStats(countsByDay(heat.days, today, courseDecks), today).currentStreak
      : null,
  };
}

// Never «100 %» with one failed (next to «Ver las que fallaste») nor «0 %» with one right: 199 of 200 is 99.
export function correctPercent(s: Pick<DaySummary, 'answers' | 'correct'>): number | null {
  if (!s.answers) return null;
  const p = Math.round((s.correct / s.answers) * 100);
  if (s.correct === s.answers) return 100;
  return Math.max(Math.min(p, 99), s.correct > 0 ? 1 : 0);
}
