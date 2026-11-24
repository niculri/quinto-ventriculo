// The in-memory study repository against the users database: the statistics of the cards and the questions of tests in
// the heatmap, compared after the Supabase adapter's translation.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { createDatabase } from '@qv/db/testing';
import { fakeSupabase, signIn } from '@qv/db/postgrest';
import { beforeAll, describe, expect, it } from 'vitest';
import { DATABASE_TIMEOUT, onBoth } from '../../../../../test/contract';
import {
  answer,
  card,
  DAY,
  DECK,
  inShape,
  OTHER_DECK,
  state,
} from '../../../../../test/studyContract';
import { storageKeys } from '../../../../../shared/lib/storage';
import { localStudyRepository } from '../memory';
import type { StudyRepository } from '../port';
import { supabaseStudyRepository } from '../supabase';

type PGlite = Awaited<ReturnType<typeof createDatabase>>;
let db: PGlite;
let n = 0;

beforeAll(async () => {
  db = await createDatabase('users');
}, DATABASE_TIMEOUT);

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (k) => items.get(k) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (k) => void items.delete(k),
    setItem: (k, v) => void items.set(k, v),
  };
}

async function pair() {
  const me = await signIn(db, `estadisticas${++n}@ug.uchile.cl`);
  const rest = fakeSupabase(db, () => me);
  const client = createClient<Database>(rest.url, rest.key, rest.options);
  const storage = memoryStorage();
  return {
    sql: supabaseStudyRepository(client),
    memory: localStudyRepository(storage),
    client,
    storage,
  };
}

/** Two answers to one card, the second a review of the first's interval. */
const twice =
  (guid: string, first: number, second: Parameters<typeof answer>[3], deckId = DECK) =>
  async (r: StudyRepository) => {
    const at = Date.now();
    const a = await r.recordReview(
      answer(card(guid, deckId), null, at, { state: state(at, { interval: first }) }),
    );
    return r.recordReview(
      answer(card(guid, deckId), a.updatedAt, at, {
        queueBefore: 'review',
        lastInterval: first,
        ...second,
      }),
    );
  };

describe('the statistics of the cards', () => {
  it('states, answers by day, reviews passed and failed, what is due, the hardest and the totals', async () => {
    const { sql, memory } = await pair();
    const at = Date.now();
    const got = await onBoth(
      sql,
      memory,
      [
        (r) => r.cardStats(null),
        (r) => r.recordReview(answer(card('n1'), null, at, { durationMs: 7000 })),
        twice('y1', 2, {
          rating: 1,
          state: state(at, {
            phase: 'relearning',
            interval: 1,
            lapses: 1,
            reps: 2,
            due: new Date(at + DAY).toISOString(),
          }),
        }),
        twice('m1', 30, {
          rating: 3,
          state: state(at, { interval: 40, reps: 2, due: new Date(at + 40 * DAY).toISOString() }),
        }),
        twice(
          'o1',
          25,
          { rating: 1, state: state(at, { phase: 'relearning', interval: 1, lapses: 3, reps: 2 }) },
          OTHER_DECK,
        ),
        (r) => r.recordReview(answer(card('s1'), null, at)),
        (r) => r.suspend([card('s1')], false),
        (r) => r.recordReview(answer(card('b1'), null, at)),
        (r) => r.bury([card('b1')], new Date(at + DAY), false),
        (r) => r.cardStats(null),
        (r) => r.cardStats([DECK]),
        (r) => r.cardStats(['9999']),
        (r) => r.cardStats(Array.from({ length: 5001 }, (_, i) => String(i))),
      ],
      inShape,
    );
    expect(got.memory).toEqual(got.sql);
    expect(got.raw.sql[9]).toMatchObject({
      cards: { learning: 0, relearning: 2, young: 1, mature: 1, suspended: 1, buried: 1 },
      overdue: 0,
      total: { answers: 9, days: 1 },
    });
    expect(
      (got.raw.sql[9] as { hardest: { noteGuid: string }[] }).hardest.map((h) => h.noteGuid),
    ).toEqual(['o1', 'y1']);
    expect((got.raw.sql[10] as { days: unknown[] }).days).toEqual([
      expect.objectContaining({ answers: 7, newCards: 5, youngFailed: 1, maturePassed: 1 }),
    ]);
  });
});

describe('the questions of tests in the heatmap', () => {
  it('each on its study day, by test, only those asked for', async () => {
    const { sql, memory, client, storage } = await pair();
    const round = '00000000-0000-4000-8000-00000000c001';
    const answers = [
      { quizId: 'quiz-a', at: new Date().toISOString() },
      { quizId: 'quiz-a', at: new Date(Date.now() - 2 * DAY).toISOString() },
      { quizId: 'quiz-b', at: new Date().toISOString() },
    ];
    for (const [i, a] of answers.entries()) {
      const r = await client.rpc('save_quiz_progress', {
        p: {
          quizId: a.quizId,
          sectionId: 's1',
          round: { id: `${round.slice(0, -1)}${i}` },
          roundInfo: {
            id: `${round.slice(0, -1)}${i}`,
            origin: 'cover',
            questionCount: 3,
            shuffled: false,
            shuffleOptions: false,
            startedAt: a.at,
            finished: false,
          },
          answer: {
            roundId: `${round.slice(0, -1)}${i}`,
            questionId: `q${i}`,
            position: 0,
            chosen: 1,
            correct: true,
            answeredAt: a.at,
          },
        },
      });
      expect(r.error).toBeNull();
    }
    storage.setItem(
      storageKeys.demo.quiz,
      JSON.stringify({ answers: answers.map((a) => ({ quizId: a.quizId, answeredAt: a.at })) }),
    );
    const got = await onBoth(
      sql,
      memory,
      [
        (r) => r.heatmap(null),
        (r) => r.heatmap(null, ['quiz-b']),
        (r) => r.heatmap([DECK], []),
        (r) =>
          r.heatmap(
            null,
            Array.from({ length: 5001 }, (_, i) => `q${i}`),
          ),
      ],
      inShape,
    );
    expect(got.memory).toEqual(got.sql);
    expect((got.raw.sql[0] as { tests: unknown[] }).tests).toHaveLength(3);
  });

  it('a browser whose tests cannot be read counts none', async () => {
    const storage = memoryStorage();
    storage.setItem(storageKeys.demo.quiz, '{');
    expect((await localStudyRepository(storage).heatmap(null)).tests).toEqual([]);
    expect((await localStudyRepository(null).heatmap(null)).tests).toEqual([]);
  });
});
