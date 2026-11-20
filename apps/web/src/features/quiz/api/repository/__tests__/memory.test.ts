// Pins the rules the in-memory tests repository re-implements from save_quiz_progress() and quiz_rounds.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { localQuizRepository, OPEN_ROUNDS } from '..';
import type { AnswerInfo, RoundInfo } from '..';
import { memoryStorage } from '../../../../../test/storage';

const info = (id: string, over: Partial<RoundInfo> = {}): RoundInfo => ({
  id,
  origin: 'cover',
  questionCount: 10,
  shuffled: false,
  shuffleOptions: false,
  startedAt: '2026-03-10T10:00:00.000Z',
  finished: false,
  ...over,
});

const answer = (roundId: string, position: number, answeredAt: string): AnswerInfo => ({
  roundId,
  questionId: `q${position}`,
  position,
  chosen: 0,
  correct: true,
  answeredAt,
});

describe('saving a section', () => {
  it('a save without preferences keeps the saved ones; «Descartar» leaves the section without a round', async () => {
    const repo = localQuizRepository(null);
    await repo.save({
      quizId: 'q',
      sectionId: 's',
      preferences: { groups: ['01'] },
      round: { id: 'r1' },
      roundInfo: info('r1'),
    });
    await repo.save({ quizId: 'q', sectionId: 's', round: null });
    expect((await repo.load('q')).s).toMatchObject({
      preferences: { groups: ['01'] },
      round: null,
    });
    expect(await repo.load('other')).toEqual({});
  });

  it('a round discarded before finishing leaves «Seguir»; a finished one never comes back to it', async () => {
    const repo = localQuizRepository(null);
    const at = '2026-03-10T10:05:00.000Z';
    await repo.save({
      quizId: 'q',
      sectionId: 's',
      round: { id: 'r1' },
      roundInfo: info('r1'),
      answer: answer('r1', 0, at),
    });
    expect(await repo.openRounds()).toHaveLength(1);
    await repo.save({ quizId: 'q', sectionId: 's', round: null });
    expect(await repo.openRounds()).toEqual([]);
    await repo.save({
      quizId: 'q',
      sectionId: 't',
      round: { id: 'r2' },
      roundInfo: info('r2', { finished: true }),
      answer: answer('r2', 0, at),
    });
    await repo.save({ quizId: 'q', sectionId: 't', round: { id: 'r3' }, roundInfo: info('r3') });
    expect(await repo.openRounds()).toEqual([]);
  });
});

describe('«Seguir» on the home page (openRounds)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it(`only active rounds with an answer, at most ${OPEN_ROUNDS}, the latest first`, async () => {
    const repo = localQuizRepository(null);
    vi.useFakeTimers({ toFake: ['Date'] });
    for (let i = 0; i < OPEN_ROUNDS + 2; i++) {
      vi.setSystemTime(Date.parse(`2026-03-10T12:0${i}:00.000Z`));
      await repo.save({
        quizId: `q${i}`,
        sectionId: 's',
        round: { id: `r${i}` },
        roundInfo: info(`r${i}`),
        ...(i === 0 ? {} : { answer: answer(`r${i}`, 0, `2026-03-10T11:0${i}:00.000Z`) }),
      });
    }
    const open = await repo.openRounds();
    expect(open.map((r) => r.quizId)).toEqual(['q6', 'q5', 'q4', 'q3', 'q2']);
    expect(open[0]).toEqual({
      quizId: 'q6',
      sectionId: 's',
      answered: 1,
      questionCount: 10,
      updatedAt: '2026-03-10T12:06:00.000Z',
    });
  });

  it('orders by when each round was last saved, not by the moment each answer says', async () => {
    const repo = localQuizRepository(null);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-03-10T12:30:00.000Z'));
    await repo.save({
      quizId: 'late',
      sectionId: 's',
      round: { id: 'r1' },
      roundInfo: info('r1'),
      answer: answer('r1', 0, '2026-03-10T12:00:00.000Z'),
    });
    vi.setSystemTime(Date.parse('2026-03-10T12:31:00.000Z'));
    await repo.save({
      quizId: 'early',
      sectionId: 's',
      round: { id: 'r2' },
      roundInfo: info('r2'),
      answer: answer('r2', 0, '2026-03-10T11:00:00.000Z'),
    });
    expect((await repo.openRounds()).map((r) => r.quizId)).toEqual(['early', 'late']);
  });
});

describe('the demo repository', () => {
  it('as the database: an answer once, the replaced round abandoned, the finished one finished', async () => {
    const storage = memoryStorage();
    const repo = localQuizRepository(storage);
    const info = (id: string, finished = false) => ({
      id,
      origin: 'cover' as const,
      questionCount: 1,
      shuffled: false,
      shuffleOptions: false,
      startedAt: '',
      finished,
    });
    const answer = {
      roundId: 'r1',
      questionId: 'a',
      position: 0,
      chosen: 0,
      correct: true,
      answeredAt: '',
    };
    await repo.save({
      quizId: 'q',
      sectionId: 's',
      preferences: { groups: ['01'] },
      round: { id: 'r1' },
      roundInfo: info('r1'),
    });
    await repo.save({
      quizId: 'q',
      sectionId: 's',
      round: { id: 'r1' },
      roundInfo: info('r1'),
      answer,
    });
    await repo.save({
      quizId: 'q',
      sectionId: 's',
      round: { id: 'r1' },
      roundInfo: info('r1'),
      answer,
    });
    await repo.save({ quizId: 'q', sectionId: 's', round: { id: 'r2' }, roundInfo: info('r2') });
    const data = JSON.parse(storage.getItem('qv-demo-quiz')!) as {
      rounds: { id: string; status: string }[];
      answers: unknown[];
    };
    expect(data.rounds.map((r) => [r.id, r.status])).toEqual([
      ['r1', 'abandoned'],
      ['r2', 'active'],
    ]);
    expect(data.answers).toHaveLength(1);
    const back = await repo.load('q');
    expect(back.s).toMatchObject({ preferences: { groups: ['01'] }, round: { id: 'r2' } });
    expect(await repo.load('otro')).toEqual({});
  });
});
