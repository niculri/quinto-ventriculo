// The users database's functions that take or give `jsonb` against their contracts in @qv/schema/user: each one is
// run with representative data and its real answer has to fit the schema (and what is sent, the arguments' schema).
import type { PGlite } from '@electric-sql/pglite';
import {
  AnswerTodayRow,
  CardLogRow,
  CardStateRow,
  RatedInDeckRow,
  RatedRow,
  USERS_RPC,
} from '@qv/schema/user';
import type { RpcArgs, RpcResult } from '@qv/schema/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OWNER_EMAIL, asUser, createDatabase } from '../pglite';

type Name = keyof typeof USERS_RPC;
type Claims = { sub: string; email: string; session_id: string };

let db: PGlite;
let owner: Claims;
let ana: Claims;
let beto: Claims;
const DECK = '1001';
const ran = new Set<Name>();

async function person(sub: string, email: string, invite: boolean): Promise<Claims> {
  await db.query(`insert into auth.users (id, email, last_sign_in_at) values ($1, $2, now())`, [
    sub,
    email,
  ]);
  if (invite) {
    await db.query(`insert into public.invited_emails (email, list) values ($1, 'Curso')`, [email]);
  }
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

/** The function's arguments by name with their SQL types, and its return type, from the catalog. */
async function signature(fn: string) {
  const { rows } = await db.query<{ names: string[] | null; types: string; returns: string }>(
    `select proargnames as names, oidvectortypes(proargtypes) as types, prorettype::regtype::text as returns
       from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace`,
    [fn],
  );
  expect(rows, fn).toHaveLength(1);
  const types = rows[0]!.types ? rows[0]!.types.split(', ') : [];
  return {
    arg: new Map((rows[0]!.names ?? []).map((n, i) => [n, types[i]!])),
    returns: rows[0]!.returns,
  };
}

/** Calls `fn` as PostgREST would (named arguments) and checks both sides against its contract. */
async function rpc<K extends Name>(claims: Claims, fn: K, args: RpcArgs<(typeof USERS_RPC)[K]>) {
  const contract = USERS_RPC[fn];
  const sent = contract.args.safeParse(args);
  if (!sent.success) throw new Error(`${fn} (arguments): ${sent.error.message}`);
  const sig = await signature(fn);
  const entries = Object.entries((args ?? {}) as Record<string, unknown>);
  const list = entries.map(([k], i) => `${k} => $${i + 1}::${sig.arg.get(k) ?? 'unknown'}`);
  const params = entries.map(([k, v]) => (sig.arg.get(k) === 'jsonb' ? JSON.stringify(v) : v));
  const { rows } = await asUser(db, claims, (tx) =>
    tx.query<{ r: unknown }>(`select public.${fn}(${list.join(', ')}) as r`, params),
  );
  // PGlite gives a void function's value as ''; PostgREST answers it with no body, null for supabase-js.
  const value = sig.returns === 'void' ? null : rows[0]!.r;
  const got = contract.returns.safeParse(value);
  if (!got.success) {
    throw new Error(`${fn}: ${got.error.message}\n${JSON.stringify(value)}`);
  }
  ran.add(fn);
  return value as RpcResult<(typeof USERS_RPC)[K]>;
}

const card = (noteGuid: string) => ({ noteGuid, ord: 0, deckId: DECK });

function answer(noteGuid: string, expectedUpdatedAt: string | null = null) {
  const now = new Date();
  return {
    ...card(noteGuid),
    expectedUpdatedAt,
    rating: 3 as const,
    queueBefore: 'new' as const,
    interval: -600,
    lastInterval: 0,
    durationMs: 4200,
    rBefore: null,
    cardVersion: 2,
    state: {
      phase: 'learning' as const,
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
    bury: [card('n9')],
    buriedUntil: new Date(now.getTime() + 86_400_000).toISOString(),
  };
}

beforeAll(async () => {
  db = await createDatabase('users');
  owner = await person('00000000-0000-4000-8000-0000000000f1', OWNER_EMAIL, false);
  ana = await person('00000000-0000-4000-8000-0000000000f2', 'ana.contrato@ug.uchile.cl', true);
  beto = await person('00000000-0000-4000-8000-0000000000f3', 'beto.contrato@ug.uchile.cl', true);
});

describe('study', () => {
  it('answers, reads and changes cards', async () => {
    const first = await rpc(ana, 'record_review', { a: answer('n1') });
    await rpc(ana, 'record_review', { a: answer('n1', first.updatedAt) });
    await rpc(ana, 'record_review', { a: answer('n2') });
    const rows = await rpc(ana, 'card_states_of_decks', { p_deck_ids: [DECK] });
    expect(rows.map((r) => r.note_guid)).toEqual(['n1', 'n2', 'n9']);
    expect(await rpc(ana, 'card_states_of_decks', { p_deck_ids: ['9999'] })).toEqual([]);

    const until = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const home = await rpc(ana, 'home_counts', {
      p_deck_ids: [DECK],
      p_until: until,
      p_decay: { [DECK]: 0.5 },
    });
    expect(home.decks?.[0]?.[6].length).toBeGreaterThan(0);
    await rpc(ana, 'home_counts', { p_deck_ids: [DECK], p_until: until });
    expect(await rpc(beto, 'home_counts', { p_deck_ids: [DECK], p_until: until })).toEqual({
      decks: [],
      truncated: false,
    });

    await rpc(ana, 'record_practice', { p: { decks: [{ deckId: DECK, n: 3 }] } });
    expect(await rpc(ana, 'record_practice', { p: { decks: [] } })).toEqual({
      day: null,
      practice: 0,
      capped: false,
    });
    const map = await rpc(ana, 'study_heatmap', { p_deck_ids: [DECK] });
    expect(map.days?.length).toBe(1);
    await rpc(ana, 'study_heatmap', {});
    expect(await rpc(beto, 'study_heatmap', {})).toEqual({ days: [], due: [], tests: [] });
    await rpc(ana, 'study_heatmap', { p_deck_ids: [DECK], p_quiz_ids: ['test-a'] });
    const stats = await rpc(ana, 'my_card_stats', { p_deck_ids: [DECK] });
    expect(stats.days.length).toBe(1);
    await rpc(ana, 'my_card_stats', {});
    expect((await rpc(beto, 'my_card_stats', {})).hardest).toEqual([]);

    const until2 = new Date(Date.now() + 86_400_000).toISOString();
    expect(await rpc(ana, 'bury_cards', { cards: [card('n2')], until: until2, note: true })).toBe(
      1,
    );
    await rpc(ana, 'unbury_cards', { cards: [card('n2')] });
    await rpc(ana, 'suspend_cards', { cards: [card('n2')] });
    await rpc(ana, 'unsuspend_cards', { cards: [card('n2')] });
    await rpc(ana, 'set_flag', { card: card('n1'), flag: 2 });
    await rpc(ana, 'set_flags', { cards: [card('n1'), card('n2')], flag: 0 });
    await rpc(ana, 'forget_cards', { cards: [card('n2')], reset_counts: true });
  });

  it('saves the preferences as a patch and gives them back whole', async () => {
    const prefs = await rpc(ana, 'save_study_preferences', {
      p: { fullAnki: true, semester: 2, dismissed: { add: ['tip-search'], remove: [] } },
    });
    expect(prefs).toMatchObject({ fullAnki: true, semester: 2, dismissed: ['tip-search'] });
  });

  it('undoes and reconciles', async () => {
    const undone = await rpc(ana, 'undo_last_review', undefined);
    expect(undone?.action).toBe('forget');
    const flags = await rpc(ana, 'undo_last_review', {
      expected: { ...card('n1'), action: 'flag' },
    });
    expect(flags?.noteGuid).toBe('n1');
    await rpc(beto, 'undo_last_review', undefined);
    const changes = [{ noteGuid: 'n1', ord: 0, deckId: null }];
    const r = await rpc(ana, 'reconcile_cards', { p: { since: 0, upTo: 7, changes } });
    expect(r).toEqual({ applied: true, syncedTo: 7, changed: 1 });
    await rpc(ana, 'reconcile_cards', { p: { since: 3, upTo: 9, changes: [] } });
    // A retired card comes with its moment.
    const rows = await rpc(ana, 'card_states_of_decks', { p_deck_ids: [DECK] });
    expect(rows.find((x) => x.note_guid === 'n1')?.retired_at).toEqual(expect.any(String));
  });
});

describe('table reads', () => {
  // As PostgREST gives a `select`: each row as JSON (timestamps as text).
  const rows = (claims: Claims, select: string) =>
    asUser(db, claims, async (tx) => {
      const r = await tx.query<{ r: unknown[] }>(
        `select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as r from (${select}) t`,
      );
      return r.rows[0]!.r;
    });
  const LOG = 'from public.review_log where rating is not null';

  it('fit the row schemas', async () => {
    const cases = [
      [CardStateRow, 'select * from public.card_states'],
      [
        CardLogRow,
        `select action, reviewed_at, rating, queue_before, phase_before, phase_after, interval, stability_after,
                difficulty_after, duration_ms from public.review_log`,
      ],
      [RatedRow, `select note_guid, ord, rating, reviewed_at ${LOG}`],
      [RatedInDeckRow, `select note_guid, ord, deck_id, rating, reviewed_at ${LOG}`],
      [AnswerTodayRow, `select deck_id, queue_before ${LOG}`],
    ] as const;
    for (const [schema, select] of cases) {
      const got = await rows(ana, select);
      expect(got.length, select).toBeGreaterThan(0);
      for (const row of got) {
        const r = schema.safeParse(row);
        if (!r.success) throw new Error(`${select}: ${r.error.message}`);
      }
    }
  });
});

describe('practice tests', () => {
  it('saves a round, an answer and the end', async () => {
    const roundInfo = {
      id: '00000000-0000-4000-8000-00000000a001',
      origin: 'cover' as const,
      questionCount: 3,
      shuffled: true,
      shuffleOptions: false,
      startedAt: new Date().toISOString(),
      finished: false,
    };
    const step = { quizId: 'test-a', sectionId: 's1', round: { id: roundInfo.id } };
    await rpc(ana, 'save_quiz_progress', { p: { ...step, preferences: { all: true }, roundInfo } });
    const answerInfo = {
      roundId: roundInfo.id,
      questionId: 'q1',
      position: 0,
      chosen: 1,
      correct: true,
      answeredAt: new Date().toISOString(),
    };
    await rpc(ana, 'save_quiz_progress', { p: { ...step, answer: answerInfo } });
    await rpc(ana, 'save_quiz_progress', {
      p: { ...step, round: null, roundInfo: { ...roundInfo, finished: true } },
    });
    const heat = await rpc(ana, 'study_heatmap', { p_quiz_ids: ['test-a'] });
    expect(heat.tests?.[0]?.slice(1)).toEqual(['test-a', 1]);
  });
});

describe('reports', () => {
  it('a report, its resolution, reopening and blocking', async () => {
    const location = {
      deckId: DECK,
      path: '/anki/browse',
      title: 'Tarjeta',
      quote: { exact: 'x' },
    };
    const report = {
      kind: 'card' as const,
      id: 'g1:0',
      code: 'T-XX-C1-01-001',
      version: 2,
      category: 'fact' as const,
      comment: 'Dice 70S y es 80S.',
      location,
    };
    await rpc(ana, 'report_content', { p: report });
    await rpc(beto, 'report_content', { p: { ...report, code: null, version: null } });
    expect(await rpc(ana, 'my_reports', undefined)).toHaveLength(1);
    expect(await rpc(owner, 'my_reports', undefined)).toEqual([]);
    const open = await rpc(owner, 'admin_report_queue', undefined);
    expect(open.open[0]?.reports).toHaveLength(2);
    const done = await rpc(owner, 'admin_resolve_reports', {
      p: { kind: 'card', target_id: 'g1:0', status: 'fixed', note: 'Gracias', fixed_version: 3 },
    });
    const mine = await rpc(ana, 'my_reports', undefined);
    expect(mine[0]?.resolution?.status).toBe('fixed');
    await rpc(owner, 'admin_set_report_block', { p: { user_id: beto.sub, blocked: true } });
    const queue = await rpc(owner, 'admin_report_queue', undefined);
    expect(queue.resolved).toHaveLength(1);
    expect(queue.blocked).toHaveLength(1);
    await rpc(owner, 'admin_reopen_reports', { p: { resolution_id: done.resolution_id } });
    await rpc(owner, 'admin_set_report_block', { p: { user_id: beto.sub, blocked: false } });
  });
});

describe('access and usage', () => {
  it('the report, inviting, naming an administrator and removing', async () => {
    await rpc(owner, 'admin_access_report', undefined);
    const added = await rpc(owner, 'admin_invite_emails', {
      p: { emails: ['nueva@ug.uchile.cl', 'x@gmail.com', 'nueva@ug.uchile.cl'], list: 'Lista B' },
    });
    expect(added.added_emails).toEqual(['nueva@ug.uchile.cl']);
    await rpc(owner, 'admin_invite_emails', { p: { emails: [], list: 'Lista B', note: 'Nota' } });
    await rpc(owner, 'admin_set_admin', { p: { email: 'nueva@ug.uchile.cl', admin: true } });
    await rpc(owner, 'admin_set_admin', { p: { email: 'nueva@ug.uchile.cl', admin: false } });
    const report = await rpc(owner, 'admin_access_report', undefined);
    expect(report.you_are_owner).toBe(true);
    await rpc(owner, 'admin_remove_invites', { p: { emails: ['nadie@ug.uchile.cl'] } });
    await rpc(owner, 'admin_remove_invites', { p: { list: 'Lista B' } });
  });

  it('the usage figures', async () => {
    await rpc(owner, 'admin_usage', { p: { decks: { [DECK]: [null, 'a1', 'c1'] }, quizzes: {} } });
    await rpc(owner, 'admin_usage', {});
  });
});

describe('account', () => {
  it('accepting, entering, the data and the deletion', async () => {
    const versions = { terms_version: '3', privacy_version: '4' };
    expect((await rpc(beto, 'resume_account', versions)).accepted).toBeNull();
    await rpc(beto, 'accept_legal', versions);
    await rpc(beto, 'resume_account', versions);
    await rpc(beto, 'resume_account', {});
    await rpc(ana, 'export_my_data', undefined);
    await rpc(beto, 'request_account_deletion', { confirm_email: beto.email });
  });
});

afterAll(() => {
  // Every contract was run against the SQL.
  expect(Object.keys(USERS_RPC).filter((n) => !ran.has(n as Name))).toEqual([]);
});
