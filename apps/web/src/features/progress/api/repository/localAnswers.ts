// What the browser copy reads from its log: the answers given since a moment or between two.
import { settle } from '../../../../shared/lib/settle';
import type { LocalStore, LogRow } from './localStore';
import type { StudyRepository } from './port';

type AnswerMethods = Pick<
  StudyRepository,
  'ratedSince' | 'ratedBetween' | 'firstAnswersSince' | 'answersSince'
>;

export function localAnswers({ read }: LocalStore): AnswerMethods {
  return {
    ratedSince: (since) =>
      settle(() =>
        read()
          .log.filter((l) => l.rating !== null && Date.parse(l.reviewedAt) >= since.getTime())
          .map((l) => ({
            noteGuid: l.noteGuid,
            ord: l.ord,
            rating: l.rating as 1 | 2 | 3 | 4,
            reviewedAt: l.reviewedAt,
          })),
      ),
    ratedBetween: (from, to) =>
      settle(() =>
        read()
          .log.filter((l) => {
            const at = Date.parse(l.reviewedAt);
            return l.rating !== null && at >= from.getTime() && at < to.getTime();
          })
          .map((l) => ({
            noteGuid: l.noteGuid,
            ord: l.ord,
            deckId: l.deckId,
            rating: l.rating as 1 | 2 | 3 | 4,
            reviewedAt: l.reviewedAt,
          })),
      ),
    firstAnswersSince: (since) =>
      settle(() => {
        const first = new Map<string, LogRow>();
        for (const l of read().log) {
          if (l.rating === null) continue;
          const k = `${l.noteGuid}\u001f${l.ord}`;
          if (!first.has(k)) first.set(k, l);
        }
        return [...first.values()]
          .filter((l) => Date.parse(l.reviewedAt) >= since.getTime())
          .map((l) => ({ noteGuid: l.noteGuid, ord: l.ord, at: l.reviewedAt }));
      }),
    answersSince: (since) =>
      settle(() =>
        read()
          .log.filter((l) => l.rating !== null && Date.parse(l.reviewedAt) >= since.getTime())
          .map((l) => ({ deckId: l.deckId, queueBefore: l.queueBefore! })),
      ),
  };
}
