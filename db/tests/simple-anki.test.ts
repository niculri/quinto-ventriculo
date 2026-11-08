import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigration, asUser, createDatabase } from './pglite';

let db: PGlite;
const ANA = { sub: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' };
const BETO = { sub: '00000000-0000-4000-8000-00000000000b', email: 'beto@ug.uchile.cl' };
const INTRUDER = { sub: '00000000-0000-4000-8000-00000000000c', email: 'colado@gmail.com' };
const DECK = '2059400110';
const OTHER_DECK = '2059400111';

beforeAll(async () => {
  db = await createDatabase('users');
  await db.query('update public.access_settings set open_to_domain = true');
  for (const u of [ANA, BETO, INTRUDER]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u.sub, u.email]);
  }
});

/** An answer of a new card, as the web sends it. */
function answer(noteGuid: string, deckId = DECK, durationMs = 4000) {
  const now = new Date();
  return {
    noteGuid,
    ord: 0,
    deckId,
    expectedUpdatedAt: null,
    rating: 3,
    queueBefore: 'new',
    interval: -600,
    lastInterval: 0,
    durationMs,
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
  };
}

const record = (tx: Pick<PGlite, 'query'>, a: ReturnType<typeof answer>) =>
  tx.query('select public.record_review($1)', [a]);

describe('what a student chooses for the simple Anki', () => {
  it('each student sees and changes only their own activations', async () => {
    await asUser(db, ANA, (tx) =>
      tx.query(`insert into public.deck_activations (deck_id, active) values ($1, true)`, [DECK]),
    );
    const beto = await asUser(db, BETO, async (tx) => {
      const before = await tx.query('select * from public.deck_activations');
      const changed = await tx.query('update public.deck_activations set active = false');
      await tx.query('delete from public.deck_activations');
      return { rows: before.rows, changed: changed.affectedRows };
    });
    expect(beto).toEqual({ rows: [], changed: 0 });
    const ana = await asUser(db, ANA, (tx) =>
      tx.query('select deck_id, active from public.deck_activations'),
    );
    expect(ana.rows).toEqual([{ deck_id: DECK, active: true }]);
  });

  it('the web saves with upsert: nobody can write a row of another student', async () => {
    await asUser(db, ANA, (tx) =>
      tx.query(
        `insert into public.deck_activations (deck_id, active) values ($1, false)
         on conflict (user_id, deck_id) do update set active = excluded.active`,
        [DECK],
      ),
    );
    await expect(
      asUser(db, BETO, (tx) =>
        tx.query(
          `insert into public.deck_activations (user_id, deck_id, active) values ($1, $2, true)`,
          [ANA.sub, DECK],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(db, BETO, (tx) =>
        tx.query(`insert into public.assessment_settings (user_id, deck_id) values ($1, $2)`, [
          ANA.sub,
          DECK,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('the options of an assessment are each one’s, with a valid number of new cards', async () => {
    await asUser(db, ANA, (tx) =>
      tx.query(
        `insert into public.assessment_settings (deck_id, include_extras, new_per_day) values ($1, true, 35)`,
        [DECK],
      ),
    );
    expect(
      (await asUser(db, BETO, (tx) => tx.query('select * from public.assessment_settings'))).rows,
    ).toEqual([]);
    const ana = await asUser(db, ANA, (tx) =>
      tx.query('select deck_id, include_extras, new_per_day from public.assessment_settings'),
    );
    expect(ana.rows).toEqual([{ deck_id: DECK, include_extras: true, new_per_day: 35 }]);
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(`update public.assessment_settings set new_per_day = 10000`),
      ),
    ).rejects.toThrow(/check constraint/);
    // Without touching the number, it stays null: the site's default.
    await asUser(db, BETO, (tx) =>
      tx.query(
        `insert into public.assessment_settings (deck_id, include_extras) values ($1, true)`,
        [DECK],
      ),
    );
    const beto = await asUser(db, BETO, (tx) =>
      tx.query('select new_per_day from public.assessment_settings'),
    );
    expect(beto.rows).toEqual([{ new_per_day: null }]);
  });

  it('a deck id has to look like one', async () => {
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(`insert into public.deck_activations (deck_id, active) values ('x', true)`),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it('the new preferences start off and are kept', async () => {
    const prefs = await asUser(db, ANA, async (tx) => {
      await tx.query(`insert into public.study_preferences (time_zone) values ('UTC')`);
      const first = await tx.query(
        'select full_anki, four_buttons, welcome_seen from public.study_preferences',
      );
      await tx.query(`update public.study_preferences set full_anki = true, welcome_seen = true`);
      const then = await tx.query(
        'select full_anki, four_buttons, welcome_seen from public.study_preferences',
      );
      return { first: first.rows, then: then.rows };
    });
    expect(prefs.first).toEqual([{ full_anki: false, four_buttons: false, welcome_seen: false }]);
    expect(prefs.then).toEqual([{ full_anki: true, four_buttons: false, welcome_seen: true }]);
  });

  it('an account from another domain, and anon, can do nothing', async () => {
    for (const sql of [
      `insert into public.deck_activations (deck_id, active) values ('${DECK}', true)`,
      `insert into public.assessment_settings (deck_id) values ('${DECK}')`,
    ]) {
      await expect(asUser(db, INTRUDER, (tx) => tx.query(sql))).rejects.toThrow(
        /row-level security/,
      );
    }
    for (const sql of [
      'select * from public.deck_activations',
      'select * from public.assessment_settings',
      'select * from public.answered_decks()',
      'select public.median_answer_ms()',
    ]) {
      await expect(asUser(db, null, (tx) => tx.query(sql))).rejects.toThrow(/permission denied/);
    }
    const seen = await asUser(db, INTRUDER, async (tx) => ({
      activations: (await tx.query('select * from public.deck_activations')).rows,
      answered: (await tx.query('select * from public.answered_decks()')).rows,
    }));
    expect(seen).toEqual({ activations: [], answered: [] });
  });
});

describe('what the web reads of a student’s progress', () => {
  const answered = (claims: typeof ANA) =>
    asUser(db, claims, async (tx) =>
      (
        await tx.query<{ deck_id: string }>(
          'select deck_id from public.answered_decks() order by 1',
        )
      ).rows.map((r) => r.deck_id),
    );

  it('answered_decks: only their own decks with an answer; a buried or flagged card does not count', async () => {
    const carla = { sub: '00000000-0000-4000-8000-00000000000d', email: 'carla@ug.uchile.cl' };
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [carla.sub, carla.email]);
    expect(await answered(carla)).toEqual([]);
    await asUser(db, carla, async (tx) => {
      await tx.query('select public.bury_cards($1, $2, false)', [
        [{ noteGuid: 'b1', ord: 0, deckId: OTHER_DECK }],
        new Date(Date.now() + 86_400_000).toISOString(),
      ]);
      await tx.query('select public.set_flag($1, 1)', [
        { noteGuid: 'b2', ord: 0, deckId: OTHER_DECK },
      ]);
    });
    expect(await answered(carla)).toEqual([]);
    await asUser(db, carla, (tx) => record(tx, answer('a1')));
    expect(await answered(carla)).toEqual([DECK]);
    expect(await answered(BETO)).toEqual([]);
    // Undoing the only answer leaves the deck as it was.
    await asUser(db, carla, (tx) => tx.query('select public.undo_last_review()'));
    expect(await answered(carla)).toEqual([]);
  });

  it('median_answer_ms: null with few answers, then the median of their own last 500', async () => {
    const dani = { sub: '00000000-0000-4000-8000-00000000000e', email: 'dani@ug.uchile.cl' };
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [dani.sub, dani.email]);
    const median = (claims: typeof ANA) =>
      asUser(
        db,
        claims,
        async (tx) =>
          (await tx.query<{ v: number | null }>('select public.median_answer_ms() as v')).rows[0]!
            .v,
      );
    expect(await median(dani)).toBeNull();
    await asUser(db, dani, async (tx) => {
      for (let i = 0; i < 19; i++) await record(tx, answer(`m${i}`, DECK, 1000 + i * 1000));
    });
    expect(await median(dani)).toBeNull();
    await asUser(db, dani, (tx) => record(tx, answer('m19', DECK, 20_000)));
    expect(await median(dani)).toBe(10_500);
    // Another student's answers do not count, and nor do they see this one's.
    expect(await median(BETO)).toBeNull();
  });
});

describe('applied on a database with students who already studied', () => {
  const MIGRATION = '20261101000600_simple_anki.sql';
  const REVIEWS = 25;
  let old: PGlite;
  let before: Awaited<ReturnType<typeof snapshot>>;

  /** Everything a student had, column by column, as it was before the migration. */
  async function snapshot(target: PGlite) {
    const rows = async (sql: string) => (await target.query(sql)).rows;
    return {
      preferences: await rows(
        `select user_id, time_zone, day_starts_at, learn_ahead_minutes, new_cards_ignore_review_limit,
                apply_all_parent_limits, updated_at
           from public.study_preferences order by user_id`,
      ),
      presets: await rows('select * from public.user_presets order by id'),
      settings: await rows('select * from public.deck_settings order by user_id, deck_id'),
      cards: await rows('select * from public.card_states order by user_id, note_guid, ord'),
      log: await rows('select * from public.review_log order by id'),
    };
  }

  beforeAll(async () => {
    old = await createDatabase('users', [], MIGRATION);
    await old.query('update public.access_settings set open_to_domain = true');
    for (const u of [ANA, BETO]) {
      await old.query(`insert into auth.users (id, email) values ($1, $2)`, [u.sub, u.email]);
    }
    await asUser(old, ANA, async (tx) => {
      await tx.query(
        `insert into public.study_preferences
           (time_zone, day_starts_at, learn_ahead_minutes, new_cards_ignore_review_limit, apply_all_parent_limits)
         values ('America/Santiago', 3, 30, true, true)`,
      );
      const preset = await tx.query<{ id: string }>(
        `insert into public.user_presets (name, config) values ('Para el certamen', '{"newPerDay": 999}') returning id`,
      );
      await tx.query(`insert into public.deck_settings (deck_id, preset_id) values ($1, $2)`, [
        DECK,
        preset.rows[0]!.id,
      ]);
      for (let i = 0; i < REVIEWS; i++) {
        await record(tx, answer(`old-${i}`, DECK, 1000 * (i + 1)));
      }
      await tx.query('select public.bury_cards($1, $2, false)', [
        [{ noteGuid: 'only-buried', ord: 0, deckId: OTHER_DECK }],
        new Date(Date.now() + 86_400_000).toISOString(),
      ]);
      await tx.query('select public.set_flag($1, 3)', [
        { noteGuid: 'old-0', ord: 0, deckId: DECK },
      ]);
    });
    before = await snapshot(old);
    await applyMigration(old, 'users', MIGRATION);
  });

  it('does not touch anything of what they had', async () => {
    expect(before.cards).toHaveLength(REVIEWS + 1);
    expect(before.log).toHaveLength(REVIEWS + 2);
    expect(await snapshot(old)).toEqual(before);
  });

  it('they start in the simple mode, with the welcome to see and their other preferences kept', async () => {
    const rows = await asUser(old, ANA, (tx) =>
      tx.query(
        `select full_anki, four_buttons, welcome_seen, day_starts_at, apply_all_parent_limits
           from public.study_preferences`,
      ),
    );
    expect(rows.rows).toEqual([
      {
        full_anki: false,
        four_buttons: false,
        welcome_seen: false,
        day_starts_at: 3,
        apply_all_parent_limits: true,
      },
    ]);
  });

  it('what they answered counts as studied, what they only buried does not, and their time is there', async () => {
    const seen = await asUser(old, ANA, async (tx) => ({
      decks: (await tx.query<{ deck_id: string }>('select deck_id from public.answered_decks()'))
        .rows,
      median: (await tx.query<{ v: number }>('select public.median_answer_ms() as v')).rows[0]!.v,
    }));
    expect(seen).toEqual({ decks: [{ deck_id: DECK }], median: 13_000 });
  });

  it('undo keeps working over what was saved before, and new answers too', async () => {
    const flagged = () =>
      asUser(old, ANA, async (tx) => {
        const rows = await tx.query<{ flag: number }>(
          `select flag from public.card_states where note_guid = 'old-0'`,
        );
        return rows.rows[0]!.flag;
      });
    expect(await flagged()).toBe(3);
    await asUser(old, ANA, (tx) => tx.query('select public.undo_last_review()'));
    expect(await flagged()).toBe(0);
    await asUser(old, ANA, (tx) => record(tx, answer('after-migration')));
    const cards = await asUser(old, ANA, (tx) =>
      tx.query(`select phase, reps from public.card_states where note_guid = 'after-migration'`),
    );
    expect(cards.rows).toEqual([{ phase: 'learning', reps: 1 }]);
  });

  it('another student sees nothing of theirs through the new functions, which run with the caller’s rights', async () => {
    const seen = await asUser(old, BETO, async (tx) => ({
      decks: (await tx.query('select * from public.answered_decks()')).rows,
      median: (await tx.query('select public.median_answer_ms() as v')).rows,
    }));
    expect(seen).toEqual({ decks: [], median: [{ v: null }] });
    const functions = await old.query<{ proname: string; prosecdef: boolean }>(
      `select proname, prosecdef from pg_proc
        where proname in ('answered_decks', 'median_answer_ms') order by proname`,
    );
    expect(functions.rows).toEqual([
      { proname: 'answered_decks', prosecdef: false },
      { proname: 'median_answer_ms', prosecdef: false },
    ]);
  });

  it('what Supabase grants by default on the new tables is gone', async () => {
    const grants = await old.query<{ grantee: string; privilege_type: string }>(
      `select grantee, privilege_type from information_schema.role_table_grants
        where table_name = 'deck_activations' and grantee in ('anon', 'authenticated')
        order by 1, 2`,
    );
    expect(grants.rows).toEqual(
      ['DELETE', 'INSERT', 'SELECT', 'UPDATE'].map((privilege_type) => ({
        grantee: 'authenticated',
        privilege_type,
      })),
    );
    await expect(
      asUser(old, ANA, (tx) => tx.query('truncate public.deck_activations')),
    ).rejects.toThrow(/permission denied/);
  });

  it('a row cannot be passed to another student', async () => {
    await asUser(old, ANA, (tx) =>
      tx.query(`insert into public.deck_activations (deck_id, active) values ($1, true)`, [DECK]),
    );
    await expect(
      asUser(old, ANA, (tx) =>
        tx.query('update public.deck_activations set user_id = $1', [BETO.sub]),
      ),
    ).rejects.toThrow(/row-level security/);
    // Deleting the account takes its choices with it.
    await old.query('delete from auth.users where id = $1', [ANA.sub]);
    const left = await old.query('select * from public.deck_activations');
    expect(left.rows).toEqual([]);
  });
});
