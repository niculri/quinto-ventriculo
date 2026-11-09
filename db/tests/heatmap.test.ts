// Plan step 3.1: the heatmap (20261121000000_study_heatmap.sql). study_heatmap() reads the caller's days and what is
// due from today on; record_practice() adds practice that does not change dates to the caller's day, with caps.
import type { PGlite } from '@electric-sql/pglite';
import { dayOf, dayOfStart } from '@qv/srs';
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './pglite';

const ANA = { sub: '00000000-0000-4000-8000-00000000003a', email: 'ana@ug.uchile.cl' };
const BETO = { sub: '00000000-0000-4000-8000-00000000003b', email: 'beto@ug.uchile.cl' };
const OUTSIDER = { sub: '00000000-0000-4000-8000-00000000003c', email: 'otro@gmail.com' };
const DECK = '2059400110';
const OTHER_DECK = '2059400111';

type Q = Pick<PGlite, 'query'>;
type Heatmap = { days: [string, string, number, number][]; due: [string, number][] };

const heatmap = async (tx: Q, decks: string[] | null = null) =>
  (
    await tx.query<{ r: Heatmap }>(
      decks === null
        ? 'select public.study_heatmap() as r'
        : 'select public.study_heatmap($1) as r',
      decks === null ? [] : [decks],
    )
  ).rows[0]!.r;
const practice = (tx: Q, decks: { deckId: string; n: number }[]) =>
  tx.query<{ r: { day: string; practice: number } }>('select public.record_practice($1) as r', [
    { decks },
  ]);

/** An answer as the web sends it: a review card, answered «Bien», due in `days`. */
function answer(noteGuid: string, extra: Record<string, unknown> = {}, days = 3) {
  const now = new Date();
  return {
    noteGuid,
    ord: 0,
    deckId: DECK,
    expectedUpdatedAt: null,
    rating: 3,
    queueBefore: 'review',
    interval: days,
    lastInterval: 1,
    durationMs: 5000,
    state: {
      phase: 'review',
      interday: true,
      remainingSteps: 0,
      due: new Date(now.getTime() + days * 86_400_000).toISOString(),
      interval: days,
      stability: 4,
      difficulty: 5,
      reps: 2,
      lapses: 0,
      lastReview: now.toISOString(),
      suspended: false,
      leech: false,
    },
    bury: [],
    buriedUntil: null,
    ...extra,
  };
}

async function newDatabase() {
  const db = await createDatabase('users');
  await db.query('update public.access_settings set open_to_domain = true');
  for (const u of [ANA, BETO, OUTSIDER]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u.sub, u.email]);
  }
  return db;
}

const today = async (db: PGlite, user: { sub: string }) =>
  (await db.query<{ d: string }>(`select public.study_day_of($1, now())::text as d`, [user.sub]))
    .rows[0]!.d;

describe('reading the heatmap', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await newDatabase();
  });

  it('an answer adds to today and its undo takes it away, the same day', async () => {
    const r = await asUser(db, ANA, async (tx) => {
      await tx.query('select public.record_review($1)', [answer('h1')]);
      const after = await heatmap(tx);
      await tx.query('select public.undo_last_review()');
      return { after, undone: await heatmap(tx) };
    });
    const day = await today(db, ANA);
    expect(r.after.days).toEqual([[day, DECK, 1, 0]]);
    expect(r.undone.days).toEqual([]);
    // The card answered goes back to new: nothing due either.
    expect(r.undone.due).toEqual([]);
  });

  it('what is due: reviews from today on, not new, suspended, buried, taken out or overdue', async () => {
    const db = await newDatabase();
    await asUser(db, ANA, async (tx) => {
      await tx.query('select public.record_review($1)', [answer('d1', {}, 3)]);
      await tx.query('select public.record_review($1)', [answer('d2', {}, 3)]);
      await tx.query('select public.record_review($1)', [answer('d3', { deckId: OTHER_DECK }, 10)]);
      for (const g of ['d4', 'd5', 'd6', 'd7']) {
        await tx.query('select public.record_review($1)', [answer(g, {}, 5)]);
      }
    });
    // Each due as the scheduler stores it: the start of its day (4:00 in Santiago, without preferences).
    await db.query(
      `update public.card_states
          set due = ((public.study_day_of(user_id, now()) + interval * '1 day'::interval) + interval '4 hours')
                    at time zone 'America/Santiago'`,
    );
    // d4 suspended, d5 buried, d6 taken out of the site, d7 overdue (due two days ago).
    await db.query(`update public.card_states set suspended = true where note_guid = 'd4'`);
    await db.query(
      `update public.card_states set buried_until = now() + interval '1 day' where note_guid = 'd5'`,
    );
    await db.query(`update public.card_states set retired_at = now() where note_guid = 'd6'`);
    await db.query(
      `update public.card_states set due = due - interval '7 days' where note_guid = 'd7'`,
    );
    const { all, one } = await asUser(db, ANA, async (tx) => ({
      all: await heatmap(tx),
      one: await heatmap(tx, [OTHER_DECK]),
    }));
    const dayIn = async (days: number) =>
      (
        await db.query<{ d: string }>(
          `select (public.study_day_of($1, now()) + $2::int)::text as d`,
          [ANA.sub, days],
        )
      ).rows[0]!.d;
    expect(all.due).toEqual([
      [await dayIn(3), 2],
      [await dayIn(10), 1],
    ]);
    expect(one.due).toEqual([[await dayIn(10), 1]]);
    // The days of only that deck too.
    expect(one.days).toEqual([[await today(db, ANA), OTHER_DECK, 1, 0]]);
    expect(all.days.map((d) => [d[1], d[2]])).toEqual([
      [DECK, 6],
      [OTHER_DECK, 1],
    ]);
  });

  it('each one reads only their own; anon and somebody not invited, nothing', async () => {
    await asUser(db, BETO, (tx) => tx.query('select public.record_review($1)', [answer('b1')]));
    await asUser(db, ANA, (tx) => tx.query('select public.record_review($1)', [answer('a9')]));
    const ana = await asUser(db, ANA, (tx) => heatmap(tx));
    const beto = await asUser(db, BETO, (tx) => heatmap(tx));
    expect(ana.days.map((d) => d[2])).toEqual([1]);
    expect(beto.days.map((d) => d[2])).toEqual([1]);
    await expect(asUser(db, null, (tx) => heatmap(tx))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, OUTSIDER, (tx) => heatmap(tx))).rejects.toThrow(/not_allowed/);
    await expect(
      asUser(db, ANA, (tx) =>
        heatmap(
          tx,
          Array.from({ length: 5001 }, (_, i) => String(i)),
        ),
      ),
    ).rejects.toThrow(/too_large/);
  });

  it('nobody writes study_days directly, not even its practice', async () => {
    for (const sql of [
      `insert into public.study_days (user_id, day, deck_id, practice) values ('${ANA.sub}', now(), '${DECK}', 9)`,
      `update public.study_days set practice = 999`,
      `delete from public.study_days`,
    ]) {
      await expect(asUser(db, ANA, (tx) => tx.query(sql))).rejects.toThrow(/permission denied/);
    }
  });

  it('a day answered before the rollover is yesterday’s, and after it, today’s', async () => {
    const db = await newDatabase();
    // Santiago, the day starting at 4:00. 3:59 and 4:01 of 3-11-2026 (UTC−3) are two different days.
    await db.query(
      `insert into public.study_preferences (user_id, time_zone, day_starts_at) values ($1, 'America/Santiago', 4)`,
      [ANA.sub],
    );
    for (const [guid, at] of [
      ['r1', '2026-11-03T06:59:00Z'],
      ['r2', '2026-11-03T07:01:00Z'],
    ] as const) {
      await db.query(
        `insert into public.review_log (user_id, action, note_guid, ord, deck_id, reviewed_at, rating, queue_before,
           phase_before, phase_after)
         values ($1, 'answer', $2, 0, $3, $4, 3, 'review', 'review', 'review')`,
        [ANA.sub, guid, DECK, at],
      );
    }
    const r = await asUser(db, ANA, (tx) => heatmap(tx));
    expect(r.days).toEqual([
      ['2026-11-02', DECK, 1, 0],
      ['2026-11-03', DECK, 1, 0],
    ]);
  });
});

describe('practice that does not change dates', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await newDatabase();
  });

  it('adds to the caller’s day, by deck, and touches neither card_states nor review_log', async () => {
    const r = await asUser(db, ANA, async (tx) => {
      await tx.query('select public.record_review($1)', [answer('p1')]);
      const before = await tx.query(
        `select (select count(*) from public.card_states) as cards, (select count(*) from public.review_log) as log,
                (select max(updated_at) from public.card_states) as updated`,
      );
      const first = await practice(tx, [
        { deckId: DECK, n: 3 },
        { deckId: OTHER_DECK, n: 2 },
        { deckId: DECK, n: 1 },
      ]);
      await practice(tx, [{ deckId: OTHER_DECK, n: 5 }]);
      const after = await tx.query(
        `select (select count(*) from public.card_states) as cards, (select count(*) from public.review_log) as log,
                (select max(updated_at) from public.card_states) as updated`,
      );
      return {
        first: first.rows[0]!.r,
        before: before.rows,
        after: after.rows,
        map: await heatmap(tx),
      };
    });
    const day = await today(db, ANA);
    expect(r.first).toEqual({ day, practice: 6, capped: false });
    expect(r.after).toEqual(r.before);
    expect(r.map.days).toEqual([
      [day, DECK, 1, 4],
      [day, OTHER_DECK, 0, 7],
    ]);
  });

  it('undoing an answer keeps the day’s practice', async () => {
    const r = await asUser(db, ANA, async (tx) => {
      await tx.query('select public.undo_last_review()');
      return heatmap(tx);
    });
    const day = await today(db, ANA);
    expect(r.days).toEqual([
      [day, DECK, 0, 4],
      [day, OTHER_DECK, 0, 7],
    ]);
  });

  it('a day with only practice is a day with something studied', async () => {
    const r = await asUser(db, BETO, async (tx) => {
      await practice(tx, [{ deckId: DECK, n: 1 }]);
      return heatmap(tx);
    });
    expect(r.days).toEqual([[await today(db, BETO), DECK, 0, 1]]);
  });

  it('refuses what is not a batch of practice', async () => {
    for (const bad of [
      [{ deckId: 'x1', n: 1 }],
      [{ deckId: DECK, n: 0 }],
      [{ deckId: DECK, n: -4 }],
      [{ deckId: DECK, n: 1.5 }],
      [{ deckId: DECK, n: '3' }],
      [{ deckId: 12345, n: 3 }],
    ]) {
      await expect(asUser(db, ANA, (tx) => practice(tx, bad as never))).rejects.toThrow(
        /invalid_practice/,
      );
    }
    await expect(
      asUser(db, ANA, (tx) => tx.query(`select public.record_practice('[1]'::jsonb)`)),
    ).rejects.toThrow(/invalid_practice/);
  });

  it('caps: 100 decks and 1,000 answers a batch, 50,000 changes a day', async () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ deckId: String(1000 + i), n: 1 }));
    await expect(asUser(db, ANA, (tx) => practice(tx, many))).rejects.toThrow(/too_large/);
    await expect(
      asUser(db, ANA, (tx) =>
        practice(tx, [
          { deckId: DECK, n: 600 },
          { deckId: OTHER_DECK, n: 401 },
        ]),
      ),
    ).rejects.toThrow(/too_large/);
    // The day's changes, shared with the answers: at the cap, practice is refused and nothing is added.
    await db.query(
      `update public.user_quotas set changes_today = 49999, day = (now() at time zone 'UTC')::date
        where user_id = $1`,
      [ANA.sub],
    );
    const before = await asUser(db, ANA, (tx) => heatmap(tx));
    await expect(asUser(db, ANA, (tx) => practice(tx, [{ deckId: DECK, n: 2 }]))).rejects.toThrow(
      /quota_exceeded/,
    );
    expect(await asUser(db, ANA, (tx) => heatmap(tx))).toEqual(before);
    await asUser(db, ANA, (tx) => practice(tx, [{ deckId: DECK, n: 1 }]));
    await expect(
      asUser(db, ANA, (tx) => tx.query('select public.record_review($1)', [answer('q1')])),
    ).rejects.toThrow(/quota_exceeded/);
  });

  it('at most 5,000 of practice a day for each student: past it, nothing more counts and nothing is refused', async () => {
    const db = await newDatabase();
    const send = (user: typeof ANA, decks: { deckId: string; n: number }[]) =>
      asUser(db, user, async (tx) => (await practice(tx, decks)).rows[0]!.r);
    const changes = async () =>
      (
        await db.query<{ n: number }>(
          `select changes_today as n from public.user_quotas where user_id = $1`,
          [ANA.sub],
        )
      ).rows[0]!.n;
    const day = await today(db, ANA);
    for (let i = 0; i < 4; i++) {
      expect(await send(ANA, [{ deckId: DECK, n: 1000 }])).toEqual({
        day,
        practice: 1000,
        capped: false,
      });
    }
    await send(ANA, [{ deckId: OTHER_DECK, n: 990 }]);
    // 10 of room: the first deck of the batch takes its 6, the next one 4 of its 7.
    expect(
      await send(ANA, [
        { deckId: DECK, n: 6 },
        { deckId: OTHER_DECK, n: 7 },
      ]),
    ).toEqual({ day, practice: 10, capped: true });
    // Full: nothing more counts, and the call does not fail (the final review goes on).
    expect(await send(ANA, [{ deckId: DECK, n: 3 }])).toEqual({ day, practice: 0, capped: true });
    const map = await asUser(db, ANA, (tx) => heatmap(tx));
    expect(map.days).toEqual([
      [day, DECK, 0, 4006],
      [day, OTHER_DECK, 0, 994],
    ]);
    // Only what was counted goes in the day's changes of step 1.2.
    expect(await changes()).toBe(5000);
    // The answers that change dates have no such cap.
    await asUser(db, ANA, (tx) => tx.query('select public.record_review($1)', [answer('c1')]));
    expect(await changes()).toBe(5001);
    // Each student has their own 5,000.
    expect(await send(BETO, [{ deckId: DECK, n: 5 }])).toMatchObject({
      practice: 5,
      capped: false,
    });
    // The student's next day starts again (here, the day studied moves back one).
    await db.query(`update public.study_days set day = day - 1 where user_id = $1`, [ANA.sub]);
    expect(await send(ANA, [{ deckId: DECK, n: 3 }])).toEqual({ day, practice: 3, capped: false });
  });

  it('only for an invited student; anon cannot call it', async () => {
    await expect(
      asUser(db, OUTSIDER, (tx) => practice(tx, [{ deckId: DECK, n: 1 }])),
    ).rejects.toThrow(/not_allowed/);
    await expect(asUser(db, null, (tx) => practice(tx, [{ deckId: DECK, n: 1 }]))).rejects.toThrow(
      /permission denied/,
    );
  });

  it('goes in «Descargar mis datos», and an account deleted leaves none', async () => {
    const db = await newDatabase();
    await asUser(db, ANA, (tx) => practice(tx, [{ deckId: DECK, n: 4 }]));
    await asUser(db, BETO, (tx) => practice(tx, [{ deckId: DECK, n: 2 }]));
    const session = await db.query<{ id: string }>(
      `insert into auth.sessions (user_id) values ($1) returning id`,
      [ANA.sub],
    );
    const exported = await asUser(db, { ...ANA, session_id: session.rows[0]!.id } as never, (tx) =>
      tx.query<{ r: { tables: { study_days: { practice: number; deck_id: string }[] } } }>(
        'select public.export_my_data() as r',
      ),
    );
    expect(exported.rows[0]!.r.tables.study_days).toEqual([
      expect.objectContaining({ deck_id: DECK, practice: 4, answers: 0 }),
    ]);
    await db.query(`delete from auth.users where id = $1`, [ANA.sub]);
    const left = await db.query<{ user_id: string }>(`select user_id from public.study_days`);
    expect(left.rows.map((r) => r.user_id)).toEqual([BETO.sub]);
  });
});

describe('the days of the heatmap', () => {
  it('a due day is the scheduler’s (dayOfStart), and an answer’s day is dayOf’s', async () => {
    const db = await newDatabase();
    let seed = 20261109;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (const [zone, rollover] of [
      ['America/Santiago', 4],
      ['America/Santiago', 0],
      ['Pacific/Easter', 6],
      ['Europe/Madrid', 23],
      [null, 4],
    ] as const) {
      await db.query(`delete from public.study_preferences`);
      if (zone !== null) {
        await db.query(
          `insert into public.study_preferences (user_id, time_zone, day_starts_at) values ($1, $2, $3)`,
          [ANA.sub, zone, rollover],
        );
      }
      // Starts of days as the scheduler stores them (with a few minutes off, and others an hour or two off:
      // the zone changed, the hour moved), around Chile's changes and any day of 2026–2027.
      const moments: number[] = [];
      const start = Date.UTC(2026, 0, 1) / 1000;
      for (let i = 0; i < 1400; i++) moments.push(start + Math.floor(random() * 2 * 365 * 86400));
      for (const change of [Date.UTC(2026, 3, 5), Date.UTC(2026, 8, 6), Date.UTC(2027, 3, 4)]) {
        for (let i = 0; i < 200; i++)
          moments.push(change / 1000 - 2 * 86400 + Math.floor(random() * 4 * 86400));
      }
      const r = await db.query<{ start: number; of: number }>(
        `select (public.study_day_of_start($1, to_timestamp(m)) - date '1970-01-01') as start,
                (public.study_day_of($1, to_timestamp(m)) - date '1970-01-01') as of
           from unnest($2::bigint[]) with ordinality as t(m, i) order by i`,
        [ANA.sub, moments],
      );
      const z = zone ?? 'America/Santiago';
      const wrong = moments.filter(
        (m, i) =>
          r.rows[i]!.start !== dayOfStart(m, z, rollover) ||
          r.rows[i]!.of !== dayOf(m, z, rollover),
      );
      expect(wrong, `${zone}, ${rollover}:00`).toEqual([]);
    }
  });

  it('what study_heatmap() says is due each day is dayOfStart()’s day of each card', async () => {
    const db = await newDatabase();
    let seed = 11092026;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const now = Math.floor(Date.now() / 1000);
    // From a day ago to two years ahead, and around Chile's next changes of the hour.
    const moments: number[] = [];
    for (let i = 0; i < 600; i++)
      moments.push(now - 86400 + Math.floor(random() * 2 * 365 * 86400));
    for (const change of [Date.UTC(2027, 3, 4), Date.UTC(2027, 8, 5), Date.UTC(2028, 3, 2)]) {
      for (let i = 0; i < 100; i++)
        moments.push(change / 1000 - 2 * 86400 + Math.floor(random() * 4 * 86400));
    }
    for (const [zone, rollover] of [
      ['America/Santiago', 4],
      ['Pacific/Easter', 6],
      ['Europe/Madrid', 23],
      [null, 4],
      ['Etc/Unknown', 5],
    ] as const) {
      await db.query(`delete from public.card_states`);
      await db.query(`delete from public.study_preferences`);
      if (zone !== null) {
        await db.query(
          `insert into public.study_preferences (user_id, time_zone, day_starts_at) values ($1, $2, $3)`,
          [ANA.sub, zone, rollover],
        );
      }
      await db.query(
        `insert into public.card_states (user_id, note_guid, ord, deck_id, phase, interday, due, interval,
           stability, difficulty, reps, last_review)
         select $1, 'm' || i, 0, $2, 'review', true, to_timestamp(m), 3, 3, 5, 1, now() - interval '1 day'
           from unnest($3::bigint[]) with ordinality as t(m, i)`,
        [ANA.sub, DECK, moments],
      );
      const map = await asUser(db, ANA, (tx) => heatmap(tx));
      const day = (
        await db.query<{ d: number }>(
          `select public.study_day_of($1, now()) - date '1970-01-01' as d`,
          [ANA.sub],
        )
      ).rows[0]!.d;
      const z = zone === null || zone === 'Etc/Unknown' ? 'America/Santiago' : zone;
      const expected = new Map<number, number>();
      for (const m of moments) {
        const d = dayOfStart(m, z, rollover);
        if (d >= day) expected.set(d, (expected.get(d) ?? 0) + 1);
      }
      const got = new Map(
        map.due.map(([iso, n]) => [Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000), n]),
      );
      expect(got, `${zone}, ${rollover}:00`).toEqual(expected);
    }
  });

  it('a zone Postgres does not know rounds as Santiago’s', async () => {
    const db = await newDatabase();
    await db.query(
      `insert into public.study_preferences (user_id, time_zone, day_starts_at) values ($1, 'Etc/Unknown', 4)`,
      [ANA.sub],
    );
    const r = await db.query<{ d: string }>(
      `select public.study_day_of_start($1, '2026-11-10T07:00:00Z')::text as d`,
      [ANA.sub],
    );
    expect(r.rows[0]!.d).toBe('2026-11-10');
  });

  it('the helper is not for the API', async () => {
    const db = await newDatabase();
    await expect(
      asUser(db, ANA, (tx) => tx.query(`select public.study_day_of_start($1, now())`, [ANA.sub])),
    ).rejects.toThrow(/permission denied/);
  });
});
