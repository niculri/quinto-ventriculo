// Plan step 1.1: the light history (20261106000000_light_history.sql). The log without the card before and
// after, undo for 48 hours in review_undo, the student's day in each row and the day's sums in study_days.
import type { PGlite } from '@electric-sql/pglite';
import { dayOf } from '@qv/srs';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigration, asUser, createDatabase } from './pglite';

const MIGRATION = '20261106000000_light_history.sql';
const ANA = { sub: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' };
const BETO = { sub: '00000000-0000-4000-8000-00000000000b', email: 'beto@ug.uchile.cl' };
const DECK = '2059400110';

const call = (fn: string, args: unknown[]) =>
  `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`;

/** An answer as the web sends it (a new card answered «Bien»: to its 10-minute step). */
function answer(noteGuid: string, extra: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    noteGuid,
    ord: 0,
    deckId: DECK,
    expectedUpdatedAt: null,
    rating: 3,
    queueBefore: 'new',
    interval: -600,
    lastInterval: 0,
    durationMs: 4200,
    state: {
      phase: 'learning',
      interday: false,
      remainingSteps: 1,
      due: new Date(now.getTime() + 600_000).toISOString(),
      interval: 0,
      stability: 2.3065,
      difficulty: 2.118,
      reps: 1,
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
  for (const u of [ANA, BETO]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u.sub, u.email]);
  }
  return db;
}

describe('the migration, on a database with history', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await createDatabase('users', [], MIGRATION);
    await db.query('update public.access_settings set open_to_domain = true');
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [ANA.sub, ANA.email]);
    // Ana studies in Madrid with the day starting at midnight: her rows' days are not Santiago's.
    await db.query(
      `insert into public.study_preferences (user_id, time_zone, day_starts_at) values ($1, 'Europe/Madrid', 0)`,
      [ANA.sub],
    );
    const state = (stability: number) => ({ stability, difficulty: 5, phase: 'learning' });
    const old = '2026-11-01T22:30:00Z'; // 23:30 in Madrid: 1-11; in Santiago at 4:00, 1-11 too
    const lateNight = '2026-11-02T23:30:00Z'; // 00:30 in Madrid: already 3-11
    const recent = new Date(Date.now() - 3600_000).toISOString();
    const rows: [string, string, number | null, string | null, unknown, number | null][] = [
      ['a1', old, 3, 'new', null, 4000],
      ['a2', lateNight, 1, 'new', null, 6000],
      ['a2', recent, 3, 'learn', { phase: 'learning', note_guid: 'a2' }, 2000],
      ['a3', recent, null, null, null, null],
    ];
    for (const [guid, at, rating, queue, before, ms] of rows) {
      await db.query(
        `insert into public.review_log (user_id, action_id, action, note_guid, ord, deck_id, reviewed_at, rating,
           queue_before, phase_before, phase_after, state_before, state_after, duration_ms)
         values ($1, gen_random_uuid(), $2, $3, 0, $4, $5, $6, $7, 'new', 'learning', $8, $9, $10)`,
        [
          ANA.sub,
          rating === null ? 'flag' : 'answer',
          guid,
          DECK,
          at,
          rating,
          queue,
          before,
          state(rating === 1 ? 0.2 : 2.3),
          ms,
        ],
      );
    }
    await applyMigration(db, 'users', MIGRATION);
  });

  it('keeps the stability and difficulty, and each row gets the student’s day', async () => {
    const r = await db.query<{ note_guid: string; day: string; stability_after: number }>(
      `select note_guid, study_day::text as day, stability_after from public.review_log order by id`,
    );
    expect(r.rows.map((x) => [x.note_guid, x.day])).toEqual([
      ['a1', '2026-11-01'],
      ['a2', '2026-11-03'],
      ['a2', expect.stringMatching(/^\d{4}-\d\d-\d\d$/)],
      ['a3', expect.stringMatching(/^\d{4}-\d\d-\d\d$/)],
    ]);
    expect(r.rows[0]!.stability_after).toBeCloseTo(2.3);
    expect(r.rows[1]!.stability_after).toBeCloseTo(0.2);
  });

  it('keeps undo only for the last 48 hours, and the log loses the cards before and after', async () => {
    const undo = await db.query<{ n: number }>(`select count(*)::int as n from public.review_undo`);
    expect(undo.rows[0]!.n).toBe(2);
    const columns = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'review_log'`,
    );
    const names = columns.rows.map((c) => c.column_name);
    expect(names).not.toContain('state_before');
    expect(names).not.toContain('state_after');
    expect(names).not.toContain('action_id');
  });

  it('sums the answers each day, by deck', async () => {
    const r = await db.query(
      `select day::text, answers, new_seen, failed, ms::int from public.study_days order by day`,
    );
    expect(r.rows.slice(0, 2)).toEqual([
      { day: '2026-11-01', answers: 1, new_seen: 1, failed: 0, ms: 4000 },
      { day: '2026-11-03', answers: 1, new_seen: 1, failed: 1, ms: 6000 },
    ]);
    // The flag is not an answer: three answers in all.
    const total = await db.query<{ n: number }>(
      `select sum(answers)::int as n from public.study_days`,
    );
    expect(total.rows[0]!.n).toBe(3);
  });
});

describe('the migration, on a database where someone answered with the old functions', () => {
  // As production: the log rows were written by the old record_review (the whole card before and after).
  let db: PGlite;
  beforeAll(async () => {
    db = await createDatabase('users', [], MIGRATION);
    await db.query('update public.access_settings set open_to_domain = true');
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [ANA.sub, ANA.email]);
    await asUser(db, ANA, async (tx) => {
      await tx.query(call('record_review', [0]), [answer('m1', { durationMs: 3000 })]);
      const updated = await tx.query<{ updated_at: string }>(
        `select updated_at from public.card_states where note_guid = 'm1'`,
      );
      await tx.query(call('record_review', [0]), [
        answer('m1', {
          expectedUpdatedAt: updated.rows[0]!.updated_at,
          rating: 1,
          queueBefore: 'learn',
          durationMs: 5000,
          bury: [{ noteGuid: 'm1', ord: 1, deckId: DECK }],
          buriedUntil: new Date(Date.now() + 8 * 3600_000).toISOString(),
        }),
      ]);
    });
    await applyMigration(db, 'users', MIGRATION);
  });

  it('undo still works on the old answers, and takes them away from their day', async () => {
    const r = await asUser(db, ANA, async (tx) => {
      const days = async () =>
        (
          await tx.query<{ answers: number; new_seen: number; failed: number; ms: number }>(
            `select answers, new_seen, failed, ms::int from public.study_days`,
          )
        ).rows;
      const before = await days();
      const undone = await tx.query<{ r: { rating: number; noteGuid: string } }>(
        call('undo_last_review', []),
      );
      const cards = await tx.query<{ ord: number; reps: number; buried: boolean }>(
        `select ord, reps, buried_until is not null as buried from public.card_states order by ord`,
      );
      const middle = await days();
      await tx.query(call('undo_last_review', []));
      const left = await tx.query<{ n: number }>(
        `select (select count(*) from public.card_states) + (select count(*) from public.review_log)
              + (select count(*) from public.review_undo) as n`,
      );
      return {
        before,
        undone: undone.rows[0]!.r,
        cards: cards.rows,
        middle,
        after: await days(),
        left,
      };
    });
    expect(r.before).toEqual([{ answers: 2, new_seen: 1, failed: 1, ms: 8000 }]);
    expect(r.undone).toMatchObject({ rating: 1, noteGuid: 'm1' });
    // The answered card goes back to its first answer, and the sibling it buried (new) stops existing.
    expect(r.cards).toEqual([{ ord: 0, reps: 1, buried: false }]);
    expect(r.middle).toEqual([{ answers: 1, new_seen: 1, failed: 0, ms: 3000 }]);
    expect(r.after).toEqual([]);
    expect(Number(r.left.rows[0]!.n)).toBe(0);
  });
});

describe('answers, undo and the day’s sums', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await newDatabase();
  });

  it('an answer adds to its day, with its recall and version; undo takes it away', async () => {
    const r = await asUser(db, ANA, async (tx) => {
      await tx.query(call('record_review', [0]), [
        answer('n1', { rBefore: 0.87, cardVersion: 3, rating: 1 }),
      ]);
      const log = await tx.query<{ r_before: number; card_version: number; study_day: string }>(
        `select r_before, card_version, study_day::text from public.review_log`,
      );
      const days = await tx.query(
        `select answers, new_seen, failed, ms::int from public.study_days`,
      );
      await tx.query(call('undo_last_review', []));
      const after = await tx.query(`select * from public.study_days`);
      return { log: log.rows, days: days.rows, after: after.rows };
    });
    expect(r.log[0]!.r_before).toBeCloseTo(0.87);
    expect(r.log[0]!.card_version).toBe(3);
    expect(r.days).toEqual([{ answers: 1, new_seen: 1, failed: 1, ms: 4200 }]);
    expect(r.after).toEqual([]);
  });

  it('a recall or version out of range is left out, not refused', async () => {
    const r = await asUser(db, ANA, async (tx) => {
      await tx.query(call('record_review', [0]), [answer('n2', { rBefore: 7, cardVersion: 'x' })]);
      return tx.query(
        `select r_before, card_version from public.review_log where note_guid = 'n2'`,
      );
    });
    expect(r.rows).toEqual([{ r_before: null, card_version: null }]);
  });

  it('undo reaches 48 hours back, not more', async () => {
    await asUser(db, ANA, (tx) => tx.query(call('record_review', [0]), [answer('n3')]));
    // The undo rows aged 49 hours: undo finds nothing, and the card and the log stay.
    await db.query(`update public.review_undo set created_at = now() - interval '49 hours'`);
    const r = await asUser(db, ANA, async (tx) => {
      const undone = await tx.query<{ r: unknown }>(call('undo_last_review', []));
      const card = await tx.query(`select 1 from public.card_states where note_guid = 'n3'`);
      const undo = await tx.query<{ n: number }>(
        `select count(*)::int as n from public.review_undo`,
      );
      return { undone: undone.rows[0]!.r, card: card.rows.length, undo: undo.rows[0]!.n };
    });
    expect(r).toEqual({ undone: null, card: 1, undo: 0 });
  });

  it('nobody writes the day’s sums, and each one reads only their own', async () => {
    await asUser(db, BETO, (tx) => tx.query(call('record_review', [0]), [answer('b1')]));
    const seen = await asUser(db, BETO, (tx) =>
      tx.query<{ user_id: string }>(`select user_id from public.study_days`),
    );
    expect(new Set(seen.rows.map((r) => r.user_id))).toEqual(new Set([BETO.sub]));
    await expect(
      asUser(db, BETO, (tx) =>
        tx.query(
          `insert into public.study_days (user_id, day, deck_id, answers) values ($1, now(), $2, 999)`,
          [BETO.sub, DECK],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, BETO, (tx) => tx.query(`update public.study_days set answers = 999`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('the undo rows and the sums: each one only their own, anon nothing, nobody truncates', async () => {
    await asUser(db, ANA, (tx) => tx.query(call('record_review', [0]), [answer('n4')]));
    await asUser(db, BETO, (tx) => tx.query(call('record_review', [0]), [answer('b2')]));
    // Both have rows of both tables (so that seeing only one’s own means something).
    const owners = await db.query<{ n: number }>(
      `select count(distinct user_id)::int as n from (
         select user_id from public.review_undo union all select user_id from public.study_days) t`,
    );
    expect(owners.rows[0]!.n).toBe(2);
    const seen = await asUser(db, BETO, async (tx) => {
      const undo = await tx.query<{ user_id: string }>(`select user_id from public.review_undo`);
      return { undo: undo.rows.map((r) => r.user_id) };
    });
    expect(new Set(seen.undo)).toEqual(new Set([BETO.sub]));
    for (const sql of ['select * from public.review_undo', 'select * from public.study_days']) {
      await expect(asUser(db, null, (tx) => tx.query(sql))).rejects.toThrow(/permission denied/);
    }
    for (const sql of [
      'delete from public.study_days',
      'truncate public.study_days',
      'truncate public.review_undo',
      'update public.review_undo set state_before = null',
      // Since plan step 1.2, undo rows are written only through the functions.
      `delete from public.review_undo where user_id = '${ANA.sub}'`,
    ]) {
      await expect(asUser(db, BETO, (tx) => tx.query(sql))).rejects.toThrow(/permission denied/);
    }
  });
});

describe('the browser’s actions, with the light log', () => {
  it('«Olvidar» and a flag on several cards are undone whole, and do not count as answers', async () => {
    const db = await newDatabase();
    const ref = (noteGuid: string) => ({ noteGuid, ord: 0, deckId: DECK });
    const r = await asUser(db, ANA, async (tx) => {
      await tx.query(call('record_review', [0]), [answer('f1')]);
      await tx.query(call('record_review', [0]), [answer('f2', { rating: 1 })]);
      const cards = async () =>
        (
          await tx.query<{ note_guid: string; phase: string; stability: number; flag: number }>(
            `select note_guid, phase, stability, flag from public.card_states order by note_guid`,
          )
        ).rows;
      const days = async () =>
        (await tx.query(`select answers, new_seen, failed, ms::int from public.study_days`)).rows;
      const before = await cards();
      const daysBefore = await days();
      const forgot = await tx.query<{ r: number }>(call('forget_cards', [0, 1]), [
        [ref('f1'), ref('f2')],
        true,
      ]);
      const forgotten = await cards();
      // A flag on one card with a row and one without (a new card): one action of two rows.
      await tx.query(call('set_flags', [0, 1]), [[ref('f1'), ref('f3')], 3]);
      const flagged = await cards();
      const undoFlag = await tx.query<{ r: { action: string } }>(call('undo_last_review', []));
      const afterFlag = await cards();
      const undoForget = await tx.query<{ r: { action: string } }>(call('undo_last_review', []));
      return {
        before,
        daysBefore,
        forgot: forgot.rows[0]!.r,
        forgotten: forgotten.map((c) => c.phase),
        flagged: flagged.map((c) => [c.note_guid, c.flag]),
        undoFlag: undoFlag.rows[0]!.r.action,
        afterFlag,
        undoForget: undoForget.rows[0]!.r.action,
        after: await cards(),
        daysAfter: await days(),
      };
    });
    expect(r.forgot).toBe(2);
    expect(r.forgotten).toEqual(['new', 'new']);
    expect(r.flagged).toEqual([
      ['f1', 3],
      ['f2', 0],
      ['f3', 3],
    ]);
    expect(r.undoFlag).toBe('flag');
    expect(r.afterFlag.map((c) => [c.note_guid, c.phase])).toEqual([
      ['f1', 'new'],
      ['f2', 'new'],
    ]);
    expect(r.undoForget).toBe('forget');
    expect(r.after).toEqual(r.before);
    expect(r.daysAfter).toEqual(r.daysBefore);
    expect(r.daysBefore).toEqual([{ answers: 2, new_seen: 2, failed: 1, ms: 8400 }]);
  });
});

describe('deleting an account', () => {
  it('deletes its history and its sums (the triggers do not get in the way)', async () => {
    const db = await newDatabase();
    for (const user of [ANA, BETO]) {
      await asUser(db, user, async (tx) => {
        await tx.query(call('record_review', [0]), [answer('d1')]);
        await tx.query(call('record_review', [0]), [
          answer('d2', { rating: 1, bury: [{ noteGuid: 'd2', ord: 1, deckId: DECK }] }),
        ]);
      });
    }
    await db.query(`delete from auth.users where id = $1`, [ANA.sub]);
    const left = await db.query<{ t: string; user_id: string }>(
      `select 'log' as t, user_id from public.review_log
       union all select 'undo', user_id from public.review_undo
       union all select 'days', user_id from public.study_days`,
    );
    expect(new Set(left.rows.map((r) => r.user_id))).toEqual(new Set([BETO.sub]));
    expect(left.rows.filter((r) => r.t === 'days')).toHaveLength(1);
  });
});

describe('a time zone Postgres does not know', () => {
  it('counts as Santiago’s: the answer is saved, never refused', async () => {
    const db = await newDatabase();
    await db.query(
      `insert into public.study_preferences (user_id, time_zone, day_starts_at) values ($1, 'Etc/Unknown', 0)`,
      [ANA.sub],
    );
    await asUser(db, ANA, (tx) => tx.query(call('record_review', [0]), [answer('z1')]));
    const r = await db.query<{ ok: boolean }>(
      `select study_day = (reviewed_at at time zone 'America/Santiago')::date as ok from public.review_log`,
    );
    expect(r.rows).toEqual([{ ok: true }]);
  });
});

describe('an undo row of someone else', () => {
  it('cannot hang from another student’s answer', async () => {
    const db = await newDatabase();
    await asUser(db, BETO, (tx) => tx.query(call('record_review', [0]), [answer('b1')]));
    const beto = await db.query<{ id: number }>(`select id from public.review_log`);
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(
          `insert into public.review_undo (log_id, action_id, state_before) values ($1, gen_random_uuid(), null)`,
          [beto.rows[0]!.id],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('the student’s day', () => {
  it('is the scheduler’s day (dayOf), also across Chile’s daylight saving changes', async () => {
    const db = await newDatabase();
    // A fixed sequence (a failure is repeated as it was).
    let seed = 20261106;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (const [zone, rollover] of [
      ['America/Santiago', 4],
      ['America/Santiago', 0],
      ['Europe/Madrid', 23],
      // Without preferences: Santiago at 4:00, as the web’s defaults with a Chilean browser.
      [null, 4],
    ] as const) {
      await db.query(`delete from public.study_preferences`);
      if (zone !== null) {
        await db.query(
          `insert into public.study_preferences (user_id, time_zone, day_starts_at) values ($1, $2, $3)`,
          [ANA.sub, zone, rollover],
        );
      }
      // 2,000 moments in 2026–2027, thicker around the changes (April and September in Chile).
      const moments: number[] = [];
      const start = Date.UTC(2026, 0, 1) / 1000;
      for (let i = 0; i < 1400; i++) moments.push(start + Math.floor(random() * 2 * 365 * 86400));
      for (const change of [Date.UTC(2026, 3, 5), Date.UTC(2026, 8, 6), Date.UTC(2027, 3, 4)]) {
        for (let i = 0; i < 200; i++)
          moments.push(change / 1000 - 2 * 86400 + Math.floor(random() * 4 * 86400));
      }
      const r = await db.query<{ d: number }>(
        `select (public.study_day_of($1, to_timestamp(m)) - date '1970-01-01') as d
           from unnest($2::bigint[]) with ordinality as t(m, i) order by i`,
        [ANA.sub, moments],
      );
      const sql = r.rows.map((x) => x.d);
      const mismatches = moments.filter(
        (m, i) => sql[i] !== dayOf(m, zone ?? 'America/Santiago', rollover),
      );
      expect(mismatches, `${zone}, ${rollover}:00`).toEqual([]);
    }
  });
});

describe('the weight of an answer', () => {
  // Was ~1,500 bytes. The plan aimed at 250 assuming the phases and the queue as numeric codes; as text they cost
  // ~12 bytes more (≈2 GB a year with 5,000 students), not worth changing every function and the web for.
  it('is at most 270 bytes in the log, with its index (262 measured)', async () => {
    const db = await newDatabase();
    // 5,000 answers as the site writes them (guid of 10 characters, a deck id of 10 digits).
    await db.query(
      `insert into public.review_log (user_id, action, note_guid, ord, deck_id, reviewed_at, rating, queue_before,
         phase_before, phase_after, interval, last_interval, duration_ms, stability_after, difficulty_after,
         r_before, card_version)
       select $1, 'answer', substr(md5(i::text), 1, 10), i % 3, '1737116544', now() - i * interval '1 minute', 3,
              'review', 'review', 'review', 12, 5, 8000, 12.5, 5.1, 0.9, 2
         from generate_series(1, 5000) i`,
      [ANA.sub],
    );
    await db.exec('vacuum analyze public.review_log');
    const r = await db.query<{ bytes: number }>(
      `select (pg_relation_size('public.review_log') + pg_indexes_size('public.review_log'))::float8 / 5000
         as bytes`,
    );
    expect(r.rows[0]!.bytes).toBeLessThanOrEqual(270);
  });
});
