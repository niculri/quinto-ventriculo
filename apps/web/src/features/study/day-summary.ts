import { countsByDay, heatmapStats } from '../stats/heatmap';
import type { HeatmapData } from '../stats/heatmap';
import type { RatedAnswer } from './repository';

/**
 * The summary of «Listo por hoy» (step 3.4, ANK-15), without React: today's answers in what was being studied, how
 * many were not «Otra vez», the cards failed, and the streak of «Días de estudio».
 */
export interface DaySummary {
  /** Today's answers in the scope (review_log, the site's day). */
  answers: number;
  /** Those that were not «Otra vez» («Difícil», «Bien», «Fácil»). */
  correct: number;
  /** Cards of the scope with at least one «Otra vez» today. */
  failedCards: number;
  /** «Racha actual» of «Días de estudio»: the same figure as the home page's heatmap (every course). */
  streak: number;
  /** The same streak counting only the course being studied, as its page does (null without a course). */
  courseStreak: number | null;
}

/**
 * `answers`: the answers of the site's day (from its start to the next one), with their deck; `decks`: the decks of
 * what was studied; `heat`: the student's whole heatmap; `today`: the site's day number; `courseDecks`: every deck of
 * the course being studied (null: no course line).
 */
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

/**
 * «% bien»: the answers that were not «Otra vez», over all of them, rounded (null without answers). Never «100 %» with
 * one failed (next to «Ver las que fallaste») nor «0 %» with one right: 199 of 200 is 99 (Revisión de cero, 3.4).
 */
export function correctPercent(s: Pick<DaySummary, 'answers' | 'correct'>): number | null {
  if (!s.answers) return null;
  const p = Math.round((s.correct / s.answers) * 100);
  if (s.correct === s.answers) return 100;
  return Math.max(Math.min(p, 99), s.correct > 0 ? 1 : 0);
}
