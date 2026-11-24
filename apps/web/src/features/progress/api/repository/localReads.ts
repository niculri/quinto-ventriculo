// What the browser copy reads from its cards and its log: the cards, the answers and the counts of its screens.
import { settle } from '../../../../shared/lib/settle';
import { checkDecks, deckProgressOf, heatmapOf, homeCountsOf, medianOf } from './localCounts';
import { cardStatsOf } from './localStats';
import type { LocalStore } from './localStore';
import { same } from './localStore';
import type { StudyRepository } from './port';

type ReadMethods = Pick<
  StudyRepository,
  | 'cards'
  | 'allCards'
  | 'cardLog'
  | 'deckProgress'
  | 'answeredDecks'
  | 'medianAnswerMs'
  | 'heatmap'
  | 'homeCounts'
  | 'cardStats'
>;

export function localReads({ read, quizAnswers }: LocalStore): ReadMethods {
  return {
    cards: (deckIds) =>
      settle(() => {
        const ids = new Set(deckIds);
        return read().cards.filter((c) => ids.has(c.deckId));
      }),
    allCards: () => settle(() => read().cards),
    cardLog: (card) =>
      settle(() =>
        read()
          .log.filter((l) => same(l, card))
          .map((l) => ({
            action: l.action,
            reviewedAt: l.reviewedAt,
            rating: l.rating,
            queueBefore: l.queueBefore,
            phaseBefore: l.before?.phase ?? 'new',
            phaseAfter: l.after.phase,
            interval:
              l.interval !== undefined ? l.interval : l.rating === null ? null : l.after.interval,
            stability: l.after.stability,
            difficulty: l.after.difficulty,
            durationMs: l.durationMs ?? null,
          })),
      ),
    deckProgress: (dayStart) => settle(() => deckProgressOf(read(), dayStart)),
    answeredDecks: () =>
      settle(() => {
        const answered = read().cards.filter(
          (c) => (c.phase !== 'new' || c.reps > 0) && !c.retiredAt,
        );
        return [...new Set(answered.map((c) => c.deckId))];
      }),
    medianAnswerMs: () => settle(() => medianOf(read().log)),
    heatmap: (deckIds, quizIds = null) =>
      settle(() => {
        const refused = checkDecks(deckIds, {}, quizIds);
        if (refused) throw new Error(`No se pudo leer tus días de estudio: ${refused}`);
        return heatmapOf(read(), deckIds, quizIds, quizAnswers());
      }),
    cardStats: (deckIds) =>
      settle(() => {
        const refused = checkDecks(deckIds);
        if (refused) throw new Error(`No se pudo leer tus estadísticas: ${refused}`);
        return cardStatsOf(read(), deckIds);
      }),
    homeCounts: (deckIds, until, decay) =>
      settle(() => {
        const refused = deckIds.length ? checkDecks(deckIds, decay) : null;
        if (refused) throw new Error(`No se pudo leer tu avance: ${refused}`);
        return homeCountsOf(read().cards, deckIds, until, decay);
      }),
  };
}
