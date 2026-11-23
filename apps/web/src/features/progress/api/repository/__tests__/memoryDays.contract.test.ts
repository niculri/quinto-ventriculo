// The in-memory study repository against the users database: practice, the days of study, the home page's counts and
// the reconciling of the cards, compared after the Supabase adapter's translation.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { createDatabase } from '@qv/db/testing';
import { fakeSupabase, signIn } from '@qv/db/postgrest';
import type { Person } from '@qv/db/postgrest';
import { HomeCounts, ReconcileResult } from '@qv/schema/user';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DATABASE_TIMEOUT, onBoth } from '../../../../../test/contract';
import {
  answer,
  card,
  DAY,
  DECK,
  HOUR,
  inShape,
  iso,
  OTHER_DECK,
} from '../../../../../test/studyContract';
import { localStudyRepository } from '../memory';
import { defaultPreferences } from '../model';
import type { StoredCard } from '../model';
import type { StudyRepository } from '../port';
import { supabaseStudyRepository } from '../supabase';
import { preferencesPatch } from '@qv/study';

type PGlite = Awaited<ReturnType<typeof createDatabase>>;
let db: PGlite;
let n = 0;
const zone = process.env.TZ;

beforeAll(async () => {
  // A browser far from Santiago: without preferences, the database's day is Santiago's, not the browser's.
  process.env.TZ = 'Asia/Tokyo';
  db = await createDatabase('users');
}, DATABASE_TIMEOUT);
afterAll(() => {
  if (zone === undefined) delete process.env.TZ;
  else process.env.TZ = zone;
});

async function pair(storage: Storage | null = null) {
  const me = await signIn(db, `estudiante${++n}@ug.uchile.cl`);
  const rest = fakeSupabase(db, () => me);
  return {
    sql: supabaseStudyRepository(createClient<Database>(rest.url, rest.key, rest.options)),
    memory: localStudyRepository(storage),
    me,
  };
}

const sorted = <T extends { deckId: string }>(list: T[]) =>
  [...list].sort((a, b) => a.deckId.localeCompare(b.deckId));

describe('the days of study', () => {
  it('practice: by deck, each deck once, at most 5,000 a day; the limits of a batch', async () => {
    const { sql, memory } = await pair();
    const got = await onBoth(
      sql,
      memory,
      [
        (r) =>
          r.recordPractice([
            { deckId: DECK, n: 3 },
            { deckId: OTHER_DECK, n: 0 },
          ]),
        (r) =>
          r.recordPractice(
            Array.from({ length: 101 }, (_, i) => ({ deckId: String(2000 + i), n: 1 })),
          ),
        (r) => r.recordPractice([{ deckId: DECK, n: 1001 }]),
        // The same deck twice in a batch counts once, where it first appears.
        ...Array.from(
          { length: 5 },
          () => (r: StudyRepository) =>
            r.recordPractice([
              { deckId: DECK, n: 600 },
              { deckId: OTHER_DECK, n: 100 },
              { deckId: DECK, n: 300 },
            ]),
        ),
        (r) => r.recordPractice([{ deckId: '1003', n: 9 }]),
        (r) => r.heatmap(null),
        (r) => r.heatmap([OTHER_DECK]),
      ],
      inShape,
    );
    expect(got.memory).toEqual(got.sql);
  });

  it('without preferences the day is Santiago’s at 4:00; an answer keeps the day it was given', async () => {
    const { sql, memory } = await pair();
    // 05:30 UTC: still the day before in Santiago (02:30, before 4:00), already the day in Tokyo.
    const at = Date.parse(`${new Date().toISOString().slice(0, 10)}T05:30:00Z`);
    const when = at > Date.now() ? at - DAY : at;
    const got = await onBoth(
      sql,
      memory,
      [
        (r) => r.recordReview(answer(card('a'), null, when)),
        (r) => r.recordPractice([{ deckId: DECK, n: 2 }]),
        (r) => r.heatmap(null),
        (r) =>
          r.savePreferences(
            preferencesPatch(null, { ...defaultPreferences('Asia/Tokyo'), dayStartsAt: 0 }),
          ),
        (r) => r.heatmap(null),
      ],
      inShape,
    );
    expect(got.memory).toEqual(got.sql);
  });
});

describe('the home page’s counts', () => {
  it('refuses a decay out of range and too many decks', async () => {
    const { sql, memory } = await pair();
    const until = new Date(Date.now() + DAY);
    const got = await onBoth(sql, memory, [
      (r) => r.homeCounts([DECK], until, { [DECK]: 5 }),
      (r) =>
        r.homeCounts(
          Array.from({ length: 5001 }, (_, i) => String(i)),
          until,
          {},
        ),
      (r) => r.homeCounts([], until, { [DECK]: 5 }),
      (r) => r.heatmap(Array.from({ length: 5001 }, (_, i) => String(i))),
    ]);
    expect(got.memory).toEqual(got.sql);
  });

  it('past 20,000 cards due, no decks and `truncated`', async () => {
    const due = 20_001;
    const at = Date.now() - DAY;
    const cards: StoredCard[] = Array.from({ length: due }, (_, i) => ({
      ...card(`h${i}`),
      ...answer(card(`h${i}`), null, at).state,
      due: iso(at),
      flag: 0,
      buriedUntil: null,
      updatedAt: iso(at),
      retiredAt: null,
    }));
    const saved = new Map([['qv-demo-study', JSON.stringify({ cards })]]);
    const storage = {
      getItem: (k: string) => saved.get(k) ?? null,
      setItem: (k: string, v: string) => void saved.set(k, v),
    } as Storage;
    const { sql, memory, me } = await pair(storage);
    await insertDue(me, due, at);
    const got = await onBoth(sql, memory, [
      (r) => r.homeCounts([DECK], new Date(Date.now() + DAY), {}),
    ]);
    expect(got.memory).toEqual(got.sql);
    expect(HomeCounts.parse(got.raw.sql[0])).toEqual({ decks: [], truncated: true });
  });
});

async function insertDue(me: Person, count: number, at: number) {
  await db.query(
    `insert into public.card_states (user_id, note_guid, ord, deck_id, phase, interday, due, interval, stability,
            difficulty, reps, last_review)
     select $1, 'h' || i, 0, $2, 'review', true, $3, 2, 2.5, 5, 1, $3 from generate_series(0, $4 - 1) as i`,
    [me.sub, DECK, iso(at), count],
  );
}

describe('the cards that moved or left', () => {
  it('reconcile from where it was, the changes that are real, another tab ahead, at most 2,000', async () => {
    const { sql, memory } = await pair();
    const T = Date.now() - HOUR;
    const changes = Array.from({ length: 2001 }, (_, i) => ({
      noteGuid: `x${i}`,
      ord: 0,
      deckId: DECK,
    }));
    const got = await onBoth(
      sql,
      memory,
      [
        (r) => r.recordReview(answer(card('a'), null, T)),
        (r) => r.recordReview(answer(card('b'), null, T)),
        (r) => r.cardsSyncedTo(),
        (r) =>
          r.reconcileCards({
            since: 0,
            upTo: 5,
            changes: [
              { noteGuid: 'a', ord: 0, deckId: OTHER_DECK },
              { noteGuid: 'b', ord: 0, deckId: null },
              { noteGuid: 'zz', ord: 0, deckId: OTHER_DECK },
            ],
          }),
        (r) => r.reconcileCards({ since: 3, upTo: 9, changes: [] }),
        (r) => r.reconcileCards({ since: 5, upTo: 9, changes }),
        (r) =>
          r.reconcileCards({
            since: 5,
            upTo: 7,
            changes: [{ noteGuid: 'b', ord: 0, deckId: null }],
          }),
        (r) => r.cardsSyncedTo(),
        async (r) => ({
          cards: await r.allCards(),
          progress: sorted(await r.deckProgress(new Date(T))),
        }),
      ],
      inShape,
    );
    expect(got.memory).toEqual(got.sql);
    expect(ReconcileResult.parse(got.raw.memory[3])).toBeTruthy();
  });
});
