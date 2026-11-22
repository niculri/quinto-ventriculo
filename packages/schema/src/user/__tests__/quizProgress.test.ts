// The practice test progress as it is saved: which origins a round has and what a step may carry.
import { describe, expect, it } from 'vitest';
import { QUIZ_RPC, QuizStep, RoundInfo, RoundOrigin, SavedQuiz } from '../quizProgress';

const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
  s.safeParse(v).success;

describe('quiz progress', () => {
  it('a round starts from the cover, a restart, or repeating all or the wrong ones, and nothing else', () => {
    expect(RoundOrigin.options).toEqual(['cover', 'restart', 'repeat_all', 'repeat_wrong']);
    expect(ok(RoundOrigin, 'resume')).toBe(false);
  });

  it('a saved quiz is a record of sections, each with its preferences and round (which may be null, but not missing) and time', () => {
    expect(ok(SavedQuiz, { s1: { preferences: null, round: { a: 1 }, updatedAt: 't' } })).toBe(
      true,
    );
    expect(ok(SavedQuiz, { s1: { round: null, updatedAt: 't' } })).toBe(false);
    expect(ok(SavedQuiz, { s1: { preferences: null, round: null } })).toBe(false);
  });

  it('a step may carry the round’s summary and an answer, each optional', () => {
    const step = { quizId: 'q', sectionId: 's', round: {} };
    expect(ok(QuizStep, step)).toBe(true);
    const info = {
      id: 'r',
      origin: 'cover',
      questionCount: 3,
      shuffled: false,
      shuffleOptions: false,
      startedAt: 't',
      finished: false,
    };
    expect(ok(QuizStep, { ...step, roundInfo: info })).toBe(true);
    expect(ok(RoundInfo, { ...info, origin: 'other' })).toBe(false);
    expect(
      ok(QuizStep, {
        ...step,
        answer: {
          roundId: 'r',
          questionId: 'q1',
          position: 0,
          chosen: null,
          correct: true,
          answeredAt: 't',
        },
      }),
    ).toBe(true);
    expect(
      ok(QuizStep, {
        ...step,
        answer: {
          roundId: 'r',
          questionId: 'q1',
          position: 0,
          chosen: 'a',
          correct: true,
          answeredAt: 't',
        },
      }),
    ).toBe(false);
  });

  it('what the database stores has to be JSON: a step with a value that is not is refused', () => {
    const args = QUIZ_RPC.save_quiz_progress.args;
    const step = { quizId: 'q', sectionId: 's', round: { screen: 'question', n: [1, null, 'x'] } };
    expect(ok(args, { p: step })).toBe(true);
    expect(ok(args, { p: { ...step, preferences: { shuffle: true } } })).toBe(true);
    expect(ok(args, { p: { ...step, round: { when: new Date() } } })).toBe(false);
    expect(ok(args, { p: { ...step, round: { n: Number.NaN } } })).toBe(false);
    expect(ok(args, { p: { ...step, round: undefined } })).toBe(false);
    expect(ok(QUIZ_RPC.save_quiz_progress.returns, null)).toBe(true);
  });
});
