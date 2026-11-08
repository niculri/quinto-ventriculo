/**
 * v1.3 (users): the browser's actions. The migration is applied on a database that already has someone
 * studying (as production: card states and log rows of v1.2), which must stay as they were.
 */
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigration, asUser, createDatabase } from './pglite';

const MIGRATION = '20261101000300_browse.sql';
const ANA = { sub: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' };
const BETO = { sub: '00000000-0000-4000-8000-00000000000b', email: 'beto@ug.uchile.cl' };
const INTRUDER = { sub: '00000000-0000-4000-8000-00000000000c', email: 'colado@gmail.com' };
const DECK = '2059400110';
const ref = (noteGuid: string, ord = 0) => ({ noteGuid, ord, deckId: DECK });

let db: PGlite;

const call = (fn: string, n: number) =>
  `select public.${fn}(${Array.from({ length: n }, (_, i) => `$${i + 1}`).join(', ')}) as r`;

/** A review card answered yesterday (as record_review leaves it). */
function reviewed(noteGuid: string, ord = 0) {
  const now = new Date();
  return {
    ...ref(noteGuid, ord),
    expectedUpdatedAt: null,
    rating: 3,
    queueBefore: 'new',
    interval: 3,
    lastInterval: 0,
    durationMs: 3000,
    state: {
      phase: 'review',
      interday: true,
      remainingSteps: 0,
      due: new Date(now.getTime() + 3 * 86_400_000).toISOString(),
      interval: 3,
      stability: 3.17,
      difficulty: 5.2,
      reps: 4,
      lapses: 1,
      lastReview: now.toISOString(),
      suspended: false,
      leech: false,
    },
    bury: [],
    buriedUntil: null,
  };
}

type Row = Record<string, unknown>;
const card = (user: typeof ANA, noteGuid: string) =>
  asUser(db, user, async (tx) => {
    const r = await tx.query<Row>(
      `select phase, due, interval, stability, difficulty, reps, lapses, flag, suspended, buried_until,
              leech from public.card_states where note_guid = $1 and ord = 0`,
      [noteGuid],
    );
    return r.rows[0] ?? null;
  });
const log = (user: typeof ANA) =>
  asUser(db, user, async (tx) =>
    (await tx.query<Row>('select action from public.review_log order by id')).rows.map(
      (r) => r['action'],
    ),
  );

beforeAll(async () => {
  // As production: v1.2 applied and Ana studying (an answer, a suspended card and a flagged one).
  db = await createDatabase('users', [], MIGRATION);
  await db.query('update public.access_settings set open_to_domain = true');
  for (const u of [ANA, BETO, INTRUDER]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u.sub, u.email]);
  }
  await asUser(db, ANA, async (tx) => {
    for (const g of ['n1', 'n2', 'n3']) await tx.query(call('record_review', 1), [reviewed(g)]);
    await tx.query(call('suspend_cards', 2), [[ref('n2')], false]);
    await tx.query(call('set_flag', 2), [ref('n3'), 2]);
    // Her options, as v1.2 saves them: preferences, a preset of hers and the deck using it.
    await tx.query(
      `insert into public.study_preferences (time_zone, day_starts_at) values ('America/Santiago', 5)`,
    );
    const preset = await tx.query<{ id: string }>(
      `insert into public.user_presets (name, replaces, config) values ('Mía', null, '{"newPerDay": 7}')
       returning id`,
    );
    await tx.query(`insert into public.deck_settings (deck_id, preset_id) values ($1, $2)`, [
      DECK,
      preset.rows[0]!.id,
    ]);
  });
  await applyMigration(db, 'users', MIGRATION);
});

describe('the browse migration', () => {
  it('keeps what was studied before it', async () => {
    expect(await card(ANA, 'n1')).toMatchObject({ phase: 'review', reps: 4, suspended: false });
    expect(await card(ANA, 'n2')).toMatchObject({ phase: 'review', suspended: true });
    expect(await card(ANA, 'n3')).toMatchObject({ flag: 2 });
    expect(await log(ANA)).toEqual(['answer', 'answer', 'answer', 'suspend_card', 'flag']);
    const options = await asUser(db, ANA, async (tx) => ({
      prefs: (await tx.query('select day_starts_at from public.study_preferences')).rows,
      presets: (await tx.query('select name, config from public.user_presets')).rows,
      decks: (
        await tx.query(
          `select s.deck_id, p.name from public.deck_settings s
             join public.user_presets p on p.id = s.preset_id`,
        )
      ).rows,
    }));
    expect(options).toEqual({
      prefs: [{ day_starts_at: 5 }],
      presets: [{ name: 'Mía', config: { newPerDay: 7 } }],
      decks: [{ deck_id: DECK, name: 'Mía' }],
    });
  });

  it('unsuspend: only the suspended ones change, one action that undo takes back', async () => {
    const n = await asUser(db, ANA, (tx) =>
      tx.query<{ r: number }>(call('unsuspend_cards', 1), [[ref('n1'), ref('n2'), ref('nueva')]]),
    );
    expect(n.rows[0]!.r).toBe(1);
    expect(await card(ANA, 'n2')).toMatchObject({ suspended: false, phase: 'review' });
    // A card without a row (new) gets none.
    expect(await card(ANA, 'nueva')).toBeNull();
    expect((await log(ANA)).at(-1)).toBe('unsuspend');
    await asUser(db, ANA, (tx) => tx.query(call('undo_last_review', 0)));
    expect(await card(ANA, 'n2')).toMatchObject({ suspended: true });
    expect((await log(ANA)).at(-1)).toBe('flag');
  });

  it('unbury takes off the burial of the buried ones', async () => {
    const until = new Date(Date.now() + 86_400_000).toISOString();
    await asUser(db, ANA, (tx) => tx.query(call('bury_cards', 3), [[ref('n1')], until, false]));
    const n = await asUser(db, ANA, (tx) =>
      tx.query<{ r: number }>(call('unbury_cards', 1), [[ref('n1'), ref('n3')]]),
    );
    expect(n.rows[0]!.r).toBe(1);
    expect(await card(ANA, 'n1')).toMatchObject({ buried_until: null });
    expect((await log(ANA)).slice(-2)).toEqual(['bury_card', 'unbury']);
  });

  it('set_flags flags several cards (a new one too) and takes the flag off with 0', async () => {
    const n = await asUser(db, ANA, (tx) =>
      tx.query<{ r: number }>(call('set_flags', 2), [[ref('n1'), ref('n3'), ref('nueva')], 4]),
    );
    expect(n.rows[0]!.r).toBe(3);
    expect(await card(ANA, 'nueva')).toMatchObject({ phase: 'new', flag: 4 });
    // n3 already had 4 now: only the ones that change count.
    const again = await asUser(db, ANA, (tx) =>
      tx.query<{ r: number }>(call('set_flags', 2), [[ref('n1'), ref('n3')], 4]),
    );
    expect(again.rows[0]!.r).toBe(0);
    await asUser(db, ANA, (tx) => tx.query(call('set_flags', 2), [[ref('n1')], 0]));
    expect(await card(ANA, 'n1')).toMatchObject({ flag: 0 });
    await expect(
      asUser(db, ANA, (tx) => tx.query(call('set_flags', 2), [[ref('n1')], 8])),
    ).rejects.toThrow(/invalid_flag/);
  });

  it('forget: back to new, unsuspended, without memory; the counts stay unless asked', async () => {
    await asUser(db, ANA, (tx) => tx.query(call('forget_cards', 2), [[ref('n2')], false]));
    expect(await card(ANA, 'n2')).toMatchObject({
      phase: 'new',
      due: null,
      interval: 0,
      stability: null,
      difficulty: null,
      reps: 4,
      lapses: 1,
      suspended: false,
      buried_until: null,
    });
    await asUser(db, ANA, (tx) => tx.query(call('forget_cards', 2), [[ref('n3')], true]));
    expect(await card(ANA, 'n3')).toMatchObject({ phase: 'new', reps: 0, lapses: 0, flag: 4 });
    // Undo brings back the review card, with its memory.
    await asUser(db, ANA, (tx) => tx.query(call('undo_last_review', 0)));
    expect(await card(ANA, 'n3')).toMatchObject({ phase: 'review', reps: 4, stability: 3.17 });
    expect((await log(ANA)).at(-1)).toBe('forget');
  });

  it('first_answers_since: the cards first answered since a moment', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 3_600_000).toISOString();
    const r = await asUser(db, ANA, (tx) =>
      tx.query<{ note_guid: string }>(
        'select note_guid from public.first_answers_since($1) order by note_guid',
        [past],
      ),
    );
    expect(r.rows.map((x) => x.note_guid)).toEqual(['n1', 'n2', 'n3']);
    const none = await asUser(db, ANA, (tx) =>
      tx.query('select * from public.first_answers_since($1)', [future]),
    );
    expect(none.rows).toEqual([]);
    // Beto sees none of Ana's.
    const beto = await asUser(db, BETO, (tx) =>
      tx.query('select * from public.first_answers_since($1)', [past]),
    );
    expect(beto.rows).toEqual([]);
  });

  it('another user changes nothing of Ana’s', async () => {
    for (const fn of ['unsuspend_cards', 'unbury_cards']) {
      const r = await asUser(db, BETO, (tx) => tx.query<{ r: number }>(call(fn, 1), [[ref('n1')]]));
      expect(r.rows[0]!.r).toBe(0);
    }
    await asUser(db, BETO, (tx) => tx.query(call('forget_cards', 2), [[ref('n1')], true]));
    expect(await card(ANA, 'n1')).toMatchObject({ phase: 'review', reps: 4 });
    // A flag from Beto is a row of his own, even with Ana's id in the card.
    const before = await card(ANA, 'n1');
    await asUser(db, BETO, (tx) =>
      tx.query(call('set_flags', 2), [[{ ...ref('n1'), user_id: ANA.sub, userId: ANA.sub }], 6]),
    );
    expect(await card(ANA, 'n1')).toEqual(before);
    expect(await card(BETO, 'n1')).toMatchObject({ phase: 'new', flag: 6 });
    // Nor can a patch of browse_change_card (callable by hand) write in Ana's row.
    await asUser(db, BETO, (tx) =>
      tx.query(call('browse_change_card', 5), [
        '00000000-0000-4000-8000-000000000002',
        'forget',
        ref('n1'),
        new Date().toISOString(),
        { user_id: ANA.sub, flag: 1 },
      ]),
    );
    expect(await card(ANA, 'n1')).toEqual(before);
    // And Beto's undo takes back only Beto's actions.
    await asUser(db, BETO, (tx) => tx.query(call('undo_last_review', 0)));
    await asUser(db, BETO, (tx) => tx.query(call('undo_last_review', 0)));
    expect(await card(BETO, 'n1')).toBeNull();
    expect(await card(ANA, 'n1')).toEqual(before);
  });

  it('undo takes back the browser’s actions and the answers in order, one action at a time', async () => {
    const snapshot = async () =>
      asUser(
        db,
        ANA,
        async (tx) =>
          (
            await tx.query(
              `select note_guid, phase, reps, flag, suspended, buried_until, stability
               from public.card_states order by note_guid`,
            )
          ).rows,
      );
    const start = await snapshot();
    const startLog = await log(ANA);
    await asUser(db, ANA, (tx) => tx.query(call('record_review', 1), [reviewed('n4')]));
    const afterAnswer = await snapshot();
    await asUser(db, ANA, async (tx) => {
      await tx.query(call('forget_cards', 2), [[ref('n1'), ref('n4')], false]);
      await tx.query(call('set_flags', 2), [[ref('n1'), ref('n4'), ref('nueva-2')], 3]);
      await tx.query(call('suspend_cards', 2), [[ref('n4')], false]);
      await tx.query(call('unsuspend_cards', 1), [[ref('n4')]]);
    });
    const undone: unknown[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await asUser(db, ANA, (tx) =>
        tx.query<{ r: { action: string } }>(call('undo_last_review', 0)),
      );
      undone.push(r.rows[0]!.r.action);
    }
    expect(undone).toEqual(['unsuspend', 'suspend_card', 'flag', 'forget']);
    expect(await snapshot()).toEqual(afterAnswer);
    await asUser(db, ANA, (tx) => tx.query(call('undo_last_review', 0)));
    expect(await snapshot()).toEqual(start);
    expect(await log(ANA)).toEqual(startLog);
  });

  it('an account from another domain, or anon, can do nothing', async () => {
    for (const [fn, args] of [
      ['unsuspend_cards', [[ref('n1')]]],
      ['unbury_cards', [[ref('n1')]]],
      ['set_flags', [[ref('n1')], 1]],
      ['forget_cards', [[ref('n1')], false]],
    ] as const) {
      await expect(
        asUser(db, INTRUDER, (tx) => tx.query(call(fn, args.length), [...args])),
      ).rejects.toThrow(/not_allowed/);
      await expect(
        asUser(db, null, (tx) => tx.query(call(fn, args.length), [...args])),
      ).rejects.toThrow(/permission denied/);
    }
    await expect(
      asUser(db, null, (tx) =>
        tx.query(call('browse_change_card', 5), [
          '00000000-0000-4000-8000-000000000001',
          'forget',
          ref('n1'),
          new Date().toISOString(),
          {},
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('the log refuses an unknown action', async () => {
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(
          `insert into public.review_log (action_id, action, note_guid, ord, deck_id, phase_before,
             phase_after, state_after) values (gen_random_uuid(), 'otra', 'x', 0, $1, 'new', 'new', '{}')`,
          [DECK],
        ),
      ),
    ).rejects.toThrow(/review_log_action_check/);
  });
});
