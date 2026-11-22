// Tests the guards of the admin mode: what only the draft has reaches no repository; what the students have, always does.
import { describe, expect, it } from 'vitest';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import { localQuizRepository } from '../../quiz/api/repository';
import { localReportsRepository, REPORT_MESSAGES } from '../../reports/api/repository';
import type { NewReport } from '../../reports/api/repository';
import type { DraftOnly } from '../draftOnly';
import { guardQuiz, guardReports, guardStudy } from '../draftGuard';

const DRAFT = { deck: '30', quiz: 'qd', note: 'nd', cardGuid: 'draft-guid' };

const lookup: DraftOnly = {
  is: async (kind, id) =>
    (kind === 'deck' && id === DRAFT.deck) ||
    (kind === 'quiz' && id === DRAFT.quiz) ||
    (kind === 'note' && id === DRAFT.note),
  card: async (ref) => ref.noteGuid === DRAFT.cardGuid,
};

/** Every call that reaches the repository, by name. */
function spied<T extends object>(real: T) {
  const calls: string[] = [];
  const proxy = new Proxy(real, {
    get(target, key, receiver) {
      const v: unknown = Reflect.get(target, key, receiver);
      if (typeof v !== 'function') return v;
      return (...args: unknown[]) => {
        calls.push(String(key));
        return (v as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { proxy, calls };
}

const real = { noteGuid: 'real-guid', ord: 0, deckId: '20' };
const draft = { noteGuid: DRAFT.cardGuid, ord: 0, deckId: DRAFT.deck };
const review = (card: typeof real) =>
  ({ card, expectedUpdatedAt: null, rating: 3 }) as unknown as Parameters<
    ReturnType<typeof fullAnkiStudy>['recordReview']
  >[0];

describe('the guard of the study repository', () => {
  it('lets through what the students have', async () => {
    const { proxy, calls } = spied(fullAnkiStudy());
    const study = guardStudy(proxy, lookup);
    await study.recordReview(review(real)).catch(() => undefined);
    await study.setDeckActivation('20', true);
    await study.bury([real], new Date(), false);
    await study.suspend([real], false);
    await study.setFlag(real, 1);
    await study.setFlags([real], 1);
    await study.forget([real], false);
    await study.recordPractice([{ deckId: '20', n: 3 }]);
    expect(calls).toEqual([
      'recordReview',
      'setDeckActivation',
      'bury',
      'suspend',
      'setFlag',
      'setFlags',
      'forget',
      'recordPractice',
    ]);
  });

  it('answers as done, and writes nothing, what only the draft has', async () => {
    const { proxy, calls } = spied(fullAnkiStudy());
    const study = guardStudy(proxy, lookup);
    expect(await study.recordReview(review(draft))).toHaveProperty('updatedAt');
    await study.setDeckActivation(DRAFT.deck, true);
    await study.setDeckPreset(DRAFT.deck, null);
    await study.saveAssessmentSetting({ deckId: DRAFT.deck, includeExtras: false, newPerDay: 5 });
    await study.bury([draft], new Date(), false);
    await study.suspend([draft], true);
    await study.unsuspend([draft]);
    await study.unbury([draft]);
    await study.setFlag(draft, 2);
    await study.setFlags([draft], 2);
    await study.forget([draft], true);
    await study.recordPractice([{ deckId: DRAFT.deck, n: 4 }]);
    expect(calls).toEqual([]);
  });

  it('in a mix, writes only what the students have', async () => {
    const suspended: unknown[] = [];
    const practiced: unknown[] = [];
    const study = guardStudy(
      {
        ...fullAnkiStudy(),
        suspend: async (cards) => void suspended.push(cards),
        recordPractice: async (counts) => void practiced.push(counts),
      },
      lookup,
    );
    await study.suspend([draft, real], false);
    await study.recordPractice([
      { deckId: DRAFT.deck, n: 1 },
      { deckId: '20', n: 2 },
    ]);
    expect(suspended).toEqual([[real]]);
    expect(practiced).toEqual([[{ deckId: '20', n: 2 }]]);
  });

  it('does not touch what is only read or the user’s own', async () => {
    const { proxy, calls } = spied(fullAnkiStudy());
    const study = guardStudy(proxy, lookup);
    await study.preferences();
    await study.deckActivations();
    await study.savePreferences({ fullAnki: false } as never);
    expect(calls).toEqual(['preferences', 'deckActivations', 'savePreferences']);
  });
});

describe('the guard of the test repository', () => {
  it('saves a test of the students and not one of the draft', async () => {
    const { proxy, calls } = spied(localQuizRepository(null));
    const quiz = guardQuiz(proxy, lookup);
    await quiz.save({ quizId: DRAFT.quiz, sectionId: 's', round: {} });
    expect(calls).toEqual([]);
    await quiz.save({ quizId: 'q1', sectionId: 's', round: {} }).catch(() => undefined);
    expect(calls).toEqual(['save']);
    await quiz.load(DRAFT.quiz);
    expect(calls).toEqual(['save', 'load']);
  });
});

describe('the guard of the reports', () => {
  const base = { code: null, version: null, location: {}, category: 'wrong', comment: 'x' };
  const report = (kind: NewReport['kind'], id: string) => ({ ...base, kind, id }) as NewReport;

  it('refuses, saying why, a report of what only the draft has', async () => {
    const { proxy, calls } = spied(localReportsRepository({ admin: true }));
    const reports = guardReports(proxy, lookup);
    for (const r of [
      report('note', DRAFT.note),
      report('quiz_question', `${DRAFT.quiz}/q-3`),
      report('card', `${DRAFT.cardGuid}:1`),
    ]) {
      await expect(reports.send(r)).rejects.toThrow(REPORT_MESSAGES.draftOnly);
    }
    expect(calls).toEqual([]);
  });

  it('sends the one of what the students have', async () => {
    const { proxy, calls } = spied(localReportsRepository({ admin: true }));
    const reports = guardReports(proxy, lookup);
    await reports.send(report('note', 'AP-1')).catch(() => undefined);
    await reports.send(report('card', 'a:b:2')).catch(() => undefined);
    expect(calls).toEqual(['send', 'send']);
  });
});
