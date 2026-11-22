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

describe('what the demo repository reads from the browser', () => {
  const kept = (rounds: unknown[], answers: unknown[]) => {
    const storage = memoryStorage();
    storage.setItem('qv-demo-quiz', JSON.stringify({ progress: {}, rounds, answers }));
    return storage;
  };
  const round = (id: string, over: object = {}) => ({
    ...info(id),
    quizId: id,
    sectionId: 's',
    status: 'active',
    ...over,
  });
  const kept_answer = (roundId: string, position: number, answeredAt: string) => ({
    ...answer(roundId, position, answeredAt),
    quizId: roundId,
    sectionId: 's',
  });

  it('a round kept before it had a time of its own takes its last answer’s, or its start', async () => {
    const storage = kept(
      [round('old'), round('new', { updatedAt: '2026-03-10T11:30:00.000Z' })],
      [
        kept_answer('old', 0, '2026-03-10T10:30:00.000Z'),
        kept_answer('old', 1, '2026-03-10T12:00:00.000Z'),
        kept_answer('old', 2, '2026-03-10T09:00:00.000Z'),
        kept_answer('new', 0, '2026-03-10T11:00:00.000Z'),
      ],
    );
    expect(await localQuizRepository(storage).openRounds()).toEqual([
      {
        quizId: 'old',
        sectionId: 's',
        answered: 3,
        questionCount: 10,
        updatedAt: '2026-03-10T12:00:00.000Z',
      },
      {
        quizId: 'new',
        sectionId: 's',
        answered: 1,
        questionCount: 10,
        updatedAt: '2026-03-10T11:30:00.000Z',
      },
    ]);
  });

  it('two rounds saved at the same moment keep the order they were kept in', async () => {
    const at = { updatedAt: '2026-03-10T11:30:00.000Z' };
    const storage = kept(
      [round('a', at), round('b', at)],
      [kept_answer('a', 0, ''), kept_answer('b', 0, '')],
    );
    expect((await localQuizRepository(storage).openRounds()).map((r) => r.quizId)).toEqual([
      'a',
      'b',
    ]);
  });

  it('what is not readable starts empty, and a save writes it again whole', async () => {
    const storage = memoryStorage();
    storage.setItem('qv-demo-quiz', '{roto');
    const repo = localQuizRepository(storage);
    expect(await repo.load('q')).toEqual({});
    expect(await repo.openRounds()).toEqual([]);
    await repo.save({ quizId: 'q', sectionId: 's', round: { id: 'r1' }, roundInfo: info('r1') });
    expect(JSON.parse(storage.getItem('qv-demo-quiz')!)).toMatchObject({ rounds: [{ id: 'r1' }] });
  });

  it('without a parameter it uses the browser’s storage; when the browser blocks it, its memory', async () => {
    await localQuizRepository().save({
      quizId: 'q',
      sectionId: 's',
      round: { id: 'r1' },
      roundInfo: info('r1'),
    });
    expect(localStorage.getItem('qv-demo-quiz')).toContain('r1');
    localStorage.clear();
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const blocked = localQuizRepository();
    await blocked.save({ quizId: 'q', sectionId: 's', round: { id: 'r2' }, roundInfo: info('r2') });
    expect((await blocked.load('q')).s?.round).toEqual({ id: 'r2' });
    vi.restoreAllMocks();
    expect(localStorage.getItem('qv-demo-quiz')).toBeNull();
  });

  it('an answer of a round it never kept is kept, and changes no round', async () => {
    const storage = memoryStorage();
    const repo = localQuizRepository(storage);
    await repo.save({
      quizId: 'q',
      sectionId: 's',
      round: { id: 'x' },
      answer: answer('x', 0, 't'),
    });
    const data = JSON.parse(storage.getItem('qv-demo-quiz')!) as {
      rounds: unknown[];
      answers: unknown[];
    };
    expect(data.rounds).toEqual([]);
    expect(data.answers).toHaveLength(1);
  });

  it('a browser without storage keeps the progress in memory', async () => {
    vi.stubGlobal('localStorage', undefined);
    const repo = localQuizRepository();
    await repo.save({ quizId: 'q', sectionId: 's', round: { id: 'r3' }, roundInfo: info('r3') });
    expect((await repo.load('q')).s?.round).toEqual({ id: 'r3' });
    vi.unstubAllGlobals();
  });

  it('a storage that refuses to write keeps the progress in memory', async () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    const repo = localQuizRepository(storage);
    await repo.save({ quizId: 'q', sectionId: 's', preferences: { groups: ['01'] }, round: null });
    expect(storage.getItem('qv-demo-quiz')).toBeNull();
  });
});
