// The in-memory practice test repository against the users database: the same saves on both, the SQL through the
// Supabase adapter, and what each one reads back compared after the adapter's translation.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { createDatabase } from '@qv/db/testing';
import { fakeSupabase, signIn } from '@qv/db/postgrest';
import { OpenRound, SavedQuiz } from '@qv/schema/user';
import { beforeAll, describe, expect, it } from 'vitest';
import { DATABASE_TIMEOUT, onBoth } from '../../../../../test/contract';
import { localQuizRepository } from '../memory';
import { OPEN_ROUNDS } from '../model';
import type { AnswerInfo, QuizStep, RoundInfo } from '../model';
import type { QuizRepository } from '../port';
import { supabaseQuizRepository } from '../supabase';

type PGlite = Awaited<ReturnType<typeof createDatabase>>;
let db: PGlite;
let n = 0;

beforeAll(async () => {
  db = await createDatabase('users');
}, DATABASE_TIMEOUT);

async function pair() {
  const me = await signIn(db, `alumno${++n}@ug.uchile.cl`);
  const rest = fakeSupabase(db, () => me);
  return {
    sql: supabaseQuizRepository(createClient<Database>(rest.url, rest.key, rest.options)),
    memory: localQuizRepository(null),
  };
}

const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const info = (i: number, over: Partial<RoundInfo> = {}): RoundInfo => ({
  id: id(i),
  origin: 'cover',
  questionCount: 10,
  shuffled: false,
  shuffleOptions: true,
  startedAt: '2026-03-10T10:00:00.000Z',
  finished: false,
  ...over,
});
const answer = (i: number, position: number, answeredAt: string): AnswerInfo => ({
  roundId: id(i),
  questionId: `p${position}`,
  position,
  chosen: 1,
  correct: position % 2 === 0,
  answeredAt,
});
const pause = () => new Promise((r) => setTimeout(r, 5));
/** A save, a little after the one before: the database's moments are those of each save. */
const save = (step: QuizStep) => async (r: QuizRepository) => {
  await pause();
  return r.save(step);
};
const read = (quizIds: string[]) => async (r: QuizRepository) => ({
  open: await r.openRounds(),
  ...Object.fromEntries(await Promise.all(quizIds.map(async (q) => [q, await r.load(q)]))),
});

describe('practice tests', () => {
  it('a round, its answers (once each), its end, and a section discarded or replaced', async () => {
    const { sql, memory } = await pair();
    const got = await onBoth(sql, memory, [
      read(['a']),
      save({
        quizId: 'a',
        sectionId: 's',
        preferences: { groups: ['01'] },
        round: { id: id(1) },
        roundInfo: info(1),
      }),
      save({
        quizId: 'a',
        sectionId: 's',
        round: { id: id(1), at: 1 },
        answer: answer(1, 0, '2026-03-10T10:01:00.000Z'),
      }),
      save({
        quizId: 'a',
        sectionId: 's',
        round: { id: id(1), at: 2 },
        answer: answer(1, 0, '2026-03-10T10:02:00.000Z'),
      }),
      save({
        quizId: 'a',
        sectionId: 's',
        round: { id: id(1), at: 3 },
        answer: answer(1, 1, '2026-03-10T10:03:00.000Z'),
      }),
      read(['a']),
      // Another section: a round that ends; then a new one, never answered.
      save({
        quizId: 'a',
        sectionId: 't',
        round: { id: id(2) },
        roundInfo: info(2),
        answer: answer(2, 0, '2026-03-10T10:04:00.000Z'),
      }),
      save({
        quizId: 'a',
        sectionId: 't',
        round: { id: id(2) },
        roundInfo: info(2, { finished: true }),
      }),
      save({ quizId: 'a', sectionId: 't', round: { id: id(3) }, roundInfo: info(3) }),
      read(['a']),
      // «Descartar»: the section without a round, its preferences kept; a round that is not an object is none.
      save({ quizId: 'a', sectionId: 's', round: null }),
      save({ quizId: 'b', sectionId: 's', preferences: {}, round: 'no es una ronda' }),
      save({ quizId: 'b', sectionId: 'u', preferences: { x: 1 }, round: [id(9)] }),
      read(['a', 'b']),
    ]);
    expect(got.memory).toEqual(got.sql);
    for (const side of [got.raw.sql, got.raw.memory]) {
      for (const step of [0, 5, 9, 13] as const) {
        const { open, ...quizzes } = side[step] as { open: unknown[] };
        expect(OpenRound.array().parse(open)).toBeTruthy();
        for (const q of Object.values(quizzes)) expect(SavedQuiz.parse(q)).toBeTruthy();
      }
    }
  });

  it(`«Seguir»: at most ${OPEN_ROUNDS}, the last saved first, whatever moment each answer says`, async () => {
    const { sql, memory } = await pair();
    const steps = [];
    for (let i = 0; i < OPEN_ROUNDS + 2; i++) {
      // The later saves bring the earlier moments (a phone that was offline, a wrong clock).
      const at = `2026-03-10T11:0${OPEN_ROUNDS + 2 - i}:00.000Z`;
      steps.push(
        save({
          quizId: `q${i}`,
          sectionId: 's',
          round: { id: id(10 + i) },
          roundInfo: info(10 + i),
          answer: answer(10 + i, 0, at),
        }),
      );
    }
    // An answer to the first round, now: it goes first.
    steps.push(
      save({
        quizId: 'q0',
        sectionId: 's',
        round: { id: id(10) },
        answer: answer(10, 1, '2026-03-10T09:00:00.000Z'),
      }),
    );
    const got = await onBoth(sql, memory, [...steps, (r) => r.openRounds()]);
    expect(got.memory).toEqual(got.sql);
    const open = got.raw.sql.at(-1) as { quizId: string }[];
    expect(open.map((r) => r.quizId)).toEqual(['q0', 'q6', 'q5', 'q4', 'q3']);
  });
});
