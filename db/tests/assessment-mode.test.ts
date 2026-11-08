import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigration, asUser, createDatabase } from './pglite';

const ANA = { sub: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' };
const BETO = { sub: '00000000-0000-4000-8000-00000000000b', email: 'beto@ug.uchile.cl' };
const DECK = '2059400110';
const OTHER = '2059400111';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** The start of the user's day, in the test: an hour ago. */
const dayStart = () => new Date(Date.now() - HOUR);

let db: PGlite;

function answer(
  noteGuid: string,
  over: { deck?: string; queueBefore?: string; at?: Date; state?: object } = {},
) {
  const at = over.at ?? new Date();
  return {
    noteGuid,
    ord: 0,
    deckId: over.deck ?? DECK,
    expectedUpdatedAt: null,
    rating: 3,
    queueBefore: over.queueBefore ?? 'new',
    interval: 2,
    lastInterval: 0,
    durationMs: 4000,
    state: {
      phase: 'review',
      interday: true,
      remainingSteps: 0,
      due: new Date(at.getTime() + 2 * DAY).toISOString(),
      interval: 2,
      stability: 2.3,
      difficulty: 3,
      reps: 1,
      lapses: 0,
      lastReview: at.toISOString(),
      suspended: false,
      leech: false,
      ...over.state,
    },
    bury: [],
    buriedUntil: null,
  };
}

const record = (user: typeof ANA, a: ReturnType<typeof answer>) =>
  asUser(db, user, (tx) => tx.query('select public.record_review($1)', [a]));

const progress = (user: typeof ANA) =>
  asUser(db, user, async (tx) => {
    const r = await tx.query('select * from public.deck_progress($1) order by deck_id', [
      dayStart().toISOString(),
    ]);
    return r.rows as Record<string, unknown>[];
  });

beforeAll(async () => {
  db = await createDatabase('users');
  await db.query('update public.access_settings set open_to_domain = true');
  for (const u of [ANA, BETO]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u.sub, u.email]);
  }
});

describe('the date of a test', () => {
  it('each student has their own; the pace starts as «normal»', async () => {
    await asUser(db, ANA, (tx) =>
      tx.query(
        `insert into public.assessment_settings (deck_id, exam_date, exam_date_set_at) values ($1, '2026-11-20', now())`,
        [DECK],
      ),
    );
    const ana = await asUser(db, ANA, (tx) =>
      tx.query('select exam_date::text as d, final_review_days from public.assessment_settings'),
    );
    expect(ana.rows).toEqual([{ d: '2026-11-20', final_review_days: 3 }]);
    const beto = await asUser(db, BETO, async (tx) => {
      const rows = await tx.query('select * from public.assessment_settings');
      const changed = await tx.query(`update public.assessment_settings set exam_date = null`);
      return { rows: rows.rows, changed: changed.affectedRows };
    });
    expect(beto).toEqual({ rows: [], changed: 0 });
    await expect(
      asUser(db, BETO, (tx) =>
        tx.query(
          `insert into public.assessment_settings (user_id, deck_id, exam_date) values ($1, $2, '2026-11-20')`,
          [ANA.sub, OTHER],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('a date that makes no sense or an unknown number of days is rejected', async () => {
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(`update public.assessment_settings set exam_date = '0020-11-05'`),
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(`update public.assessment_settings set final_review_days = 2`),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it('the migration keeps what students had chosen', async () => {
    const old = await createDatabase('users', [], '20261101000700_assessment_mode.sql');
    await old.query('update public.access_settings set open_to_domain = true');
    await old.query(`insert into auth.users (id, email) values ($1, $2)`, [ANA.sub, ANA.email]);
    await asUser(old, ANA, (tx) =>
      tx.query(
        `insert into public.assessment_settings (deck_id, include_extras, new_per_day) values ($1, true, 35)`,
        [DECK],
      ),
    );
    await applyMigration(old, 'users', '20261101000700_assessment_mode.sql');
    const rows = await asUser(old, ANA, (tx) =>
      tx.query(
        'select include_extras, new_per_day, exam_date, final_review_days from public.assessment_settings',
      ),
    );
    expect(rows.rows).toEqual([
      { include_extras: true, new_per_day: 35, exam_date: null, final_review_days: 3 },
    ]);
    await old.close();
  });
});

describe('deck_progress', () => {
  it('with nothing, nothing', async () => {
    expect(await progress(BETO)).toEqual([]);
  });

  it('counts what was seen, new today and yesterday, only one’s own', async () => {
    await record(ANA, answer('a1'));
    await record(ANA, answer('a2'));
    await record(ANA, answer('y1', { at: new Date(Date.now() - 2 * HOUR) }));
    await record(
      ANA,
      answer('o1', { state: { due: new Date(Date.now() - 3 * DAY).toISOString() } }),
    );
    await record(ANA, answer('b1', { deck: OTHER }));
    // The other student's do not count.
    await record(BETO, answer('a1'));
    expect(await progress(ANA)).toEqual([
      {
        deck_id: DECK,
        seen: 4,
        new_suspended: 0,
        overdue: 1,
        new_today: 3,
        new_yesterday: 1,
      },
      {
        deck_id: OTHER,
        seen: 1,
        new_suspended: 0,
        overdue: 0,
        new_today: 1,
        new_yesterday: 0,
      },
    ]);
  });

  it('a review is not a new card, and a card due today is not late', async () => {
    await record(
      BETO,
      answer('r1', { queueBefore: 'review', state: { due: new Date().toISOString() } }),
    );
    const [row] = await progress(BETO);
    expect(row).toMatchObject({ seen: 2, new_today: 1, overdue: 0 });
  });

  it('a late card that is suspended or buried does not count as late', async () => {
    const state = { due: new Date(Date.now() - 3 * DAY).toISOString() };
    await record(BETO, answer('s1', { state }));
    await record(BETO, answer('s2', { state }));
    await record(BETO, answer('s3', { state }));
    expect((await progress(BETO))[0]).toMatchObject({ overdue: 3 });
    const ref = (g: string) => ({ noteGuid: g, ord: 0, deckId: DECK });
    await asUser(db, BETO, async (tx) => {
      await tx.query('select public.suspend_cards($1, false)', [JSON.stringify([ref('s1')])]);
      await tx.query('select public.bury_cards($1, $2, false)', [
        JSON.stringify([ref('s2')]),
        new Date(Date.now() + DAY).toISOString(),
      ]);
    });
    expect((await progress(BETO))[0]).toMatchObject({ overdue: 1 });
  });

  it('a review its sibling buried for the rest of yesterday is nobody’s delay; one left since then is', async () => {
    const state = { due: new Date(Date.now() - 3 * DAY).toISOString() };
    const student = { sub: '00000000-0000-4000-8000-00000000000c', email: 'carla@ug.uchile.cl' };
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [
      student.sub,
      student.email,
    ]);
    await record(student, answer('z1', { state }));
    await record(student, answer('z2', { state }));
    expect((await progress(student))[0]).toMatchObject({ overdue: 2 });
    const ref = (g: string) => ({ noteGuid: g, ord: 0, deckId: DECK });
    const bury = (g: string, until: Date) =>
      asUser(db, student, (tx) =>
        tx.query('select public.bury_cards($1, $2, false)', [
          JSON.stringify([ref(g)]),
          until.toISOString(),
        ]),
      );
    // Buried until today started: it could not come out yesterday.
    await bury('z1', dayStart());
    expect((await progress(student))[0]).toMatchObject({ overdue: 1 });
    // Buried only until yesterday started: it could.
    await bury('z2', new Date(dayStart().getTime() - DAY));
    expect((await progress(student))[0]).toMatchObject({ overdue: 1 });
    await bury('z1', new Date(dayStart().getTime() - DAY));
    expect((await progress(student))[0]).toMatchObject({ overdue: 2 });
  });

  it('a new card under «No mostrar más» is counted apart', async () => {
    const ref = { noteGuid: 'n1', ord: 0, deckId: OTHER };
    await asUser(db, BETO, (tx) =>
      tx.query('select public.suspend_cards($1, false)', [JSON.stringify([ref])]),
    );
    const row = (await progress(BETO)).find((r) => r.deck_id === OTHER);
    expect(row).toMatchObject({ seen: 0, new_suspended: 1 });
  });

  it('undoing an answer takes it back from every count', async () => {
    const before = (await progress(ANA))[0]!;
    await record(ANA, answer('u1'));
    expect((await progress(ANA))[0]).toMatchObject({
      seen: (before['seen'] as number) + 1,
      new_today: (before['new_today'] as number) + 1,
    });
    await asUser(db, ANA, (tx) => tx.query('select public.undo_last_review()'));
    expect((await progress(ANA))[0]).toEqual(before);
  });

  it('it needs a session: nobody else can call it', async () => {
    await expect(
      asUser(db, null, (tx) =>
        tx.query('select * from public.deck_progress($1)', [new Date().toISOString()]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
