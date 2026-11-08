import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { LEGAL_VERSIONS } from '@qv/schema';
import { asUser, createDatabase } from './pglite';

/**
 * Step 2.3 (…_privacy_and_account.sql): accepting the terms and the privacy policy, downloading one's data and
 * deleting one's account with 7 days to change one's mind. The users' database is the real one, every migration.
 */

const ANA = { sub: '00000000-0000-4000-8000-0000000000d1', email: 'ana.perez@ug.uchile.cl' };
const LUIS = { sub: '00000000-0000-4000-8000-0000000000d2', email: 'luis.soto@ug.uchile.cl' };
const OWNER = { sub: '00000000-0000-4000-8000-0000000000d3', email: 'dueno@ug.uchile.cl' };
const DECK = '2059400110';
const TERMS: string = LEGAL_VERSIONS.terms.version;
const PRIVACY: string = LEGAL_VERSIONS.privacy.version;

type Claims = { sub: string; email: string; session_id?: string };
type Q = Pick<PGlite, 'query'>;

/** A session of Supabase Auth, with its refresh token and the browser it was opened from; its token's claims. */
async function signIn(db: PGlite, user: { sub: string; email: string }): Promise<Claims> {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.sessions (user_id, user_agent, ip) values ($1, 'Firefox de prueba', '200.1.2.3')
     returning id`,
    [user.sub],
  );
  const session = rows[0]!.id;
  await db.query(
    `insert into auth.refresh_tokens (token, user_id, session_id) values ($1, $2, $3)`,
    [`rt-${session}`, user.sub, session],
  );
  await db.query(`update auth.users set last_sign_in_at = now() where id = $1`, [user.sub]);
  return { ...user, session_id: session };
}

const one = async <T>(db: PGlite, claims: Claims | null, sql: string, params: unknown[] = []) =>
  asUser(db, claims, async (tx) => (await tx.query<{ r: T }>(sql, params)).rows[0]!.r);

const status = (db: PGlite, claims: Claims, versions: [string, string] | null = [TERMS, PRIVACY]) =>
  one<string>(
    db,
    claims,
    versions ? 'select public.access_status($1, $2) as r' : 'select public.access_status() as r',
    versions ?? [],
  );
const accept = (db: PGlite, claims: Claims, terms = TERMS, privacy = PRIVACY) =>
  one<{ accepted_at: string }>(db, claims, 'select public.accept_legal($1, $2) as r', [
    terms,
    privacy,
  ]);
/** On entering, as the web does (with the versions of its bundle), or without them. */
const resume = (db: PGlite, claims: Claims, versions: [string, string] | null = [TERMS, PRIVACY]) =>
  one<{
    accepted: { terms_version: string; privacy_version: string; accepted_at: string } | null;
    deletion_cancelled: boolean;
  }>(
    db,
    claims,
    versions ? 'select public.resume_account($1, $2) as r' : 'select public.resume_account() as r',
    versions ?? [],
  );
const exportData = (db: PGlite, claims: Claims) =>
  one<{
    user_id: string;
    account: { email: string };
    identities: unknown[];
    sessions: { user_agent: string | null; ip: string | null }[];
    tables: Record<string, unknown[]>;
  }>(db, claims, 'select public.export_my_data() as r');
const requestDeletion = (db: PGlite, claims: Claims, email: string) =>
  one<{ delete_after: string; sessions_closed: number }>(
    db,
    claims,
    'select public.request_account_deletion($1) as r',
    [email],
  );
const purge = async (db: PGlite) =>
  (
    await db.query<{
      r: { deleted: number; cancelled: number; kept_admins: number; failed: number };
    }>('select public.purge_deleted_accounts() as r')
  ).rows[0]!.r;
/** As if 8 days had gone by: the dates of the request and of the last sign-in go back, as the clock would. */
const sevenDaysLater = async (db: PGlite, user: { sub: string }) => {
  await db.query(
    `update public.account_deletions
        set requested_at = requested_at - interval '8 days', delete_after = delete_after - interval '8 days'
      where user_id = $1`,
    [user.sub],
  );
  await db.query(
    `update auth.users set last_sign_in_at = last_sign_in_at - interval '8 days' where id = $1`,
    [user.sub],
  );
};

/**
 * Every table of the users' database with data of a person: those that point to auth.users, those with a `user_id`
 * (also without a foreign key) and those with an email (any column whose name has «email»). What they are found by is
 * the schema itself, not a list: a new table with personal data is in here at once.
 * Revisión de cero (2.3): it looked only for foreign keys and columns named exactly `email`, so a `user_id` without a
 * foreign key (a log kept apart, for speed) or a `reporter_email` would have been left out of the download and of the
 * deletion without a test failing.
 */
async function personalTables(db: Q) {
  const { rows } = await db.query<{
    table_name: string;
    column_name: string;
    kind: 'id' | 'email';
  }>(
    `select c.relname as table_name, a.attname as column_name, 'id' as kind
       from pg_constraint k
       join pg_class c on c.oid = k.conrelid
       join pg_attribute a on a.attrelid = c.oid and a.attnum = k.conkey[1]
      where k.contype = 'f' and k.confrelid = 'auth.users'::regclass
        and c.relnamespace = 'public'::regnamespace
     union
     select col.table_name, col.column_name,
            case when col.column_name like '%email%' then 'email' else 'id' end
       from information_schema.columns col
       join information_schema.tables t on t.table_schema = col.table_schema and t.table_name = col.table_name
      where col.table_schema = 'public' and t.table_type = 'BASE TABLE'
        and (col.column_name = 'user_id' or col.column_name like '%email%')
      order by 1, 3 desc`,
  );
  // A table with both (profiles) is looked up by its id.
  return rows.filter((r, i) => rows.findIndex((x) => x.table_name === r.table_name) === i);
}

/** How many rows of the person each personal table has (by their id or their email). */
async function rowsOf(db: PGlite, user: { sub: string; email: string }) {
  const counts: Record<string, number> = {};
  for (const t of await personalTables(db)) {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.${t.table_name} where ${t.column_name} = $1`,
      [t.kind === 'id' ? user.sub : user.email],
    );
    counts[t.table_name] = rows[0]!.n;
  }
  return counts;
}

/** The personal tables the download leaves out (has to be none). */
async function missingFromExport(db: PGlite, claims: Claims) {
  const data = await exportData(db, claims);
  const tables = new Set((await personalTables(db)).map((t) => t.table_name));
  return [...tables].filter((t) => !Object.hasOwn(data.tables, t));
}

/** A new card answered «Bien», as the web sends it. */
function answer(noteGuid: string) {
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
  };
}

/** A step of a test with one answer, as the web sends it. */
function quizStep(round: string) {
  return {
    quizId: 'q',
    sectionId: 's',
    round: { id: round, screen: 'question' },
    roundInfo: {
      id: round,
      origin: 'cover',
      questionCount: 2,
      shuffled: false,
      shuffleOptions: false,
      startedAt: new Date().toISOString(),
      finished: false,
    },
    answer: { roundId: round, questionId: 'p1', position: 0, chosen: 1, correct: true },
  };
}

/** A student who used everything: cards, tests, options, a report, an acceptance. */
async function useEverything(db: PGlite, claims: Claims, round: string) {
  const user = { sub: claims.sub };
  await accept(db, claims);
  await asUser(db, claims, async (tx) => {
    await tx.query('select public.record_review($1)', [answer(`n-${claims.sub.slice(-2)}`)]);
    await tx.query('select public.save_quiz_progress($1)', [quizStep(round)]);
    await tx.query(
      `insert into public.card_reports (note_guid, ord, deck_id, card_code, card_version, comment)
       values ('n1', 0, $1, 'T-BC-C2-11-086', 2, 'La respuesta dice 70S y es 80S.')`,
      [DECK],
    );
  });
  await db.query(`insert into public.study_preferences (user_id) values ($1)`, [user.sub]);
  const preset = await db.query<{ id: string }>(
    `insert into public.user_presets (user_id, name, config) values ($1, 'Mío', '{}') returning id`,
    [user.sub],
  );
  await db.query(
    `insert into public.deck_settings (user_id, deck_id, preset_id) values ($1, $2, $3)`,
    [user.sub, DECK, preset.rows[0]!.id],
  );
  await db.query(
    `insert into public.deck_activations (user_id, deck_id, active) values ($1, $2, true)`,
    [user.sub, DECK],
  );
  await db.query(
    `insert into public.assessment_settings (user_id, deck_id, exam_date) values ($1, $2, '2026-11-18')`,
    [user.sub, DECK],
  );
  await db.query(`insert into public.card_sync (user_id, synced_to) values ($1, 3)`, [user.sub]);
  await db.query(
    `insert into public.readings (user_id, note_id, progress) values ($1, 'AP-BC-C2-11', 0.5)`,
    [user.sub],
  );
  await db.query(
    `insert into auth.identities (provider_id, user_id, identity_data, provider, email)
     values ($1, $2, $3, 'google', $4)`,
    [`google-${claims.sub.slice(-2)}`, user.sub, { name: 'Prueba' }, claims.email],
  );
}

async function newDatabase() {
  const db = await createDatabase('users');
  for (const u of [ANA, LUIS, OWNER]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
      u.sub,
      u.email,
      { full_name: u.email.split('@')[0], avatar_url: 'https://x/y.png' },
    ]);
  }
  await db.query(`select public.invite_emails($1)`, [
    { emails: [ANA.email, LUIS.email], list: 'Curso de prueba 2026', by: 'prueba' },
  ]);
  return db;
}

describe('accepting the terms and the privacy policy', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await newDatabase();
  });

  it('without accepting, the Worker does not serve material; once accepted, it does at once', async () => {
    const ana = await signIn(db, ANA);
    expect(await status(db, ana)).toBe('not_accepted');
    const first = await accept(db, ana);
    expect(await status(db, ana)).toBe('allowed');
    // Accepting the same versions again keeps the date of the first time.
    expect((await accept(db, ana)).accepted_at).toBe(first.accepted_at);
    expect(await resume(db, ana)).toEqual({
      accepted: { terms_version: TERMS, privacy_version: PRIVACY, accepted_at: first.accepted_at },
      deletion_cancelled: false,
    });
  });

  it('a new version of either text asks again, once', async () => {
    const ana = await signIn(db, ANA);
    await accept(db, ana);
    expect(await status(db, ana, [`${TERMS}.1`, PRIVACY])).toBe('not_accepted');
    expect(await status(db, ana, [TERMS, `${PRIVACY}.1`])).toBe('not_accepted');
    await accept(db, ana, `${TERMS}.1`, PRIVACY);
    expect(await status(db, ana, [`${TERMS}.1`, PRIVACY])).toBe('allowed');
    expect((await resume(db, ana, [`${TERMS}.1`, PRIVACY])).accepted).toMatchObject({
      terms_version: `${TERMS}.1`,
    });
    expect((await resume(db, ana, null)).accepted).toMatchObject({ terms_version: `${TERMS}.1` });
  });

  it('after a rollback to versions accepted before, entering does not ask again', async () => {
    // Revisión de cero (2.3): with only the versions accepted last, the web of the Worker rolled back saw «1.1 ≠ 1»
    // and showed the popup on every page load.
    const ana = await signIn(db, ANA);
    expect(await status(db, ana)).toBe('allowed');
    expect((await resume(db, ana)).accepted).toMatchObject({
      terms_version: TERMS,
      privacy_version: PRIVACY,
    });
    // Versions never accepted: the ones accepted last (the web says they changed).
    expect((await resume(db, ana, ['7', '7'])).accepted).toMatchObject({
      terms_version: `${TERMS}.1`,
    });
  });

  it('the answers of step 2.1 come first, and a Worker without versions does not look at it', async () => {
    const luis = await signIn(db, LUIS);
    expect(await status(db, luis, null)).toBe('allowed');
    await db.query(`select public.remove_invites($1)`, [{ emails: [LUIS.email] }]);
    expect(await status(db, luis)).toBe('not_invited');
    await db.query(`select public.invite_emails($1)`, [
      { emails: [LUIS.email], list: 'Curso de prueba 2026', by: 'prueba' },
    ]);
    // remove_invites() closed the session of that token.
    expect(await status(db, luis)).toBe('signed_out');
    expect(await status(db, await signIn(db, LUIS))).toBe('not_accepted');
  });

  it('only through the function, only for oneself, only with an open session', async () => {
    const ana = await signIn(db, ANA);
    await expect(
      asUser(db, ana, (tx) =>
        tx.query(
          `insert into public.legal_acceptances (user_id, terms_version, privacy_version) values ($1, '9', '9')`,
          [LUIS.sub],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, ana, (tx) => tx.query('select * from public.legal_acceptances')),
    ).rejects.toThrow(/permission denied/);
    // A token whose session was closed (signed out on another device) cannot accept.
    await expect(accept(db, { ...LUIS, session_id: ana.session_id })).rejects.toThrow(
      /session_closed/,
    );
    await expect(accept(db, { ...ANA })).rejects.toThrow(/session_closed/);
    await expect(
      asUser(db, null, (tx) => tx.query(`select public.accept_legal('1', '1')`)),
    ).rejects.toThrow(/permission denied/);
    await expect(accept(db, ana, 'uno', '1')).rejects.toThrow(/check constraint/);
  });
});

describe('downloading my data', () => {
  let db: PGlite;
  let ana: Claims;
  let luis: Claims;
  beforeAll(async () => {
    db = await newDatabase();
    ana = await signIn(db, ANA);
    luis = await signIn(db, LUIS);
    await useEverything(db, ana, '11111111-1111-4111-8111-1111111111a1');
    await useEverything(db, luis, '11111111-1111-4111-8111-1111111111b2');
  });

  it('brings every table with data of the person', async () => {
    expect(await missingFromExport(db, ana)).toEqual([]);
  });

  it('fails if a new table with personal data is left out of it', async () => {
    const other = await newDatabase();
    const claims = await signIn(other, ANA);
    await other.exec(
      `create table public.study_notes (user_id uuid references auth.users (id) on delete cascade, text text);
       create table public.mailing (email text, sent_at timestamptz);
       create table public.events (user_id uuid, at timestamptz);
       create table public.replies (reporter_email text, body text);`,
    );
    expect((await missingFromExport(other, claims)).sort()).toEqual([
      'events',
      'mailing',
      'replies',
      'study_notes',
    ]);
  });

  it('brings all of theirs and nothing of anybody else', async () => {
    const data = await exportData(db, ana);
    expect(data.user_id).toBe(ANA.sub);
    expect(data.account.email).toBe(ANA.email);
    expect(data.sessions.map((s) => [s.user_agent, s.ip])).toEqual([
      ['Firefox de prueba', '200.1.2.3'],
    ]);
    expect(data.identities).toHaveLength(1);
    const counts = await rowsOf(db, ANA);
    for (const [table, n] of Object.entries(counts)) {
      expect(data.tables[table], table).toHaveLength(n);
    }
    // Every table it has rows in, with them: the study, the tests, the options, the report, the acceptance.
    expect(Object.entries(counts).filter(([, n]) => n === 0)).toEqual([
      ['account_deletions', 0],
      ['admin_emails', 0],
    ]);
    const text = JSON.stringify(data);
    expect(text).not.toContain(LUIS.sub);
    expect(text).not.toContain(LUIS.email);
    expect(text).not.toContain('google-d2');
  });

  it('a closed session, anon or nobody cannot download', async () => {
    await expect(exportData(db, { ...ANA })).rejects.toThrow(/session_closed/);
    // Luis's token with Ana's session: the session is not his.
    await expect(exportData(db, { ...LUIS, session_id: ana.session_id })).rejects.toThrow(
      /session_closed/,
    );
    await expect(
      asUser(db, null, (tx) => tx.query('select public.export_my_data()')),
    ).rejects.toThrow(/permission denied/);
  });

  it('a person removed from the invitations can still download it', async () => {
    await db.query(`select public.remove_invites($1)`, [{ emails: [LUIS.email] }]);
    const again = await signIn(db, LUIS);
    expect((await exportData(db, again)).tables['invited_emails']).toEqual([]);
    expect((await exportData(db, again)).tables['card_states']).toHaveLength(1);
  });

  it('has 30 seconds, not the 8 of the API', async () => {
    const { rows } = await db.query<{ config: string[] }>(
      `select proconfig as config from pg_proc where oid = 'public.export_my_data()'::regprocedure`,
    );
    expect(rows[0]!.config).toContain('statement_timeout=30s');
  });
});

describe('deleting my account', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await newDatabase();
    await db.query(`select public.invite_emails($1)`, [
      { emails: [OWNER.email], list: 'Equipo', by: 'prueba' },
    ]);
  });

  it('asks for the account’s own email', async () => {
    const ana = await signIn(db, ANA);
    await expect(requestDeletion(db, ana, LUIS.email)).rejects.toThrow(/email_mismatch/);
    await expect(requestDeletion(db, ana, 'ana.perez')).rejects.toThrow(/email_mismatch/);
    await expect(requestDeletion(db, ana, '')).rejects.toThrow(/email_mismatch/);
    expect((await db.query('select * from public.account_deletions')).rows).toEqual([]);
    expect(await status(db, ana, null)).toBe('allowed');
  });

  it('nobody asks it for another person: the function only knows the caller', async () => {
    const luis = await signIn(db, LUIS);
    // Luis's token with Ana's email: refused, and Ana's account is untouched.
    await expect(requestDeletion(db, luis, ANA.email)).rejects.toThrow(/email_mismatch/);
    await expect(requestDeletion(db, { ...ANA }, ANA.email)).rejects.toThrow(/session_closed/);
    await expect(
      asUser(db, null, (tx) => tx.query(`select public.request_account_deletion('x')`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, luis, (tx) =>
        tx.query(`insert into public.account_deletions (user_id) values ($1)`, [ANA.sub]),
      ),
    ).rejects.toThrow(/permission denied/);
    expect((await db.query('select * from public.account_deletions')).rows).toEqual([]);
  });

  it('an administrator is refused (they would stay in admin_emails)', async () => {
    const owner = await signIn(db, OWNER);
    await expect(requestDeletion(db, owner, OWNER.email)).rejects.toThrow(/admin_account/);
    expect(await status(db, owner, null)).toBe('allowed');
  });

  it('marks it, closes every session and says until when', async () => {
    const ana = await signIn(db, ANA);
    const phone = await signIn(db, ANA);
    const r = await requestDeletion(db, ana, '  Ana.Perez@UG.uchile.cl ');
    expect(r.sessions_closed).toBeGreaterThanOrEqual(2);
    const days = (Date.parse(r.delete_after) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
    for (const t of [ana, phone]) expect(await status(db, t, null)).toBe('signed_out');
    const left = await db.query<{ n: number }>(
      `select (select count(*) from auth.sessions where user_id = $1)::int
            + (select count(*) from auth.refresh_tokens where user_id = $1::text)::int as n`,
      [ANA.sub],
    );
    expect(left.rows[0]!.n).toBe(0);
    // An old token (still valid up to an hour) does not cancel it: its session is closed.
    await expect(resume(db, ana)).rejects.toThrow(/session_closed/);
    // Before the 7 days the job does nothing.
    expect(await purge(db)).toEqual({ deleted: 0, cancelled: 0, kept_admins: 0, failed: 0 });
  });

  it('signing in again before the 7 days cancels it, and the web is told once', async () => {
    const back = await signIn(db, ANA);
    expect(await resume(db, back)).toMatchObject({ deletion_cancelled: true });
    expect(await resume(db, back)).toMatchObject({ deletion_cancelled: false });
    expect((await db.query('select * from public.account_deletions')).rows).toEqual([]);
  });

  it('the job cancels it too if they signed in and the web did not say so', async () => {
    const ana = await signIn(db, ANA);
    await requestDeletion(db, ana, ANA.email);
    await signIn(db, ANA);
    await sevenDaysLater(db, ANA);
    expect(await purge(db)).toEqual({ deleted: 0, cancelled: 1, kept_admins: 0, failed: 0 });
    expect(await rowsOf(db, ANA)).toMatchObject({ profiles: 1, invited_emails: 1 });
    // The next time the web opens, it says so, and the mark goes.
    expect(await resume(db, await signIn(db, ANA))).toMatchObject({ deletion_cancelled: true });
    expect((await db.query('select * from public.account_deletions')).rows).toEqual([]);
  });

  it('after 7 days, nothing of the person is left; their reports stay without them', async () => {
    const ana = await signIn(db, ANA);
    const luis = await signIn(db, LUIS);
    await useEverything(db, ana, '22222222-2222-4222-8222-2222222222a1');
    await useEverything(db, luis, '22222222-2222-4222-8222-2222222222b2');
    const before = await rowsOf(db, ANA);
    expect(Object.values(before).reduce((a, b) => a + b, 0)).toBeGreaterThan(15);
    const luisBefore = await rowsOf(db, LUIS);

    await requestDeletion(db, await signIn(db, ANA), ANA.email);
    await sevenDaysLater(db, ANA);
    expect(await purge(db)).toEqual({ deleted: 1, cancelled: 0, kept_admins: 0, failed: 0 });

    const after = await rowsOf(db, ANA);
    expect(Object.entries(after).filter(([, n]) => n > 0)).toEqual([]);
    for (const table of ['users', 'sessions', 'refresh_tokens', 'identities']) {
      const column = table === 'users' ? 'id' : 'user_id';
      const cast = table === 'refresh_tokens' ? '::text' : '';
      const { rows } = await db.query<{ n: number }>(
        `select count(*)::int as n from auth.${table} where ${column} = $1${cast}`,
        [ANA.sub],
      );
      expect(rows[0]!.n, table).toBe(0);
    }
    const reports = await db.query<{ user_id: string | null; comment: string }>(
      `select user_id, comment from public.card_reports order by user_id nulls first`,
    );
    expect(reports.rows).toEqual([
      { user_id: null, comment: 'La respuesta dice 70S y es 80S.' },
      { user_id: LUIS.sub, comment: 'La respuesta dice 70S y es 80S.' },
    ]);
    // The administrator still sees the report, without an author.
    const panel = await one<{ reporter_email: string | null }[]>(
      db,
      await signIn(db, OWNER),
      'select coalesce(json_agg(r), $$[]$$::json) as r from public.admin_card_reports() r',
    );
    expect(panel.map((r) => r.reporter_email).sort()).toEqual([LUIS.email, null].sort());
    // Luis is as he was.
    expect(await rowsOf(db, LUIS)).toEqual(luisBefore);
    // Without an invitation, the hook does not let the account be created again.
    const hook = await db.query<{ r: { error?: unknown } }>(
      `select public.hook_before_user_created($1) as r`,
      [{ user: { email: ANA.email } }],
    );
    expect(hook.rows[0]!.r.error).toBeDefined();
  });

  it('an account made an administrator during the 7 days is not deleted', async () => {
    const luis = await signIn(db, LUIS);
    await requestDeletion(db, luis, LUIS.email);
    await db.query(`insert into public.admin_emails (email) values ($1)`, [LUIS.email]);
    await sevenDaysLater(db, LUIS);
    expect(await purge(db)).toEqual({ deleted: 0, cancelled: 0, kept_admins: 1, failed: 0 });
    expect((await rowsOf(db, LUIS))['profiles']).toBe(1);
  });

  it('an account that cannot be deleted does not hold back the others, says why and is tried again', async () => {
    // Revisión de cero (2.3): the run was one transaction, and one account held back every deletion.
    const other = await newDatabase();
    // Something that does not let Ana's auth.users go (as a file of Storage of her own would).
    await other.exec(
      `create table public.blocker (user_id uuid references auth.users (id) on delete restrict);`,
    );
    await other.query(`insert into public.blocker values ($1)`, [ANA.sub]);
    for (const u of [ANA, LUIS]) {
      await requestDeletion(other, await signIn(other, u), u.email);
      await sevenDaysLater(other, u);
    }
    const first = await (
      await other.query<{ r: Record<string, number> }>(
        'select public.purge_deleted_accounts() as r',
      )
    ).rows[0]!.r;
    expect(first).toEqual({ deleted: 1, cancelled: 0, kept_admins: 0, failed: 1 });
    // Luis is gone; Ana is as she was, invitation included, with the error and the date of the attempt.
    const users = await other.query<{ id: string }>(
      `select id from auth.users where id in ($1, $2)`,
      [ANA.sub, LUIS.sub],
    );
    expect(users.rows.map((u) => u.id)).toEqual([ANA.sub]);
    expect(
      (await other.query(`select 1 from public.invited_emails where email = $1`, [ANA.email])).rows,
    ).toHaveLength(1);
    const row = (
      await other.query<{ last_error: string; last_attempt_at: string | null; cancelled_at: null }>(
        `select last_error, last_attempt_at, cancelled_at from public.account_deletions where user_id = $1`,
        [ANA.sub],
      )
    ).rows[0]!;
    expect(row.last_error).toMatch(/^23001: .*blocker_user_id_fkey/);
    expect(row.last_attempt_at).not.toBeNull();
    expect(row.cancelled_at).toBeNull();
    // The next run tries again; once it can, it deletes her.
    await other.query(`delete from public.blocker where user_id = $1`, [ANA.sub]);
    const second = await (
      await other.query<{ r: Record<string, number> }>(
        'select public.purge_deleted_accounts() as r',
      )
    ).rows[0]!.r;
    expect(second).toEqual({ deleted: 1, cancelled: 0, kept_admins: 0, failed: 0 });
    expect(
      (await other.query(`select 1 from auth.users where id = $1`, [ANA.sub])).rows,
    ).toHaveLength(0);
  });

  it('asking again clears the error of an attempt before', async () => {
    const other = await newDatabase();
    await requestDeletion(other, await signIn(other, ANA), ANA.email);
    await other.query(
      `update public.account_deletions set last_error = 'x', last_attempt_at = now() where user_id = $1`,
      [ANA.sub],
    );
    await requestDeletion(other, await signIn(other, ANA), ANA.email);
    const row = (
      await other.query<{ last_error: string | null; last_attempt_at: string | null }>(
        `select last_error, last_attempt_at from public.account_deletions where user_id = $1`,
        [ANA.sub],
      )
    ).rows[0]!;
    expect(row).toEqual({ last_error: null, last_attempt_at: null });
  });

  it('the job runs only as its owner', async () => {
    const owner = await signIn(db, OWNER);
    await expect(
      asUser(db, owner, (tx) => tx.query('select public.purge_deleted_accounts()')),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.transaction(async (tx) => {
        await tx.exec('set local role service_role');
        return tx.query('select public.purge_deleted_accounts()');
      }),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('the profile follows what Google sends (Revisión de cero, 2.3)', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await newDatabase();
  });
  const profile = async () =>
    (
      await db.query<{ name: string | null; avatar_url: string | null }>(
        `select name, avatar_url from public.profiles where id = $1`,
        [ANA.sub],
      )
    ).rows[0]!;
  /** What Supabase Auth does on a sign-in: it writes again the metadata Google sent. */
  const googleSends = (meta: Record<string, unknown>) =>
    db.query(`update auth.users set raw_user_meta_data = $2 where id = $1`, [ANA.sub, meta]);

  it('a name or a photo changed in Google reaches the profile on the next sign-in', async () => {
    expect(await profile()).toEqual({ name: 'ana.perez', avatar_url: 'https://x/y.png' });
    await googleSends({ full_name: 'Ana María Pérez', avatar_url: 'https://x/nueva.png' });
    expect(await profile()).toEqual({ name: 'Ana María Pérez', avatar_url: 'https://x/nueva.png' });
  });

  it('never stops the sign-in, and does not erase what Google stops sending', async () => {
    await googleSends({ full_name: 'A'.repeat(300) });
    expect((await profile()).name).toHaveLength(200);
    expect((await profile()).avatar_url).toBe('https://x/nueva.png');
    await googleSends({ name: 'Ana' });
    expect((await profile()).name).toBe('Ana');
    await googleSends({});
    expect(await profile()).toEqual({ name: 'Ana', avatar_url: 'https://x/nueva.png' });
  });

  it('nobody calls it through the API', async () => {
    const claims = await signIn(db, ANA);
    await expect(
      asUser(db, claims, (tx) => tx.query('select public.sync_profile()')),
    ).rejects.toThrow(/permission denied|trigger functions can only be called as triggers/);
  });
});
