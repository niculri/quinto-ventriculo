// The in-memory study repository against the users database: answers, the changes of the browser and undo given to
// both, and every read of the cards and the log compared after the Supabase adapter's translation.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { createDatabase } from '@qv/db/testing';
import { fakeSupabase, signIn } from '@qv/db/postgrest';
import {
  CardLogEntry,
  DeckProgress,
  HomeCounts,
  RatedAnswer,
  StoredCard,
  UndoResult,
} from '@qv/schema/user';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DATABASE_TIMEOUT, onBoth } from '../../../../test/contract';
import {
  answer,
  byCard,
  card,
  DAY,
  DECK,
  HOUR,
  inShape,
  iso,
  OTHER_DECK,
  state,
} from '../../../../test/study-contract';
import { localStudyRepository } from './memory';
import type { StudyRepository } from './port';
import { supabaseStudyRepository } from './supabase';

type PGlite = Awaited<ReturnType<typeof createDatabase>>;
let db: PGlite;
let n = 0;

beforeAll(async () => {
  db = await createDatabase('users');
}, DATABASE_TIMEOUT);
afterEach(() => {
  vi.useRealTimers();
});

async function pair() {
  const me = await signIn(db, `estudiante${++n}@ug.uchile.cl`);
  const rest = fakeSupabase(db, () => me);
  return {
    sql: supabaseStudyRepository(createClient<Database>(rest.url, rest.key, rest.options)),
    memory: localStudyRepository(null),
    me,
  };
}

/** Each repository's last stamp of a card, to answer it as the page would (with what it read). */
const stamps = new Map<StudyRepository, Map<string, string>>();
const stampOf = (r: StudyRepository, guid: string) => stamps.get(r)?.get(guid) ?? null;
async function keepStamps(r: StudyRepository) {
  const map = new Map((await r.allCards()).map((c) => [c.noteGuid, c.updatedAt]));
  stamps.set(r, map);
}

const T = Date.now() - HOUR;
const A = card('a');
const B = card('b');
const C = card('c');
const D = card('d', OTHER_DECK);

/** Answers and browser changes, each step one action, with every card read again after it. */
const actions: ((r: StudyRepository) => Promise<unknown>)[] = [
  (r) => r.recordReview(answer(A, null, T, { durationMs: 3000 })),
  // A page that read the card before that answer.
  (r) => r.recordReview(answer(A, null, T + 60_000)),
  async (r) => {
    await keepStamps(r);
    const next = state(T + 120_000, { stability: 4.123456789, difficulty: 6.25, reps: 2 });
    return r.recordReview(
      answer(A, stampOf(r, 'a'), T + 120_000, {
        rating: 4,
        queueBefore: 'review',
        interval: 4,
        lastInterval: 2,
        durationMs: 5001,
        state: next,
        bury: [B, C],
        buriedUntil: iso(T + DAY),
      }),
    );
  },
  (r) => r.suspend([D], false),
  (r) => r.bury([D], new Date(T + DAY), true),
  async (r) => {
    await keepStamps(r);
    // The answer never clears «suspended» nor «leech».
    return r.recordReview(
      answer(D, stampOf(r, 'd'), T + 180_000, {
        state: state(T + 180_000, { leech: true }),
        queueBefore: 'learn',
      }),
    );
  },
  (r) => r.setFlag(A, 3),
  (r) => r.setFlags([A, B, card('x')], 3),
  (r) => r.setFlag(A, 8),
  (r) => r.unsuspend([D, card('y')]),
  (r) => r.unbury([B, C]),
  (r) => r.forget([B, card('z')], false),
  (r) => r.forget([A], true),
  // A time more than a day away from now, and more than 100 siblings.
  async (r) => {
    await keepStamps(r);
    return r.recordReview(answer(C, stampOf(r, 'c'), T - 3 * DAY));
  },
  (r) =>
    r.recordReview(
      answer(card('e'), null, T, { bury: Array.from({ length: 101 }, (_, i) => card(`s${i}`)) }),
    ),
];

const reads = (since: number) => (r: StudyRepository) =>
  (async () => ({
    cards: byCard(await r.cards([DECK, OTHER_DECK, '9999'])),
    all: byCard(await r.allCards()),
    log: await r.cardLog({ noteGuid: 'a', ord: 0 }),
    logD: await r.cardLog({ noteGuid: 'd', ord: 0 }),
    rated: await r.ratedSince(new Date(since)),
    between: await r.ratedBetween(new Date(since), new Date(T + 150_000)),
    first: byCard(await r.firstAnswersSince(new Date(since))),
    today: await r.answersSince(new Date(since)),
    progress: (await r.deckProgress(new Date(T + 3 * HOUR))).sort((a, b) =>
      a.deckId.localeCompare(b.deckId),
    ),
    answered: (await r.answeredDecks()).sort(),
    median: await r.medianAnswerMs(),
    home: await r.homeCounts([DECK, OTHER_DECK], new Date(T + 3 * DAY), { [DECK]: 0.3 }),
  }))();

describe('answers and the browser’s changes', () => {
  it('each action, and every read after it', async () => {
    const { sql, memory } = await pair();
    const steps = actions.flatMap((step) => [step, reads(T - DAY)]);
    const got = await onBoth(sql, memory, steps, inShape);
    expect(got.memory).toEqual(got.sql);
    const last = got.raw.memory.at(-1) as Awaited<ReturnType<ReturnType<typeof reads>>>;
    for (const side of [got.raw.sql.at(-1), last] as (typeof last)[]) {
      expect(StoredCard.array().parse(side.cards)).toBeTruthy();
      expect(CardLogEntry.array().parse(side.log)).toBeTruthy();
      expect(RatedAnswer.array().parse(side.rated)).toBeTruthy();
      expect(DeckProgress.array().parse(side.progress)).toBeTruthy();
      expect(HomeCounts.parse(side.home)).toBeTruthy();
    }
    const recall = (side: typeof last) => side.home.decks.map((d) => d.recall);
    const [a, b] = [recall(got.raw.sql.at(-1) as typeof last), recall(last)];
    expect(a.length).toBeGreaterThan(0);
    a.forEach((x, i) => expect(Math.abs(x - b[i]!)).toBeLessThan(1e-3));
  });

  it('undo takes back each action whole, the last one first, until there is nothing', async () => {
    const { sql, memory } = await pair();
    const undo = async (r: StudyRepository) => ({
      undone: await r.undo(),
      cards: byCard(await r.allCards()),
    });
    const steps = [...actions, ...actions.map(() => undo), undo];
    const got = await onBoth(sql, memory, steps, inShape);
    expect(got.memory).toEqual(got.sql);
    for (const side of [got.raw.sql, got.raw.memory]) {
      const first = side[actions.length] as { undone: unknown };
      expect(UndoResult.parse(first.undone)).toBeTruthy();
      expect(side.at(-1)).toEqual({ undone: null, cards: [] });
    }
  });

  it('the median of the time per answer: from 20 answers, the last 500, an undone one leaves it', async () => {
    const { sql, memory } = await pair();
    const steps: ((r: StudyRepository) => Promise<unknown>)[] = [];
    for (let i = 0; i < 21; i++) {
      steps.push((r) =>
        r.recordReview(
          answer(card(`m${i}`), null, T + i * 1000, { durationMs: i < 20 ? 1001 + i : 9999 }),
        ),
      );
      steps.push((r) => r.medianAnswerMs());
    }
    steps.push(
      (r) => r.undo(),
      (r) => r.medianAnswerMs(),
    );
    const got = await onBoth(sql, memory, steps, inShape);
    expect(got.memory).toEqual(got.sql);
    // Twenty answers, the 9,999 undone: (1010 + 1011) / 2 = 1010.5, rounded to the even one.
    expect(got.raw.sql.at(-1)).toBe(1010);
    expect(got.raw.sql[39]).toBe(1010);
  });
});

describe('undo reaches 48 hours back', () => {
  it('an action older than that is not undone any more', async () => {
    const { sql, memory, me } = await pair();
    const steps: ((r: StudyRepository) => Promise<unknown>)[] = [
      (r) => r.recordReview(answer(A, null, T)),
      (r) => r.recordReview(answer(B, null, T)),
      async (r) => {
        // Two days and a bit later: for the database, its undo rows are that old; for the memory, its clock is.
        if (r === sql) {
          await db.query(
            `update public.review_undo set created_at = created_at - interval '49 hours' where user_id = $1`,
            [me.sub],
          );
        } else {
          vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 49 * HOUR });
        }
        return r.undo();
      },
      (r) => r.ratedSince(new Date(T - DAY)),
    ];
    const got = await onBoth(sql, memory, steps, inShape);
    expect(got.memory).toEqual(got.sql);
    expect(got.raw.sql[2]).toBeNull();
  });
});
