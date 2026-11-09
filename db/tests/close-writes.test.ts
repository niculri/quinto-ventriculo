// Plan step 1.2: the users' database closed to writing by hand (20261106010000_close_writes.sql). Cards, log,
// undo and tests only through the site's functions (security definer), quotas per user and a cap on an answer.
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigration, asUser, createDatabase } from './pglite';

const MIGRATION = '20261106010000_close_writes.sql';
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

const ROUND = '11111111-1111-4111-8111-111111111111';

/** A step of a test as the web sends it (useQuizSession): the round, its info and maybe an answer. */
function quizStep(extra: Record<string, unknown> = {}) {
  return {
    quizId: 'q',
    sectionId: 's',
    round: { id: ROUND, screen: 'question' },
    roundInfo: {
      id: ROUND,
      origin: 'cover',
      questionCount: 2,
      shuffled: false,
      shuffleOptions: false,
      startedAt: new Date().toISOString(),
      finished: false,
    },
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

describe('the migration, on a database with cards', () => {
  it('counts each user’s card states for their quota', async () => {
    const db = await createDatabase('users', [], MIGRATION);
    await db.query('update public.access_settings set open_to_domain = true');
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [ANA.sub, ANA.email]);
    await db.query(
      `insert into public.card_states (user_id, note_guid, ord, deck_id)
       select $1, 'g' || i, 0, $2 from generate_series(1, 7) i`,
      [ANA.sub, DECK],
    );
    await applyMigration(db, 'users', MIGRATION);
    const r = await db.query(`select cards, changes_today from public.user_quotas`);
    expect(r.rows).toEqual([{ cards: 7, changes_today: 0 }]);
  });
});

describe('writes only through the functions', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await newDatabase();
  });

  it('the functions that write run as their owner, and the helpers cannot be called', async () => {
    const r = await db.query<{ proname: string; prosecdef: boolean }>(
      `select proname, prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and proname in ('record_review', 'bury_cards', 'suspend_cards', 'set_flag',
          'undo_last_review', 'unsuspend_cards', 'unbury_cards', 'set_flags', 'forget_cards', 'save_quiz_progress')`,
    );
    expect(r.rows).toHaveLength(10);
    expect(r.rows.filter((x) => !x.prosecdef)).toEqual([]);
    for (const sql of [
      `select public.lock_user_study()`,
      `select public.lock_card_state('x', 0, '${DECK}')`,
      `select public.browse_change_card(gen_random_uuid(), 'forget', '{"noteGuid":"x","ord":0,"deckId":"${DECK}"}', now(), '{}')`,
      `select public.log_change(gen_random_uuid(), 'flag', null::public.card_states, null::public.card_states, now())`,
    ]) {
      await expect(asUser(db, ANA, (tx) => tx.query(sql))).rejects.toThrow(/permission denied/);
    }
  });

  it('of the functions that run as their owner, a student calls only the site’s, and anon none', async () => {
    const r = await db.query<{ proname: string; anon: boolean; signed_in: boolean }>(
      `select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as signed_in
         from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.prosecdef
        order by 1`,
    );
    expect(r.rows.filter((x) => x.anon)).toEqual([]);
    expect(r.rows.filter((x) => x.signed_in).map((x) => x.proname)).toEqual([
      // Step 2.3: accepting the terms and the privacy policy, with the person's own session
      'accept_legal',
      // Step 2.1: the Worker asks the state of the student's own session (step 2.3: with the versions to accept)
      'access_status',
      // Step 2.10: «Acceso» in the administration panel, only for an administrator with the session open
      'admin_access_report',
      // Step 1.7, part 2: whom a release reaches, only for an administrator (it checks is_admin() itself)
      'admin_deck_impact',
      'admin_invite_emails',
      'admin_remove_invites',
      // Step 2.6: the reports of every content, grouped by content, and blocking who writes them
      'admin_reopen_reports',
      'admin_report_queue',
      'admin_resolve_reports',
      // Step 2.10 b: naming or removing an administrator, only for the owner with the session open
      'admin_set_admin',
      'admin_set_report_block',
      // Step 2.9: «Uso», figures of 5 students or more, only for an administrator with the session open
      'admin_usage',
      'bury_cards',
      // Step 2.3: «Descargar mis datos», only theirs
      'export_my_data',
      'forget_cards',
      'is_admin',
      // Step 2.1: about the caller only. is_invited(), which takes any email, is not for a student any more.
      'is_allowed_user',
      // Step 2.6: «Mis reportes»
      'my_reports',
      // Step 1.3: the content's changes, applied to the caller's own cards
      'reconcile_cards',
      // Step 3.1: practice that does not change dates (the final review), to the caller's day
      'record_practice',
      'record_review',
      // Step 2.6: reporting, only through it (the limits, the block and the place)
      'report_content',
      // Step 2.3: «Eliminar mi cuenta», and entering again (it cancels it)
      'request_account_deletion',
      'resume_account',
      'save_quiz_progress',
      'set_flag',
      'set_flags',
      // Step 3.1: the heatmap, the caller's days and what they have due
      'study_heatmap',
      'suspend_cards',
      'unbury_cards',
      'undo_last_review',
      'unsuspend_cards',
    ]);
  });

  it('the study still works through them: answer, bury, flag, undo', async () => {
    const r = await asUser(db, ANA, async (tx) => {
      await tx.query(call('record_review', [0]), [answer('n1')]);
      await tx.query(call('set_flag', [0, 1]), [{ noteGuid: 'n1', ord: 0, deckId: DECK }, 3]);
      await tx.query(call('undo_last_review', []));
      return tx.query<{ flag: number; reps: number }>(
        `select flag, reps from public.card_states where note_guid = 'n1'`,
      );
    });
    expect(r.rows).toEqual([{ flag: 0, reps: 1 }]);
  });

  it('an answer of more than 64 KB, or that buries more than 100 cards, is refused', async () => {
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(call('record_review', [0]), [answer('n2', { padding: 'x'.repeat(70_000) })]),
      ),
    ).rejects.toThrow(/too_large/);
    const bury = Array.from({ length: 101 }, (_, i) => ({
      noteGuid: 'n2',
      ord: i + 1,
      deckId: DECK,
    }));
    await expect(
      asUser(db, ANA, (tx) => tx.query(call('record_review', [0]), [answer('n2', { bury })])),
    ).rejects.toThrow(/too_large/);
  });

  it('a test’s step of more than 1.1 MB is refused', async () => {
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(call('save_quiz_progress', [0]), [quizStep({ padding: 'x'.repeat(1_100_001) })]),
      ),
    ).rejects.toThrow(/too_large/);
  });

  it('undo puts back only the caller’s own card, even from an undo row that says otherwise', async () => {
    // As the functions now run as their owner (no RLS), what keeps undo to the caller's rows is the function
    // itself. Before step 1.2 a student could write an undo row by hand (they live 48 hours): one of Ana’s
    // that claims to have been Beto’s card, written here as the database's owner.
    await asUser(db, BETO, (tx) => tx.query(call('record_review', [0]), [answer('b1')]));
    const log = await db.query<{ id: number }>(
      `insert into public.review_log (user_id, action, note_guid, ord, deck_id, phase_before, phase_after)
       values ($1, 'flag', 'b1', 0, $2, 'learning', 'learning') returning id`,
      [ANA.sub, DECK],
    );
    await db.query(
      `insert into public.review_undo (log_id, user_id, action_id, state_before)
       values ($1, $2, gen_random_uuid(), $3)`,
      [
        log.rows[0]!.id,
        ANA.sub,
        {
          user_id: BETO.sub,
          note_guid: 'b1',
          ord: 0,
          deck_id: DECK,
          phase: 'new',
          interday: false,
          remaining_steps: 0,
          interval: 0,
          reps: 0,
          lapses: 0,
          flag: 7,
          suspended: true,
          leech: false,
          updated_at: new Date().toISOString(),
        },
      ],
    );
    await asUser(db, ANA, (tx) => tx.query(call('undo_last_review', [])));
    const r = await db.query(
      `select user_id, phase, flag, suspended from public.card_states where note_guid = 'b1' order by user_id`,
    );
    // It became Ana’s own row; Beto’s card is as he left it.
    expect(r.rows).toEqual([
      { user_id: ANA.sub, phase: 'new', flag: 7, suspended: true },
      { user_id: BETO.sub, phase: 'learning', flag: 0, suspended: false },
    ]);
  });
});

describe('quotas', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await newDatabase();
  });

  const quota = async (user: { sub: string }) =>
    (
      await db.query<{ cards: number; changes_today: number }>(
        `select cards, changes_today from public.user_quotas where user_id = $1`,
        [user.sub],
      )
    ).rows[0];

  it('more than 200,000 card states is refused, and nothing of the answer stays', async () => {
    await asUser(db, ANA, (tx) => tx.query(call('record_review', [0]), [answer('c1')]));
    await db.query(`update public.user_quotas set cards = 200000 where user_id = $1`, [ANA.sub]);
    await expect(
      asUser(db, ANA, (tx) => tx.query(call('record_review', [0]), [answer('c2')])),
    ).rejects.toThrow(/quota_exceeded/);
    const r = await db.query(`select note_guid from public.card_states where user_id = $1`, [
      ANA.sub,
    ]);
    expect(r.rows).toEqual([{ note_guid: 'c1' }]);
    // A card already there can still be answered: ON CONFLICT DO UPDATE adds no row, and the count stays.
    const at = await db.query<{ t: string }>(
      `select updated_at::text as t from public.card_states where user_id = $1 and note_guid = 'c1'`,
      [ANA.sub],
    );
    await asUser(db, ANA, (tx) =>
      tx.query(call('record_review', [0]), [answer('c1', { expectedUpdatedAt: at.rows[0]!.t })]),
    );
    expect((await quota(ANA))!.cards).toBe(200000);
    await db.query(`update public.user_quotas set cards = 1 where user_id = $1`, [ANA.sub]);
  });

  it('the count follows the cards: undoing a new card’s answer gives back its rows', async () => {
    const sibling = { noteGuid: 'u1', ord: 1, deckId: DECK };
    await asUser(db, ANA, (tx) =>
      tx.query(call('record_review', [0]), [answer('u1', { bury: [sibling] })]),
    );
    expect((await quota(ANA))!.cards).toBe(3);
    await asUser(db, ANA, (tx) => tx.query(call('undo_last_review', [])));
    expect((await quota(ANA))!.cards).toBe(1);
  });

  it('more than 50,000 changes a day is refused, whatever the session’s time zone; the next day starts again', async () => {
    const today = `(now() at time zone 'UTC')::date`;
    await db.query(
      `update public.user_quotas set changes_today = 50000, day = ${today} where user_id = $1`,
      [ANA.sub],
    );
    // PostgREST lets a client choose the session's zone (Prefer: timezone): two zones a day apart must not
    // start the day again.
    for (const zone of ['Pacific/Kiritimati', 'Etc/GMT+12', 'UTC']) {
      await expect(
        asUser(db, ANA, async (tx) => {
          await tx.query(`select set_config('timezone', $1, true)`, [zone]);
          return tx.query(call('record_review', [0]), [answer('d1')]);
        }),
      ).rejects.toThrow(/quota_exceeded/);
    }
    await db.query(`update public.user_quotas set day = ${today} - 1 where user_id = $1`, [
      ANA.sub,
    ]);
    await asUser(db, ANA, (tx) => tx.query(call('record_review', [0]), [answer('d1')]));
    const r = await db.query(`select changes_today from public.user_quotas where user_id = $1`, [
      ANA.sub,
    ]);
    expect(r.rows).toEqual([{ changes_today: 1 }]);
  });

  it('a small table has its cap per user (presets: 200), others are not affected', async () => {
    await asUser(db, BETO, (tx) =>
      tx.query(
        `insert into public.user_presets (name, config) select 'p' || i, '{}' from generate_series(1, 200) i`,
      ),
    );
    await expect(
      asUser(db, BETO, (tx) =>
        tx.query(`insert into public.user_presets (name, config) values ('una más', '{}')`),
      ),
    ).rejects.toThrow(/quota_exceeded/);
    await asUser(db, ANA, (tx) =>
      tx.query(`insert into public.user_presets (name, config) values ('de Ana', '{}')`),
    );
    const triggers = await db.query<{ table: string }>(
      `select c.relname as table from pg_trigger t join pg_class c on c.oid = t.tgrelid
        where t.tgname = 'quota_rows' order by 1`,
    );
    expect(triggers.rows.map((r) => r.table)).toEqual([
      'assessment_settings',
      'deck_activations',
      'deck_settings',
      // Step 2.3: at most 100 pairs of versions accepted
      'legal_acceptances',
      'quiz_progress',
      'quiz_rounds',
      'readings',
      'user_presets',
    ]);
  });

  it('a test’s answers count as changes; the same answer saved again does not', async () => {
    const first = {
      roundId: ROUND,
      questionId: 'A-1',
      position: 0,
      chosen: 1,
      correct: true,
      answeredAt: new Date().toISOString(),
    };
    for (const a of [first, first, { ...first, questionId: 'A-2', position: 1 }]) {
      await asUser(db, BETO, (tx) =>
        tx.query(call('save_quiz_progress', [0]), [quizStep({ answer: a })]),
      );
    }
    expect((await quota(BETO))!.changes_today).toBe(2);
  });

  it('at a table’s cap, what is already there can still be changed (upserts, every step of a test)', async () => {
    // Beto has one section saved (the test above); 1,999 more make the 2,000 of the cap.
    await db.query(
      `insert into public.quiz_progress (user_id, quiz_id, section_id)
       select $1, 'x', 's' || i from generate_series(1, 1999) i`,
      [BETO.sub],
    );
    // The web sends every step with its round's info (insert … on conflict do nothing) and upserts the section.
    await asUser(db, BETO, (tx) => tx.query(call('save_quiz_progress', [0]), [quizStep()]));
    await expect(
      asUser(db, BETO, (tx) =>
        tx.query(call('save_quiz_progress', [0]), [
          { quizId: 'q', sectionId: 'otra', round: null },
        ]),
      ),
    ).rejects.toThrow(/quota_exceeded/);
    // The options of an assessment, as the web saves them (upsert), at their cap of 1,000.
    await db.query(
      `insert into public.assessment_settings (user_id, deck_id)
       select $1, i::text from generate_series(1, 1000) i`,
      [BETO.sub],
    );
    await asUser(db, BETO, (tx) =>
      tx.query(
        `insert into public.assessment_settings (deck_id, include_extras) values ('7', true)
         on conflict (user_id, deck_id) do update set include_extras = excluded.include_extras`,
      ),
    );
    await expect(
      asUser(db, BETO, (tx) =>
        tx.query(`insert into public.assessment_settings (deck_id) values ('1001')`),
      ),
    ).rejects.toThrow(/quota_exceeded/);
  });

  it('the tests’ progress has at most 5 MB per user; shrinking it is always allowed', async () => {
    await asUser(db, ANA, (tx) => tx.query(call('save_quiz_progress', [0]), [quizStep()]));
    const before = await db.query<{ quiz_bytes: number }>(
      `select quiz_bytes::int from public.user_quotas where user_id = $1`,
      [ANA.sub],
    );
    expect(before.rows[0]!.quiz_bytes).toBeGreaterThan(0);
    await db.query(`update public.user_quotas set quiz_bytes = 4999990 where user_id = $1`, [
      ANA.sub,
    ]);
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(call('save_quiz_progress', [0]), [
          quizStep({
            quizId: 'otro-test',
            round: { id: '6b0c3b0e-3c1a-4d1a-9a1a-000000000001', big: 'x'.repeat(5000) },
          }),
        ]),
      ),
    ).rejects.toThrow(/quota_exceeded/);
    // Discarding the round of a section makes it smaller: always allowed, even over the cap.
    await asUser(db, ANA, (tx) =>
      tx.query(call('save_quiz_progress', [0]), [{ quizId: 'q', sectionId: 's', round: null }]),
    );
  });

  it('the columns the web writes directly have a maximum length', async () => {
    await expect(
      asUser(db, ANA, (tx) => tx.query(`update public.profiles set name = $1`, ['n'.repeat(201)])),
    ).rejects.toThrow(/profiles_name_length/);
  });

  it('nobody reads or writes the quotas, and deleting an account still works', async () => {
    for (const sql of [
      'select * from public.user_quotas',
      `insert into public.user_quotas (user_id) values ('${ANA.sub}')`,
      'update public.user_quotas set cards = 0',
      'delete from public.user_quotas',
    ]) {
      await expect(asUser(db, ANA, (tx) => tx.query(sql))).rejects.toThrow(/permission denied/);
    }
    await db.query(`delete from auth.users where id = $1`, [ANA.sub]);
    const left = await db.query<{ n: number }>(
      `select (select count(*) from public.user_quotas where user_id = $1)
            + (select count(*) from public.card_states where user_id = $1) as n`,
      [ANA.sub],
    );
    expect(Number(left.rows[0]!.n)).toBe(0);
  });
});
