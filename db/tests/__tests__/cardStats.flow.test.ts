// my_card_stats(): the statistics of the caller's own cards (states, answers and retention by day, what is due, the
// cards forgotten most often and the totals), and nobody else's.
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser } from '../pglite';
import { usersDatabaseWith } from '../helpers/users';

const ANA = { sub: '00000000-0000-4000-8000-00000000004a', email: 'ana.stats@ug.uchile.cl' };
const BETO = { sub: '00000000-0000-4000-8000-00000000004b', email: 'beto.stats@ug.uchile.cl' };
const OUTSIDER = { sub: '00000000-0000-4000-8000-00000000004c', email: 'otra@gmail.com' };
const DECK = '3059400110';
const OTHER = '3059400111';

type Q = Pick<PGlite, 'query'>;
interface Stats {
  today: string;
  cards: number[];
  days: [string, ...number[]][];
  due: [string, number][];
  overdue: number;
  hardest: [string, number, string, number, number][];
  total: number[];
}

const stats = async (tx: Q, decks: string[] | null = null) =>
  (
    await tx.query<{ r: Stats }>(
      decks === null
        ? 'select public.my_card_stats() as r'
        : 'select public.my_card_stats($1) as r',
      decks === null ? [] : [decks],
    )
  ).rows[0]!.r;

interface Card {
  guid: string;
  deck?: string;
  phase?: string;
  interval?: number;
  dueDays?: number | null;
  lapses?: number;
  reps?: number;
  suspended?: boolean;
  buried?: boolean;
  retired?: boolean;
}

async function card(db: PGlite, who: { sub: string }, c: Card) {
  const phase = c.phase ?? 'review';
  const due = c.dueDays === null || phase === 'new' ? null : (c.dueDays ?? 3);
  await db.query(
    `insert into public.card_states (user_id, note_guid, ord, deck_id, phase, interday, due, interval, stability,
       difficulty, reps, lapses, last_review, suspended, buried_until, retired_at)
     values ($1, $2, 0, $3, $4, $4 in ('review', 'relearning'),
             case when $5::int is null then null
                  else ((public.study_day_of($1, now()) + $5::int) + interval '4 hours') at time zone 'America/Santiago'
             end,
             $6, case when $4 = 'new' then null else 3 end, case when $4 = 'new' then null else 5 end, $7, $8,
             case when $4 = 'new' then null else now() end, $9,
             case when $10 then now() + interval '1 day' end, case when $11 then now() end)`,
    [
      who.sub,
      c.guid,
      c.deck ?? DECK,
      phase,
      due,
      c.interval ?? 3,
      c.reps ?? 1,
      c.lapses ?? 0,
      c.suspended ?? false,
      c.buried ?? false,
      c.retired ?? false,
    ],
  );
}

async function answer(
  db: PGlite,
  who: { sub: string },
  a: {
    guid: string;
    queue: string;
    rating: number;
    last?: number;
    ms?: number;
    deck?: string;
    daysAgo?: number;
  },
) {
  await db.query(
    `insert into public.review_log (user_id, action, note_guid, ord, deck_id, reviewed_at, rating, queue_before,
       phase_before, phase_after, last_interval, duration_ms)
     values ($1, 'answer', $2, 0, $3, now() - make_interval(days => $4), $5, $6, 'review', 'review', $7, $8)`,
    [
      who.sub,
      a.guid,
      a.deck ?? DECK,
      a.daysAgo ?? 0,
      a.rating,
      a.queue,
      a.last ?? null,
      a.ms ?? 1000,
    ],
  );
}

describe('my_card_stats()', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await usersDatabaseWith([ANA, BETO, OUTSIDER]);
    await card(db, ANA, { guid: 'l1', phase: 'learning', interval: 0, dueDays: 0 });
    await card(db, ANA, { guid: 'r1', phase: 'relearning', interval: 1, lapses: 2, reps: 9 });
    await card(db, ANA, { guid: 'y1', interval: 5, lapses: 2, reps: 4 });
    await card(db, ANA, { guid: 'm1', interval: 30, lapses: 5 });
    await card(db, ANA, { guid: 'm2', interval: 21, dueDays: -2 });
    await card(db, ANA, { guid: 's1', suspended: true, lapses: 1 });
    await card(db, ANA, { guid: 'n1', phase: 'new', suspended: true });
    await card(db, ANA, { guid: 'b1', buried: true });
    await card(db, ANA, { guid: 'n2', phase: 'new' });
    await card(db, ANA, { guid: 't1', retired: true, lapses: 9 });
    await card(db, ANA, { guid: 'o1', deck: OTHER, interval: 40, lapses: 1 });
    await card(db, BETO, { guid: 'x1', interval: 40, lapses: 7 });

    await answer(db, ANA, { guid: 'n2', queue: 'new', rating: 3, ms: 4000 });
    await answer(db, ANA, { guid: 'l1', queue: 'learn', rating: 1 });
    await answer(db, ANA, { guid: 'y1', queue: 'review', rating: 3, last: 4 });
    await answer(db, ANA, { guid: 'y1', queue: 'review', rating: 1, last: 4 });
    await answer(db, ANA, { guid: 'm1', queue: 'review', rating: 4, last: 25 });
    await answer(db, ANA, { guid: 'm1', queue: 'review', rating: 1, last: 25, daysAgo: 2 });
    await answer(db, ANA, { guid: 'o1', queue: 'review', rating: 3, last: 30, deck: OTHER });
    await answer(db, ANA, { guid: 'old', queue: 'review', rating: 3, last: 30, daysAgo: 400 });
    await answer(db, BETO, { guid: 'x1', queue: 'review', rating: 1, last: 30 });
  });

  it('counts the cards by state, as Anki: suspended and buried apart, new and taken out not', async () => {
    const r = await asUser(db, ANA, (tx) => stats(tx, [DECK]));
    // learning, relearning, young, mature, suspended, buried
    expect(r.cards).toEqual([1, 1, 1, 2, 2, 1]);
    const all = await asUser(db, ANA, (tx) => stats(tx));
    expect(all.cards).toEqual([1, 1, 1, 3, 2, 1]);
  });

  it('gives the last year’s answers by day, with reviews passed and failed, young and mature', async () => {
    const r = await asUser(db, ANA, (tx) => stats(tx, [DECK]));
    const today = r.today;
    const twoAgo = (
      await db.query<{ d: string }>(`select (public.study_day_of($1, now()) - 2)::text as d`, [
        ANA.sub,
      ])
    ).rows[0]!.d;
    // [day, answers, new, learning, ms, young passed, young failed, mature passed, mature failed]
    expect(r.days).toEqual([
      [twoAgo, 1, 0, 0, 1000, 0, 0, 0, 1],
      [today, 5, 1, 1, 8000, 1, 1, 1, 0],
    ]);
    expect(r.total).toEqual([7, 10000, 3]);
  });

  it('counts as reviews, as Anki’s «True retention», the (re)learning steps of a day or more', async () => {
    const fresh = await usersDatabaseWith([ANA]);
    await answer(fresh, ANA, { guid: 'd1', queue: 'day_learn', rating: 3, last: 1 });
    await answer(fresh, ANA, { guid: 'd2', queue: 'learn', rating: 1, last: -86400 });
    await answer(fresh, ANA, { guid: 'd3', queue: 'learn', rating: 1, last: -600 });
    await answer(fresh, ANA, { guid: 'd4', queue: 'day_learn', rating: 4, last: 30 });
    await answer(fresh, ANA, { guid: 'd5', queue: 'new', rating: 3, last: 0 });
    const r = await asUser(fresh, ANA, (tx) => stats(tx));
    // [day, answers, new, learning, ms, young passed, young failed, mature passed, mature failed]
    expect(r.days).toEqual([[r.today, 5, 1, 4, 5000, 1, 1, 1, 0]]);
  });

  it('gives what is due in the next 30 days and what is overdue', async () => {
    const r = await asUser(db, ANA, (tx) => stats(tx, [DECK]));
    const inThree = (
      await db.query<{ d: string }>(`select (public.study_day_of($1, now()) + 3)::text as d`, [
        ANA.sub,
      ])
    ).rows[0]!.d;
    expect(r.due).toEqual([[inThree, 3]]);
    expect(r.overdue).toBe(1);
  });

  it('lists the cards forgotten most often, not taken out, at most 10', async () => {
    const r = await asUser(db, ANA, (tx) => stats(tx, [DECK]));
    expect(r.hardest).toEqual([
      ['m1', 0, DECK, 5, 1],
      ['r1', 0, DECK, 2, 9],
      ['y1', 0, DECK, 2, 4],
      ['s1', 0, DECK, 1, 1],
    ]);
    const many = await usersDatabaseWith([ANA]);
    for (let i = 0; i < 12; i++) await card(many, ANA, { guid: `h${i}`, lapses: i + 1 });
    const top = await asUser(many, ANA, (tx) => stats(tx));
    expect(top.hardest.map((h) => h[0])).toEqual([
      'h11',
      'h10',
      'h9',
      'h8',
      'h7',
      'h6',
      'h5',
      'h4',
      'h3',
      'h2',
    ]);
  });

  it('each one reads only their own; anon and somebody not invited, nothing', async () => {
    const beto = await asUser(db, BETO, (tx) => stats(tx));
    expect(beto.cards).toEqual([0, 0, 0, 1, 0, 0]);
    expect(beto.hardest.map((h) => h[0])).toEqual(['x1']);
    expect(beto.total[0]).toBe(1);
    const empty = await asUser(db, BETO, (tx) => stats(tx, ['999']));
    expect(empty).toMatchObject({ days: [], due: [], hardest: [], overdue: 0, total: [0, 0, 0] });
    await expect(asUser(db, null, (tx) => stats(tx))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, OUTSIDER, (tx) => stats(tx))).rejects.toThrow(/not_allowed/);
    await expect(
      asUser(db, ANA, (tx) =>
        stats(
          tx,
          Array.from({ length: 5001 }, (_, i) => String(i)),
        ),
      ),
    ).rejects.toThrow(/too_large/);
  });

  it('a zone Postgres does not know counts as Santiago’s', async () => {
    const db = await usersDatabaseWith([ANA]);
    await db.query(
      `insert into public.study_preferences (user_id, time_zone, day_starts_at) values ($1, 'Mars/Olympus', 4)`,
      [ANA.sub],
    );
    const r = await asUser(db, ANA, (tx) => stats(tx));
    expect(r.today).toBe(
      (
        await db.query<{ d: string }>(
          `select (((now() at time zone 'America/Santiago') - interval '4 hours')::date)::text as d`,
        )
      ).rows[0]!.d,
    );
  });
});
