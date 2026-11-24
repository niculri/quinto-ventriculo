// Each refusal the code tells apart, raised by the real SQL in PGlite and read by `databaseError()` of
// @qv/schema/database as PostgREST hands it over ({ code, message, details, hint }).
import type { PGlite } from '@electric-sql/pglite';
import { databaseError } from '@qv/schema/database';
import type { DbReason, SqlState } from '@qv/schema/database';
import { REPORT_LIMITS } from '@qv/schema';
import { beforeAll, describe, expect, it } from 'vitest';
import { OWNER_EMAIL, asUser, createDatabase } from '../pglite';

type Claims = { sub: string; email: string; session_id?: string };

let db: PGlite;
let owner: Claims;
let second: Claims;
let ana: Claims;
let n = 0;

async function person(email: string, invite = true, session = true): Promise<Claims> {
  n += 1;
  const sub = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [sub, email]);
  if (invite)
    await db.query(`insert into public.invited_emails (email, list) values ($1, 'Curso')`, [email]);
  if (!session) return { sub, email };
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.sessions (user_id) values ($1) returning id`,
    [sub],
  );
  await db.query(
    `insert into auth.refresh_tokens (token, user_id, session_id) values ($1, $2, $3)`,
    [`rt-${rows[0]!.id}`, sub, rows[0]!.id],
  );
  return { sub, email, session_id: rows[0]!.id };
}

/** The error of `sql` as the user, as PostgREST would send it to supabase-js. */
async function refusal(claims: Claims | null, sql: string, params: unknown[] = []) {
  try {
    await asUser(db, claims, (tx) => tx.query(sql, params));
  } catch (e) {
    const pg = e as { code?: string; message: string; detail?: string; hint?: string };
    return databaseError({ code: pg.code, message: pg.message, details: pg.detail, hint: pg.hint });
  }
  throw new Error(`no refusal: ${sql}`);
}

function expectReason(e: ReturnType<typeof databaseError>, reason: DbReason, code: SqlState) {
  expect(e.says(reason), e.message).toBe(true);
  expect(e.hasCode(code), `${e.message}: ${String(e.code)}`).toBe(true);
}

const json = (v: unknown) => JSON.stringify(v);
const card = (noteGuid: string) => ({ noteGuid, ord: 0, deckId: '1001' });
const answer = (expectedUpdatedAt: string | null) => {
  const now = new Date().toISOString();
  return {
    ...card('n1'),
    expectedUpdatedAt,
    rating: 3,
    queueBefore: 'new',
    interval: -600,
    lastInterval: 0,
    durationMs: 1000,
    state: {
      phase: 'learning',
      interday: false,
      remainingSteps: 1,
      due: now,
      interval: 0,
      stability: 2,
      difficulty: 2,
      reps: 1,
      lapses: 0,
      lastReview: now,
      suspended: false,
      leech: false,
    },
    bury: [],
    buriedUntil: null,
  };
};
const report = (id: string, comment = 'Está mal.') => ({
  kind: 'card',
  id,
  category: 'fact',
  comment,
  location: { deckId: '1001', path: '/anki/browse', title: 'Tarjeta' },
});
const send = (c: Claims, p: unknown) =>
  asUser(db, c, (tx) => tx.query('select public.report_content($1::jsonb)', [json(p)]));

beforeAll(async () => {
  db = await createDatabase('users');
  owner = await person(OWNER_EMAIL, false);
  second = await person('segunda@ug.uchile.cl');
  await db.query(`insert into public.admin_emails (email) values ($1)`, [second.email]);
  ana = await person('ana.errores@ug.uchile.cl');
});

describe('study', () => {
  it('card_changed (P0001)', async () => {
    await asUser(db, ana, (tx) => tx.query('select public.record_review($1)', [answer(null)]));
    const e = await refusal(ana, 'select public.record_review($1)', [answer(null)]);
    expectReason(e, 'card_changed', 'P0001');
  });

  it('undo_refused (P0001)', async () => {
    const e = await refusal(ana, 'select public.undo_last_review(expected => $1::jsonb)', [
      json({ noteGuid: 'nadie', ord: 0, deckId: '1', action: 'answer' }),
    ]);
    expectReason(e, 'undo_refused', 'P0001');
  });

  it('quota_exceeded of the day (P0001, details «changes») and of the cards', async () => {
    await db.query(
      `update public.user_quotas set day = (now() at time zone 'UTC')::date, changes_today = 50000
        where user_id = $1`,
      [ana.sub],
    );
    const p = { since: 0, upTo: 1, changes: [] };
    const day = await refusal(ana, 'select public.reconcile_cards($1::jsonb)', [json(p)]);
    expectReason(day, 'quota_exceeded', 'P0001');
    expect(day.details).toBe('changes');
    await db.query(
      `update public.user_quotas set changes_today = 0, cards = 200000 where user_id = $1`,
      [ana.sub],
    );
    const cards = await refusal(ana, 'select public.record_review($1)', [
      { ...answer(null), noteGuid: 'n2' },
    ]);
    expectReason(cards, 'quota_exceeded', 'P0001');
    expect(cards.details).not.toBe('changes');
    await db.query(`update public.user_quotas set cards = 1 where user_id = $1`, [ana.sub]);
  });

  it('a refused batch of practice: not invited (42501), invalid (22023)', async () => {
    const outsider = await person('sin.invitacion@ug.uchile.cl', false);
    const sql = 'select public.record_practice($1::jsonb)';
    const decks = { decks: [{ deckId: '1001', n: 2 }] };
    expect((await refusal(outsider, sql, [json(decks)])).hasCode('42501')).toBe(true);
    const bad = await refusal(ana, sql, [json({ decks: [{ deckId: 'x', n: 2 }] })]);
    expect(bad.hasCode('22023')).toBe(true);
  });

  it('a batch of practice past the day’s changes (P0001, the third refusal of a batch)', async () => {
    await db.query(
      `update public.user_quotas set day = (now() at time zone 'UTC')::date, changes_today = 50000
        where user_id = $1`,
      [ana.sub],
    );
    const capped = await refusal(ana, 'select public.record_practice($1::jsonb)', [
      json({ decks: [{ deckId: '1001', n: 2 }] }),
    ]);
    expectReason(capped, 'quota_exceeded', 'P0001');
    expect(capped.details).toBe('changes');
    await db.query(`update public.user_quotas set changes_today = 0 where user_id = $1`, [ana.sub]);
  });
});

describe('account', () => {
  it('session_closed (28000), email_mismatch and admin_account', async () => {
    const closed = await refusal(
      { sub: ana.sub, email: ana.email },
      `select public.accept_legal('3', '4')`,
    );
    expectReason(closed, 'session_closed', '28000');
    const sql = 'select public.request_account_deletion($1)';
    expectReason(await refusal(ana, sql, ['otra@ug.uchile.cl']), 'email_mismatch', '22023');
    expectReason(await refusal(owner, sql, [OWNER_EMAIL]), 'admin_account', '42501');
  });
});

describe('access', () => {
  const setAdmin = 'select public.admin_set_admin($1::jsonb)';
  const invite = 'select public.admin_invite_emails($1::jsonb)';

  it('owner_only, owner_stays, not_invited and admin_only', async () => {
    const p = (email: string, admin: boolean) => [json({ email, admin })];
    expectReason(await refusal(second, setAdmin, p(ana.email, true)), 'owner_only', '42501');
    expectReason(await refusal(owner, setAdmin, p(OWNER_EMAIL, false)), 'owner_stays', '42501');
    expectReason(
      await refusal(owner, setAdmin, p('nadie@ug.uchile.cl', true)),
      'not_invited',
      'P0002',
    );
    const student = await refusal(ana, 'select public.admin_access_report()');
    expectReason(student, 'admin_only', '42501');
    // Not one of the reasons before 42501 in the panel's reading.
    expect(student.says('owner_only') || student.says('session_closed')).toBe(false);
  });

  it('an administrator whose session closed (28000), in the access and the reports panels', async () => {
    const closed = { sub: owner.sub, email: owner.email };
    for (const fn of ['admin_access_report', 'admin_report_queue']) {
      expectReason(await refusal(closed, `select public.${fn}()`), 'session_closed', '28000');
    }
  });

  it('a list that does not exist (P0002) and the refusals of invite_emails() (22023)', async () => {
    const gone = await refusal(owner, 'select public.admin_remove_invites($1::jsonb)', [
      json({ list: 'No existe' }),
    ]);
    expect(gone.hasCode('P0002')).toBe(true);
    const many = Array.from({ length: 501 }, (_, i) => `a${i}@ug.uchile.cl`);
    expectReason(
      await refusal(owner, invite, [json({ emails: many, list: 'L' })]),
      'too_many_emails',
      '22023',
    );
    expectReason(
      await refusal(owner, invite, [json({ emails: [], list: '' })]),
      'list_required',
      '22023',
    );
    const note = 'x'.repeat(201);
    expectReason(
      await refusal(owner, invite, [json({ emails: [], list: 'L', note })]),
      'note_too_long',
      '22023',
    );
  });
});

describe('reports', () => {
  it('the place, the day, the block, nothing open and the administrator', async () => {
    const beto = await person('beto.errores@ug.uchile.cl');
    for (let i = 0; i < REPORT_LIMITS.openPerPlace; i++)
      await send(beto, report('p1:0', `Uno ${i}`));
    const place = await refusal(beto, 'select public.report_content($1::jsonb)', [
      json(report('p1:0')),
    ]);
    expectReason(place, 'report_place_limit', 'P0001');
    for (let i = 0; i < REPORT_LIMITS.perDay - REPORT_LIMITS.openPerPlace; i++) {
      await send(beto, report(`d${REPORT_LIMITS.openPerPlace + i}:0`));
    }
    const day = await refusal(beto, 'select public.report_content($1::jsonb)', [
      json(report('z:0')),
    ]);
    expectReason(day, 'report_daily_limit', 'P0001');

    const block = 'select public.admin_set_report_block($1::jsonb)';
    await asUser(db, owner, (tx) => tx.query(block, [json({ user_id: ana.sub, blocked: true })]));
    const blocked = await refusal(ana, 'select public.report_content($1::jsonb)', [
      json(report('b:0')),
    ]);
    expectReason(blocked, 'report_blocked', 'P0001');
    expectReason(
      await refusal(owner, block, [json({ user_id: owner.sub, blocked: true })]),
      'admin_stays',
      '42501',
    );

    const resolve = {
      kind: 'card',
      target_id: 'nada:0',
      status: 'fixed',
      note: null,
      fixed_version: null,
    };
    expectReason(
      await refusal(owner, 'select public.admin_resolve_reports($1::jsonb)', [json(resolve)]),
      'nothing_open',
      'P0002',
    );
    const reopen = { resolution_id: '00000000-0000-4000-8000-00000000dead' };
    expectReason(
      await refusal(owner, 'select public.admin_reopen_reports($1::jsonb)', [json(reopen)]),
      'nothing_to_reopen',
      'P0002',
    );
    expectReason(await refusal(ana, 'select public.admin_report_queue()'), 'admin_only', '42501');
  });
});

describe('what PGlite cannot raise', () => {
  it('PostgREST without the function (PGRST202), as supabase-js hands it over', () => {
    const e = databaseError({
      code: 'PGRST202',
      message:
        'Could not find the function public.card_states_of_decks(p_deck_ids) in the schema cache',
      details: 'Searched for the function public.card_states_of_decks with parameter p_deck_ids',
      hint: null,
    });
    expect(e.hasCode('PGRST202')).toBe(true);
    expect(e.says('card_changed')).toBe(false);
  });
});

describe('the content database', () => {
  it('a stale draft (P0409) and a refused publication (P0422 «publish_release: <reason>»)', async () => {
    const content = await createDatabase('content');
    const run = async (sql: string, params: unknown[]) => {
      try {
        await content.transaction(async (tx) => {
          await tx.exec('set local role service_role');
          await tx.query(sql, params);
        });
      } catch (e) {
        const pg = e as { code?: string; message: string; detail?: string };
        return databaseError({ code: pg.code, message: pg.message, details: pg.detail });
      }
      throw new Error(`no refusal: ${sql}`);
    };
    const stale = await run('select public.set_release_mark($1, $2, true, $3)', [
      '0'.repeat(32),
      'phone',
      'x',
    ]);
    expect(stale.hasCode('P0409')).toBe(true);
    const refused = await run('select public.publish_release($1::jsonb)', [json({})]);
    expect(refused.hasCode('P0422')).toBe(true);
    expect(refused.refusal('publish_release')).toBe('invalid');
    expect(refused.refusal('revert_release')).toBeNull();
    expect(refused.details).toBe('p needs fingerprint, title, schemaVersion, checks and by');
    const revert = await run('select public.revert_release($1::jsonb)', [json({})]);
    expect(revert.hasCode('P0422')).toBe(true);
    expect(revert.refusal('revert_release')).toBe('invalid');
    expect(revert.details).toBe('p needs id and by');
  });
});
