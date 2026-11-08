import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './pglite';

let db: PGlite;
const ANA = { sub: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' };
const BETO = { sub: '00000000-0000-4000-8000-00000000000b', email: 'beto@ug.uchile.cl' };
const INTRUDER = { sub: '00000000-0000-4000-8000-00000000000c', email: 'colado@gmail.com' };
const DECK = '2059400110';

beforeAll(async () => {
  db = await createDatabase('users');
  // About each user's rows and the domain rule: the site open to the whole domain (invites.test.ts tests
  // the invite list).
  await db.query('update public.access_settings set open_to_domain = true');
  for (const u of [ANA, BETO, INTRUDER]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u.sub, u.email]);
  }
});

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

const call = (fn: string, args: unknown[]) =>
  `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`;

describe('card states and the review log', () => {
  it('an answer saves the card and its log row together', async () => {
    const r = await asUser(db, ANA, async (tx) => {
      const res = await tx.query<{ r: { actionId: string; updatedAt: string } }>(
        call('record_review', [0]),
        [answer('n1')],
      );
      const card = await tx.query(
        'select phase, remaining_steps, reps, stability from public.card_states',
      );
      const log = await tx.query(
        `select l.action, l.rating, l.queue_before, l.phase_before, l.phase_after, u.state_before, l.duration_ms,
                l.stability_after, l.difficulty_after
           from public.review_log l join public.review_undo u on u.log_id = l.id`,
      );
      return { res: res.rows[0]!.r, card: card.rows, log: log.rows };
    });
    expect(r.res.actionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.card).toEqual([{ phase: 'learning', remaining_steps: 1, reps: 1, stability: 2.3065 }]);
    expect(r.log).toEqual([
      {
        action: 'answer',
        rating: 3,
        queue_before: 'new',
        phase_before: 'new',
        phase_after: 'learning',
        state_before: null,
        duration_ms: 4200,
        stability_after: 2.3065,
        difficulty_after: expect.any(Number),
      },
    ]);
  });

  it('a card changed elsewhere since it was shown is not overwritten', async () => {
    await expect(
      asUser(db, ANA, (tx) => tx.query(call('record_review', [0]), [answer('n1')])),
    ).rejects.toThrow(/card_changed/);
    const updated = await asUser(db, ANA, (tx) =>
      tx.query<{ updated_at: string }>(
        `select updated_at::text from public.card_states where note_guid = 'n1'`,
      ),
    );
    const again = answer('n1', { expectedUpdatedAt: updated.rows[0]!.updated_at, rating: 1 });
    await asUser(db, ANA, (tx) => tx.query(call('record_review', [0]), [again]));
  });

  it('undo restores the card (and deletes it if it was new) and the log', async () => {
    const first = await asUser(db, ANA, async (tx) => {
      const r = await tx.query<{ r: { action: string; noteGuid: string; rating: number } }>(
        call('undo_last_review', []),
      );
      const card = await tx.query<{ reps: number }>(
        `select reps from public.card_states where note_guid = 'n1'`,
      );
      return { undone: r.rows[0]!.r, card: card.rows };
    });
    expect(first.undone).toMatchObject({ action: 'answer', noteGuid: 'n1', rating: 1 });
    expect(first.card).toEqual([{ reps: 1 }]);
    const second = await asUser(db, ANA, async (tx) => {
      await tx.query(call('undo_last_review', []));
      const cards = await tx.query('select * from public.card_states');
      const log = await tx.query('select * from public.review_log');
      const nothing = await tx.query<{ r: unknown }>(call('undo_last_review', []));
      return { cards: cards.rows.length, log: log.rows.length, nothing: nothing.rows[0]!.r };
    });
    expect(second).toEqual({ cards: 0, log: 0, nothing: null });
  });

  it('an answer buries the siblings it is told to, and undo unburies them', async () => {
    const until = new Date(Date.now() + 8 * 3600_000).toISOString();
    const r = await asUser(db, ANA, async (tx) => {
      await tx.query(call('record_review', [0]), [
        answer('n2', { bury: [{ noteGuid: 'n2', ord: 1, deckId: DECK }], buriedUntil: until }),
      ]);
      const buried = await tx.query<{ ord: number; phase: string; buried: boolean }>(
        `select ord, phase, buried_until is not null as buried from public.card_states
          where note_guid = 'n2' order by ord`,
      );
      const log = await tx.query<{ n: number }>(
        `select count(distinct action_id)::int as n from public.review_undo`,
      );
      await tx.query(call('undo_last_review', []));
      const after = await tx.query(`select * from public.card_states where note_guid = 'n2'`);
      return { buried: buried.rows, actions: log.rows[0]!.n, after: after.rows.length };
    });
    expect(r.buried).toEqual([
      { ord: 0, phase: 'learning', buried: false },
      { ord: 1, phase: 'new', buried: true },
    ]);
    expect(r.actions).toBe(1);
    expect(r.after).toBe(0);
  });

  it('bury, suspend and flags are actions that undo can take back', async () => {
    const cards = [
      { noteGuid: 'n3', ord: 0, deckId: DECK },
      { noteGuid: 'n3', ord: 1, deckId: DECK },
    ];
    const r = await asUser(db, ANA, async (tx) => {
      await tx.query(call('set_flag', [0, 1]), [cards[0], 4]);
      await tx.query(call('suspend_cards', [0, 1]), [[cards[1]], false]);
      // A suspended card is not buried (Anki).
      const n = await tx.query<{ r: number }>(call('bury_cards', [0, 1, 2]), [
        cards,
        new Date(Date.now() + 3600_000).toISOString(),
        true,
      ]);
      const state = await tx.query(
        `select ord, flag, suspended, buried_until is not null as buried from public.card_states
          where note_guid = 'n3' order by ord`,
      );
      const undo1 = await tx.query<{ r: { action: string } }>(call('undo_last_review', []));
      const undo2 = await tx.query<{ r: { action: string } }>(call('undo_last_review', []));
      const after = await tx.query(
        `select ord, flag, suspended from public.card_states where note_guid = 'n3' order by ord`,
      );
      return {
        buried: n.rows[0]!.r,
        state: state.rows,
        undone: [undo1.rows[0]!.r.action, undo2.rows[0]!.r.action],
        after: after.rows,
      };
    });
    expect(r.buried).toBe(1);
    expect(r.state).toEqual([
      { ord: 0, flag: 4, suspended: false, buried: true },
      { ord: 1, flag: 0, suspended: true, buried: false },
    ]);
    expect(r.undone).toEqual(['bury_note', 'suspend_card']);
    expect(r.after).toEqual([{ ord: 0, flag: 4, suspended: false }]);
  });

  it('validates what it saves', async () => {
    const bad = answer('n4', { state: { ...answer('n4').state, difficulty: 11 } });
    await expect(
      asUser(db, ANA, (tx) => tx.query(call('record_review', [0]), [bad])),
    ).rejects.toThrow(/check constraint/);
    const late = answer('n4', {
      state: { ...answer('n4').state, lastReview: '2020-01-01T00:00:00Z' },
    });
    await expect(
      asUser(db, ANA, (tx) => tx.query(call('record_review', [0]), [late])),
    ).rejects.toThrow(/invalid_time/);
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(call('set_flag', [0, 1]), [{ noteGuid: 'n4', ord: 0, deckId: DECK }, 9]),
      ),
    ).rejects.toThrow(/invalid_flag/);
  });
});

describe('each user only their own', () => {
  it('another user sees and undoes nothing of Ana’s', async () => {
    await asUser(db, ANA, (tx) => tx.query(call('record_review', [0]), [answer('n5')]));
    const r = await asUser(db, BETO, async (tx) => {
      const cards = await tx.query('select * from public.card_states');
      const log = await tx.query('select * from public.review_log');
      const undo = await tx.query<{ r: unknown }>(call('undo_last_review', []));
      return [cards.rows.length, log.rows.length, undo.rows[0]!.r];
    });
    expect(r).toEqual([0, 0, null]);
    // Nor can he change or delete her rows by hand (since plan step 1.2, nobody writes them directly).
    for (const sql of [
      `update public.card_states set reps = 99 where user_id = '${ANA.sub}'`,
      `delete from public.review_log where user_id = '${ANA.sub}'`,
    ]) {
      await expect(asUser(db, BETO, (tx) => tx.query(sql))).rejects.toThrow(/permission denied/);
    }
    const ana = await db.query<{ n: number }>(
      `select count(*)::int as n from public.review_log where user_id = $1 and note_guid = 'n5'`,
      [ANA.sub],
    );
    expect(ana.rows[0]!.n).toBe(1);
  });

  it('cannot write rows on behalf of someone else', async () => {
    await expect(
      asUser(db, BETO, (tx) =>
        tx.query(
          `insert into public.card_states (user_id, note_guid, ord, deck_id) values ($1, 'x', 0, '1')`,
          [ANA.sub],
        ),
      ),
      // Since plan step 1.2 nobody writes card states directly, not even their own.
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, BETO, (tx) =>
        tx.query(`insert into public.user_presets (user_id, name, config) values ($1, 'x', '{}')`, [
          ANA.sub,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('an account from another domain can do nothing, even with a session', async () => {
    await expect(
      asUser(db, INTRUDER, (tx) => tx.query(call('record_review', [0]), [answer('z')])),
    ).rejects.toThrow(/not_allowed/);
    await expect(
      asUser(db, INTRUDER, (tx) =>
        tx.query(`insert into public.study_preferences (time_zone) values ('UTC')`),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(db, INTRUDER, (tx) => tx.query(call('undo_last_review', []))),
    ).rejects.toThrow(/not_allowed/);
  });

  it('anon can do nothing', async () => {
    for (const sql of [
      'select * from public.card_states',
      'select * from public.review_log',
      'select * from public.user_presets',
      'select * from public.deck_settings',
      'select * from public.study_preferences',
      'select public.undo_last_review()',
    ]) {
      await expect(asUser(db, null, (tx) => tx.query(sql))).rejects.toThrow(/permission denied/);
    }
  });

  it('nobody with a session can update the log or truncate the tables', async () => {
    for (const sql of [
      'update public.review_log set rating = 4',
      'truncate public.card_states',
      'truncate public.review_log',
      'truncate public.user_presets cascade',
      // Supabase grants everything on new sequences too: the log's ids cannot be moved back.
      `select setval('public.review_log_id_seq', 1)`,
      `select nextval('public.review_log_id_seq')`,
    ]) {
      await expect(asUser(db, ANA, (tx) => tx.query(sql))).rejects.toThrow(/permission denied/);
    }
  });

  it('undo cannot be pointed at someone else’s card: nobody writes log or undo rows by hand', async () => {
    await asUser(db, BETO, (tx) => tx.query(call('record_review', [0]), [answer('b1')]));
    // Since plan step 1.2 the log and undo rows are written only by the functions, which always write the
    // caller's own: a row that claims to have been Beto’s card cannot even be written.
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(
          `insert into public.review_log (action, note_guid, ord, deck_id, phase_before, phase_after)
           values ('flag', 'b1', 0, $1, 'learning', 'learning')`,
          [DECK],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(
          `insert into public.review_undo (log_id, action_id, state_before)
           select max(id), gen_random_uuid(), $1 from public.review_log`,
          [{ user_id: BETO.sub, note_guid: 'b1', ord: 0, deck_id: DECK, flag: 7 }],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    // Nor can the helpers be called to log a change in someone else’s name.
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(`select public.change_card(gen_random_uuid(), 'flag', $1, now(), '{"flag": 7}')`, [
          { noteGuid: 'b1', ord: 0, deckId: DECK },
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
    await asUser(db, ANA, (tx) => tx.query(call('undo_last_review', [])));
    const beto = await db.query<{ phase: string; flag: number; suspended: boolean }>(
      `select phase, flag, suspended from public.card_states where user_id = $1 and note_guid = 'b1'`,
      [BETO.sub],
    );
    expect(beto.rows).toEqual([{ phase: 'learning', flag: 0, suspended: false }]);
  });
});

describe('in the order it is pasted into Supabase (after the invite list)', () => {
  let pasted: PGlite;
  const INVITED = { sub: '00000000-0000-4000-8000-0000000000d1', email: 'invitada@ug.uchile.cl' };
  const UNINVITED = { sub: '00000000-0000-4000-8000-0000000000d2', email: 'otro@ug.uchile.cl' };

  beforeAll(async () => {
    pasted = await createDatabase('users', [
      '20261031000000_initial.sql',
      '20261101000100_invites.sql',
      '20261101000200_study.sql',
    ]);
    await pasted.query(`insert into public.invited_emails (email, list) values ($1, 'Equipo')`, [
      INVITED.email,
    ]);
    for (const u of [INVITED, UNINVITED]) {
      await pasted.query(`insert into auth.users (id, email) values ($1, $2)`, [u.sub, u.email]);
    }
  });

  it('an invited account studies; one of the domain that is not invited can do nothing', async () => {
    const r = await asUser(pasted, INVITED, async (tx) => {
      await tx.query(call('record_review', [0]), [answer('i1')]);
      return tx.query<{ phase: string }>('select phase from public.card_states');
    });
    expect(r.rows).toEqual([{ phase: 'learning' }]);
    await expect(
      asUser(pasted, UNINVITED, (tx) => tx.query(call('record_review', [0]), [answer('u1')])),
    ).rejects.toThrow(/not_allowed/);
    await expect(
      asUser(pasted, UNINVITED, (tx) =>
        tx.query(`insert into public.user_presets (name, config) values ('x', '{}')`),
      ),
    ).rejects.toThrow(/row-level security/);
    const seen = await asUser(pasted, UNINVITED, (tx) =>
      tx.query('select * from public.card_states'),
    );
    expect(seen.rows).toEqual([]);
  });

  it('an account that is no longer invited stops at once', async () => {
    // `db` applies every migration in the order of their names (the same order they were pasted in).
    await db.query('update public.access_settings set open_to_domain = false');
    try {
      await expect(
        asUser(db, ANA, (tx) => tx.query(call('record_review', [0]), [answer('closed')])),
      ).rejects.toThrow(/not_allowed/);
      const seen = await asUser(db, ANA, (tx) => tx.query('select * from public.card_states'));
      expect(seen.rows).toEqual([]);
    } finally {
      await db.query('update public.access_settings set open_to_domain = true');
    }
  });
});

describe('presets, deck settings and preferences', () => {
  it('a preset of one’s own, a deck that uses it, and back when the preset is deleted', async () => {
    const r = await asUser(db, ANA, async (tx) => {
      const p = await tx.query<{ id: string }>(
        `insert into public.user_presets (name, config) values ('Intensivo', '{"newPerDay": 50}') returning id`,
      );
      const id = p.rows[0]!.id;
      await tx.query(`insert into public.deck_settings (deck_id, preset_id) values ($1, $2)`, [
        DECK,
        id,
      ]);
      const before = await tx.query('select deck_id from public.deck_settings');
      await tx.query('delete from public.user_presets where id = $1', [id]);
      const after = await tx.query('select deck_id from public.deck_settings');
      return [before.rows.length, after.rows.length];
    });
    expect(r).toEqual([1, 0]);
  });

  it('a replacement of an author’s preset, only one per preset', async () => {
    await asUser(db, ANA, (tx) =>
      tx.query(
        `insert into public.user_presets (name, replaces, config) values ('Default', 'Default', '{}')`,
      ),
    );
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(
          `insert into public.user_presets (name, replaces, config) values ('Otra', 'Default', '{}')`,
        ),
      ),
    ).rejects.toThrow(/unique/);
  });

  it('a deck uses either a preset of the user or one of the author, not both', async () => {
    await expect(
      asUser(db, ANA, (tx) => tx.query(`insert into public.deck_settings (deck_id) values ('1')`)),
    ).rejects.toThrow(/check constraint/);
    await asUser(db, ANA, (tx) =>
      tx.query(`insert into public.deck_settings (deck_id, author_preset) values ('1', 'Extras')`),
    );
  });

  it('cannot point a deck to someone else’s preset', async () => {
    const p = await asUser(db, BETO, (tx) =>
      tx.query<{ id: string }>(
        `insert into public.user_presets (name, config) values ('De Beto', '{}') returning id`,
      ),
    );
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(`insert into public.deck_settings (deck_id, preset_id) values ('2', $1)`, [
          p.rows[0]!.id,
        ]),
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it('preferences: the zone of the browser and the hour the day starts', async () => {
    const r = await asUser(db, ANA, async (tx) => {
      await tx.query(
        `insert into public.study_preferences (time_zone) values ('America/Santiago')`,
      );
      await tx.query(`update public.study_preferences set day_starts_at = 5`);
      return tx.query(
        'select time_zone, day_starts_at, learn_ahead_minutes from public.study_preferences',
      );
    });
    expect(r.rows).toEqual([
      { time_zone: 'America/Santiago', day_starts_at: 5, learn_ahead_minutes: 20 },
    ]);
    await expect(
      asUser(db, ANA, (tx) => tx.query(`update public.study_preferences set day_starts_at = 24`)),
    ).rejects.toThrow(/check constraint/);
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(`update public.study_preferences set time_zone = 'x; drop table'`),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
