// Tests of saving a test's steps in order and in the background, with its retries.
import { describe, expect, it } from 'vitest';
import type { QuizStep } from '../repository';
import { StepSaver } from '../StepSaver';

describe('saving the steps', () => {
  it('in order; a move joins the step waiting, an answer is never dropped', async () => {
    const saved: QuizStep[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const saver = new StepSaver({
      load: async () => ({}),
      openRounds: async () => [],
      save: async (s) => {
        if (!saved.length) await gate;
        saved.push(s);
      },
    });
    const info = {
      id: 'r1',
      origin: 'cover' as const,
      questionCount: 2,
      shuffled: false,
      shuffleOptions: false,
      startedAt: '',
      finished: false,
    };
    const step = (round: unknown, extra: Partial<QuizStep> = {}): QuizStep => ({
      quizId: 'q',
      sectionId: 's',
      round,
      roundInfo: info,
      ...extra,
    });
    const answer = {
      roundId: 'r1',
      questionId: 'a',
      position: 0,
      chosen: 0,
      correct: true,
      answeredAt: '',
    };
    saver.push(step(1));
    saver.push(step(2, { answer }));
    saver.push(step(3));
    saver.push(step(4, { answer: { ...answer, position: 1 } }));
    expect(saver.pending).toBe(3);
    release();
    await saver.flush();
    expect(saved.map((s) => [s.round, s.answer?.position ?? null])).toEqual([
      [1, null],
      [3, 0],
      [4, 1],
    ]);
  });

  it('retries, then stops and keeps the step for «Reintentar»', async () => {
    let fail = 3;
    const saved: unknown[] = [];
    const saver = new StepSaver(
      {
        load: async () => ({}),
        openRounds: async () => [],
        save: async (s) => {
          if (fail-- > 0) throw new Error('sin conexión');
          saved.push(s.round);
        },
      },
      [1, 1],
    );
    saver.push({ quizId: 'q', sectionId: 's', round: 'x' });
    await saver.flush();
    expect(saver.failed?.message).toBe('sin conexión');
    expect(saver.pending).toBe(1);
    saver.retry();
    await saver.flush();
    expect(saver.failed).toBeNull();
    expect(saved).toEqual(['x']);
  });

  it('a step joining one that waits keeps what it does not say: its preferences, its round and the answer waiting', async () => {
    const saved: QuizStep[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const saver = new StepSaver({
      load: async () => ({}),
      openRounds: async () => [],
      save: async (s) => {
        if (!saved.length) await gate;
        saved.push(s);
      },
    });
    const roundInfo = {
      id: 'r1',
      origin: 'cover' as const,
      questionCount: 1,
      shuffled: false,
      shuffleOptions: false,
      startedAt: '',
      finished: false,
    };
    const preferences = { groups: ['01'], shuffle: false, shuffleOptions: false };
    const answer = {
      roundId: 'r1',
      questionId: 'a',
      position: 0,
      chosen: 1,
      correct: false,
      answeredAt: '',
    };
    saver.push({ quizId: 'q', sectionId: 's', round: 0 });
    saver.push({ quizId: 'q', sectionId: 's', round: 1, roundInfo, preferences });
    saver.push({ quizId: 'q', sectionId: 's', round: 2, roundInfo });
    saver.push({ quizId: 'q', sectionId: 's', round: 3, roundInfo, answer });
    expect(saver.pending).toBe(2);
    release();
    await saver.flush();
    expect(saved[1]).toEqual({
      quizId: 'q',
      sectionId: 's',
      round: 3,
      roundInfo,
      preferences,
      answer,
    });
  });

  it('steps without a round join each other; another section, another test or another round go after', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const saved: unknown[] = [];
    const saver = new StepSaver({
      load: async () => ({}),
      openRounds: async () => [],
      save: async (s) => {
        if (!saved.length) await gate;
        saved.push(s.round);
      },
    });
    const info = (id: string) => ({
      id,
      origin: 'cover' as const,
      questionCount: 1,
      shuffled: false,
      shuffleOptions: false,
      startedAt: '',
      finished: false,
    });
    saver.push({ quizId: 'q', sectionId: 's', round: 'first' });
    saver.push({ quizId: 'q', sectionId: 's', round: 'a' });
    saver.push({ quizId: 'q', sectionId: 's', round: 'b' });
    saver.push({ quizId: 'q', sectionId: 'otra', round: 'c' });
    saver.push({ quizId: 'otro', sectionId: 'otra', round: 'd' });
    saver.push({ quizId: 'otro', sectionId: 'otra', round: 'e', roundInfo: info('r2') });
    saver.push({ quizId: 'otro', sectionId: 'otra', round: 'f', roundInfo: info('r3') });
    expect(saver.pending).toBe(6);
    release();
    await saver.flush();
    expect(saved).toEqual(['first', 'b', 'c', 'd', 'e', 'f']);
  });

  it('what is thrown that is not an error is kept as one, with its text', async () => {
    const saver = new StepSaver(
      {
        load: async () => ({}),
        openRounds: async () => [],
        save: async () => {
          const thrown: unknown = 'sin red';
          throw thrown;
        },
      },
      [],
    );
    saver.push({ quizId: 'q', sectionId: 's', round: 'x' });
    await saver.flush();
    expect(saver.failed).toBeInstanceOf(Error);
    expect(saver.failed?.message).toBe('sin red');
  });
});
