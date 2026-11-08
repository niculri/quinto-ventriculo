import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { OWNER_EMAIL, asUser, createDatabase } from './pglite';

/**
 * Step 2.10: «Acceso» in the administration panel (…_admin_access.sql). An administrator with their session open
 * reads the report, invites and removes with their own token; a student, a closed session or no session cannot; `by`
 * is always the administrator's email, and an administrator is never removed from the panel.
 */

let db: PGlite;
const OWNER = { sub: '00000000-0000-4000-8000-0000000000c1', email: OWNER_EMAIL };
const FRIEND = { sub: '00000000-0000-4000-8000-0000000000c2', email: 'invitado@ug.uchile.cl' };
const SECOND = { sub: '00000000-0000-4000-8000-0000000000c3', email: 'segunda.admin@ug.uchile.cl' };
const ANA = { sub: '00000000-0000-4000-8000-0000000000c4', email: 'ana.perez@ug.uchile.cl' };

type Claims = { sub: string; email: string; session_id?: string };

async function signIn(user: { sub: string; email: string }): Promise<Claims> {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.sessions (user_id) values ($1) returning id`,
    [user.sub],
  );
  const session = rows[0]!.id;
  await db.query(
    `insert into auth.refresh_tokens (token, user_id, session_id) values ($1, $2, $3)`,
    [`rt-${session}`, user.sub, session],
  );
  return { ...user, session_id: session };
}

const call = <T = Record<string, unknown>>(
  claims: Claims | null,
  sql: string,
  args: unknown[] = [],
) => asUser(db, claims, async (tx) => (await tx.query<{ r: T }>(sql, args)).rows[0]!.r);
const report = (c: Claims | null) => call(c, 'select public.admin_access_report() as r');
const invite = (c: Claims | null, p: unknown) =>
  call(c, 'select public.admin_invite_emails($1::jsonb) as r', [JSON.stringify(p)]);
const remove = (c: Claims | null, p: unknown) =>
  call(c, 'select public.admin_remove_invites($1::jsonb) as r', [JSON.stringify(p)]);

let owner: Claims;
let friend: Claims;
let second: Claims;

beforeAll(async () => {
  db = await createDatabase('users');
  for (const u of [OWNER, FRIEND, SECOND, ANA]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u.sub, u.email]);
  }
  // A second administrator (step 2.5), invited in the «Equipo» list.
  await db.query(`insert into public.invited_emails (email, list) values ($1, 'Equipo')`, [
    SECOND.email,
  ]);
  await db.query(`insert into public.admin_emails (email, note) values ($1, 'Segunda')`, [
    SECOND.email,
  ]);
  owner = await signIn(OWNER);
  friend = await signIn(FRIEND);
  second = await signIn(SECOND);
});

describe('who can call them', () => {
  it('a student gets admin_only, and nothing changes', async () => {
    await expect(report(friend)).rejects.toThrow(/admin_only/);
    await expect(invite(friend, { emails: ['x@ug.uchile.cl'], list: 'Intrusos' })).rejects.toThrow(
      /admin_only/,
    );
    await expect(remove(friend, { list: 'Equipo' })).rejects.toThrow(/admin_only/);
    const { rows } = await db.query(`select 1 from public.invited_emails where list = 'Intrusos'`);
    expect(rows).toEqual([]);
    expect(
      (await db.query(`select 1 from public.invited_emails where email = $1`, [OWNER.email])).rows,
    ).toHaveLength(1);
  });

  it('without a session (anon) they cannot even be called', async () => {
    await expect(report(null)).rejects.toThrow(/permission denied/);
    await expect(invite(null, { emails: [], list: 'X' })).rejects.toThrow(/permission denied/);
    await expect(remove(null, { list: 'Equipo' })).rejects.toThrow(/permission denied/);
  });

  it('an administrator whose session was closed gets session_closed (the token lives up to an hour)', async () => {
    const closed = await signIn(OWNER);
    await db.query('delete from auth.sessions where id = $1', [closed.session_id]);
    await expect(report(closed)).rejects.toThrow(/session_closed/);
    await expect(invite(closed, { emails: ['y@ug.uchile.cl'], list: 'Curso' })).rejects.toThrow(
      /session_closed/,
    );
  });

  it('the helper and the functions of step 2.1 stay out of reach of a signed-in person', async () => {
    for (const sql of [
      'select public.require_admin_session()',
      'select public.access_report()',
      `select public.invite_emails('{}'::jsonb)`,
      `select public.remove_invites('{}'::jsonb)`,
    ]) {
      await expect(asUser(db, owner, (tx) => tx.query(sql))).rejects.toThrow(/permission denied/);
    }
  });
});

describe('what an administrator does', () => {
  it('reads the report of step 2.1', async () => {
    const r = await report(owner);
    // Ana has an account and no invitation yet: the panel shows her on top.
    expect(r).toMatchObject({
      open_to_domain: false,
      accounts_without_invite: [{ email: ANA.email, last_sign_in_at: null }],
    });
    expect((r.invited as { email: string }[]).map((i) => i.email)).toContain(OWNER.email);
  });

  it('invites with their own email as `by`, whatever the web sends', async () => {
    const r = await invite(owner, {
      emails: ['Ana.Perez@UG.uchile.cl', 'ana.perez@ug.uchile.cl', 'otro@gmail.com', OWNER.email],
      list: 'Curso de prueba',
      note: 'Primera tanda',
      by: 'otra.persona@ug.uchile.cl',
    });
    expect(r).toMatchObject({
      added: 1,
      already: 1,
      added_emails: ['ana.perez@ug.uchile.cl'],
      already_emails: [OWNER.email],
      rejected: [
        { email: 'ana.perez@ug.uchile.cl', reason: 'repeated' },
        { email: 'otro@gmail.com', reason: 'domain' },
      ],
    });
    const { rows } = await db.query(
      `select list, note, invited_by from public.invited_emails where email = 'ana.perez@ug.uchile.cl'`,
    );
    expect(rows).toEqual([
      { list: 'Curso de prueba', note: 'Primera tanda', invited_by: OWNER.email },
    ]);
  });

  it('the errors of invite_emails() come as they are (no list)', async () => {
    await expect(invite(owner, { emails: ['z@ug.uchile.cl'] })).rejects.toThrow(
      /"list" is required/,
    );
    await expect(invite(owner, ['z@ug.uchile.cl'])).rejects.toThrow(/expected/);
  });

  it('removes a person: their invitation and their sessions; their account and progress stay', async () => {
    const ana = await signIn(ANA);
    const r = await remove(owner, { emails: ['ANA.perez@ug.uchile.cl'] });
    expect(r).toMatchObject({
      removed: ['ana.perez@ug.uchile.cl'],
      not_invited: [],
      kept_admins: [],
      sessions_closed: 1,
    });
    expect(
      (await db.query('select 1 from auth.sessions where id = $1', [ana.session_id])).rows,
    ).toEqual([]);
    expect((await db.query('select 1 from auth.users where id = $1', [ANA.sub])).rows).toHaveLength(
      1,
    );
  });

  it('never removes an administrator, also when asked with include_admins', async () => {
    const r = await remove(owner, { list: 'Equipo', include_admins: true });
    expect(r).toMatchObject({
      removed: [FRIEND.email],
      kept_admins: [OWNER.email, SECOND.email].sort(),
    });
    const { rows } = await db.query<{ email: string }>(
      `select email from public.invited_emails where list = 'Equipo' order by email`,
    );
    expect(rows.map((x) => x.email)).toEqual([OWNER.email, SECOND.email].sort());
    // The administrators keep their sessions; the friend's were closed.
    expect(
      (await db.query('select 1 from auth.sessions where id = $1', [second.session_id])).rows,
    ).toHaveLength(1);
    expect(
      (await db.query('select 1 from auth.sessions where id = $1', [friend.session_id])).rows,
    ).toEqual([]);
    // The second administrator can use the panel too.
    expect(await report(second)).toMatchObject({ open_to_domain: false });
  });

  it('Revisión de cero (2.10): an administrator never removes themself, however their email is written', async () => {
    const r = await remove(owner, { emails: [` ${OWNER.email.toUpperCase()} `] });
    expect(r).toMatchObject({ removed: [], not_invited: [], kept_admins: [OWNER.email] });
    expect(
      (await db.query('select 1 from auth.sessions where id = $1', [owner.session_id])).rows,
    ).toHaveLength(1);
    expect(await report(owner)).toMatchObject({ open_to_domain: false });
  });

  it('Revisión de cero (2.10): an administrator taken out of the invitations (with the SQL) can no longer', async () => {
    // As the owner in the SQL editor: the only way to remove an administrator.
    await db.query(
      `select public.remove_invites('{"emails": ["${SECOND.email}"], "include_admins": true}'::jsonb)`,
    );
    // Their sessions were closed; signing in again, they are not an administrator any more (is_admin() asks for the
    // invitation).
    await expect(report(second)).rejects.toThrow(/session_closed/);
    const again = await signIn(SECOND);
    await expect(report(again)).rejects.toThrow(/admin_only/);
    await expect(invite(again, { emails: ['w@ug.uchile.cl'], list: 'Equipo' })).rejects.toThrow(
      /admin_only/,
    );
  });

  it('a list that does not exist, or both keys, are refused as remove_invites() refuses them', async () => {
    await expect(remove(owner, { list: 'No existe' })).rejects.toThrow(/no list named/);
    await expect(remove(owner, { list: 'Equipo', emails: [] })).rejects.toThrow(/expected/);
    await expect(remove(owner, 'Equipo')).rejects.toThrow(/expected/);
  });
});
