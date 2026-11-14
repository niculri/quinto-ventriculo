// Pins the rules that the in-memory tests repository re-implements from save_quiz_progress() and the quiz_rounds table.
// Above each test, the db/tests case that checks the same rule in SQL («db: none» when there is none); «differs» marks
// a behaviour that is not the database's.
import { describe, expect, it } from 'vitest';
import { localQuizRepository, OPEN_ROUNDS } from './repository';
import type { AnswerInfo, RoundInfo } from './repository';

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
  // db: none
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

  // db: quizzes.test.ts › a round replaced or discarded before finishing is abandoned; a finished one stays finished
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
  // db: none
  it(`only active rounds with an answer, at most ${OPEN_ROUNDS}, the latest first`, async () => {
    const repo = localQuizRepository(null);
    for (let i = 0; i < OPEN_ROUNDS + 2; i++) {
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
      updatedAt: '2026-03-10T11:06:00.000Z',
    });
  });

  // differs — save_quiz_progress() sets quiz_rounds.updated_at to the moment of the save (now()), and openRounds()
  // orders by it; no db test
  it('orders by the moment each answer says it was answered, not by when it was saved', async () => {
    const repo = localQuizRepository(null);
    await repo.save({
      quizId: 'late',
      sectionId: 's',
      round: { id: 'r1' },
      roundInfo: info('r1'),
      answer: answer('r1', 0, '2026-03-10T12:00:00.000Z'),
    });
    await repo.save({
      quizId: 'early',
      sectionId: 's',
      round: { id: 'r2' },
      roundInfo: info('r2'),
      answer: answer('r2', 0, '2026-03-10T11:00:00.000Z'),
    });
    expect((await repo.openRounds()).map((r) => r.quizId)).toEqual(['late', 'early']);
  });
});
