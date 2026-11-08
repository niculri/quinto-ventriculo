import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONTACT_EMAIL } from '@qv/schema';
import { asUser, createDatabase } from './pglite';

/** Steps 2.1 and 2.2: invite lists, removing someone and the report (…_invite_lists.sql). */

let db: PGlite;
const OWNER = { sub: '00000000-0000-4000-8000-0000000000b1', email: 'dueno@ug.uchile.cl' };
const FRIEND = { sub: '00000000-0000-4000-8000-0000000000b2', email: 'invitado@ug.uchile.cl' };
const ANA = { sub: '00000000-0000-4000-8000-0000000000b3', email: 'ana.perez@ug.uchile.cl' };
const LUIS = { sub: '00000000-0000-4000-8000-0000000000b4', email: 'luis@ug.uchile.cl' };
const STRAY = { sub: '00000000-0000-4000-8000-0000000000b5', email: 'sin.invitacion@ug.uchile.cl' };

/** A session of Supabase Auth, with a refresh token; the claims of its access token. */
async function signIn(user: { sub: string; email: string }) {
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

const asService = <T>(fn: (tx: Pick<PGlite, 'query'>) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return fn(tx);
  });

const invite = async (p: unknown) =>
  (await db.query<{ r: Record<string, unknown> }>('select public.invite_emails($1) as r', [p]))
    .rows[0]!.r;
const remove = async (p: unknown) =>
  (await db.query<{ r: Record<string, unknown> }>('select public.remove_invites($1) as r', [p]))
    .rows[0]!.r;
const report = async () =>
  (await db.query<{ r: Record<string, unknown> }>('select public.access_report() as r')).rows[0]!.r;

const allowed = (claims: { sub: string; email: string }) =>
  asUser(db, claims, async (tx) => {
    const { rows } = await tx.query<{ ok: boolean }>('select public.is_allowed_user() as ok');
    return rows[0]!.ok;
  });
/** What the Worker asks (access_status()), as a boolean: only 'allowed' lets the content through. */
const status = (claims: { sub: string; email: string; session_id?: string }) =>
  asUser(db, claims, async (tx) => {
    const { rows } = await tx.query<{ s: string }>('select public.access_status() as s');
    return rows[0]!.s;
  });
const hasAccess = async (claims: { sub: string; email: string; session_id?: string }) =>
  (await status(claims)) === 'allowed';
const sessions = async (user: { sub: string }) => {
  const s = await db.query<{ n: number }>(
    'select count(*)::int as n from auth.sessions where user_id = $1',
    [user.sub],
  );
  const r = await db.query<{ n: number }>(
    'select count(*)::int as n from auth.refresh_tokens where user_id = $1',
    [user.sub],
  );
  return s.rows[0]!.n + r.rows[0]!.n;
};

beforeAll(async () => {
  db = await createDatabase('users');
  for (const u of [OWNER, FRIEND, ANA, LUIS, STRAY]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u.sub, u.email]);
  }
});

describe('the lists of today and open_to_domain', () => {
  it('the two rows of today are the «Equipo» list, and a new row needs its list', async () => {
    const { rows } = await db.query('select email, list from public.invited_emails order by email');
    expect(rows).toEqual([
      { email: 'dueno@ug.uchile.cl', list: 'Equipo' },
      { email: 'invitado@ug.uchile.cl', list: 'Equipo' },
    ]);
    await expect(
      db.query(`insert into public.invited_emails (email) values ('x@ug.uchile.cl')`),
    ).rejects.toThrow(/null value in column "list"/);
    await expect(
      db.query(`insert into public.invited_emails (email, list) values ('x@ug.uchile.cl', ' ')`),
    ).rejects.toThrow(/check constraint/);
  });

  it('no migration opens the site to the whole domain (that is step 4)', async () => {
    const fresh = await createDatabase('users');
    const { rows } = await fresh.query<{ open: boolean; dflt: string }>(
      `select s.open_to_domain as open,
              (select column_default from information_schema.columns
                where table_schema = 'public' and table_name = 'access_settings'
                  and column_name = 'open_to_domain') as dflt
         from public.access_settings s`,
    );
    expect(rows).toEqual([{ open: false, dflt: 'false' }]);
    const folder = join(import.meta.dirname, '..', 'users', 'supabase', 'migrations');
    for (const file of readdirSync(folder)) {
      const sql = readFileSync(join(folder, file), 'utf8').replace(/--[^\n]*/g, '');
      expect(sql, file).not.toMatch(/open_to_domain\s*(=|boolean\s+not\s+null\s+default)\s*true/i);
    }
  });

  it('the hook tells an uninvited account where to write, and the web still recognizes it', async () => {
    const { rows } = await db.query<{ r: { error: { message: string } } }>(
      'select public.hook_before_user_created($1) as r',
      [{ user: { email: 'otra@ug.uchile.cl' } }],
    );
    expect(rows[0]!.r.error.message).toContain(CONTACT_EMAIL);
    expect(rows[0]!.r.error.message).toMatch(/invitad/);
    expect(rows[0]!.r.error.message).not.toMatch(/Nico|Ulriksen/);
  });
});

describe('invite_emails', () => {
  it('normalizes, rejects another domain and what is repeated, and adds the rest to its list', async () => {
    const r = await invite({
      emails: [
        '  Ana.Perez@UG.uchile.cl ',
        'luis@ug.uchile.cl ',
        'ANA.PEREZ@ug.uchile.cl',
        'alguien@gmail.com',
        'otro@ug.uchile.cl.evil.com',
        'Nombre <x@ug.uchile.cl>',
        // A no-break space, a zero-width space and a BOM, as they come pasted from a sheet or a PDF.
        '\u00a0pedro\u200b@ug.uchile.cl\ufeff',
        'a,b@ug.uchile.cl',
        '',
        42,
      ],
      list: 'Curso de prueba 2026',
      note: 'Primer grupo',
      by: 'dueno@ug.uchile.cl',
    });
    expect(r).toEqual({
      added: 3,
      already: 0,
      added_emails: ['ana.perez@ug.uchile.cl', 'luis@ug.uchile.cl', 'pedro@ug.uchile.cl'],
      already_emails: [],
      rejected: [
        { email: 'ana.perez@ug.uchile.cl', reason: 'repeated' },
        { email: 'alguien@gmail.com', reason: 'domain' },
        { email: 'otro@ug.uchile.cl.evil.com', reason: 'domain' },
        { email: 'nombre<x@ug.uchile.cl>', reason: 'domain' },
        { email: 'a,b@ug.uchile.cl', reason: 'invalid' },
        { email: '', reason: 'empty' },
        { email: '42', reason: 'invalid' },
      ],
    });
    const { rows } = await db.query(
      `select email, list, note, invited_by from public.invited_emails where list = 'Curso de prueba 2026'
        order by email`,
    );
    expect(rows).toEqual([
      {
        email: 'ana.perez@ug.uchile.cl',
        list: 'Curso de prueba 2026',
        note: 'Primer grupo',
        invited_by: 'dueno@ug.uchile.cl',
      },
      {
        email: 'luis@ug.uchile.cl',
        list: 'Curso de prueba 2026',
        note: 'Primer grupo',
        invited_by: 'dueno@ug.uchile.cl',
      },
      {
        email: 'pedro@ug.uchile.cl',
        list: 'Curso de prueba 2026',
        note: 'Primer grupo',
        invited_by: 'dueno@ug.uchile.cl',
      },
    ]);
    expect(await allowed(ANA)).toBe(true);
    await db.query(`delete from public.invited_emails where email = 'pedro@ug.uchile.cl'`);
  });

  it('whoever was already there keeps their list and date', async () => {
    const before = await db.query(`select * from public.invited_emails where email = $1`, [
      FRIEND.email,
    ]);
    const r = await invite({ emails: [FRIEND.email], list: 'Otra lista', by: 'dueño' });
    expect(r).toMatchObject({ added: 0, already: 1, already_emails: [FRIEND.email] });
    const after = await db.query(`select * from public.invited_emails where email = $1`, [
      FRIEND.email,
    ]);
    expect(after.rows).toEqual(before.rows);
  });

  it('needs the list and who loads it, and at most 500 per call', async () => {
    await expect(invite({ emails: ['a@ug.uchile.cl'], by: 'x' })).rejects.toThrow(/"list"/);
    await expect(invite({ emails: ['a@ug.uchile.cl'], list: 'L' })).rejects.toThrow(/"by"/);
    await expect(invite({ list: 'L', by: 'x' })).rejects.toThrow(/expected/);
    const many = Array.from({ length: 501 }, (_, i) => `a${i}@ug.uchile.cl`);
    await expect(invite({ emails: many, list: 'L', by: 'x' })).rejects.toThrow(/at most 500/);
    const { rows } = await db.query(`select 1 from public.invited_emails where list = 'L'`);
    expect(rows).toEqual([]);
  });
});

describe('remove_invites', () => {
  it('by email: loses access at once, its sessions are closed, its progress stays', async () => {
    const ana = await signIn(ANA);
    await signIn(ANA);
    const other = await signIn(LUIS);
    await asUser(db, ANA, (tx) =>
      tx.query(`insert into public.readings (note_id, progress) values ('AP-BC-C2-11', 0.5)`),
    );
    expect(await hasAccess(ana)).toBe(true);

    const r = await remove({ emails: [' ANA.perez@ug.uchile.cl', 'nadie@ug.uchile.cl'] });
    expect(r).toEqual({
      removed: ['ana.perez@ug.uchile.cl'],
      not_invited: ['nadie@ug.uchile.cl'],
      kept_admins: [],
      sessions_closed: 2,
      open_to_domain: false,
    });
    expect(await allowed(ANA)).toBe(false);
    expect(await hasAccess(ana)).toBe(false);
    expect(await sessions(ANA)).toBe(0);
    // Somebody else's session is untouched.
    expect(await hasAccess(other)).toBe(true);
    expect(await sessions(LUIS)).toBe(2);
    // The account and the progress are still there (deleting them is step 2.3).
    const kept = await db.query(
      `select (select count(*)::int from auth.users where id = $1) as account,
              (select progress from public.readings where user_id = $1) as progress`,
      [ANA.sub],
    );
    expect(kept.rows).toEqual([{ account: 1, progress: 0.5 }]);
    // RLS: the readings are not visible to her any more.
    const seen = await asUser(db, ANA, (tx) => tx.query('select * from public.readings'));
    expect(seen.rows).toEqual([]);
    // Invited again, everything is back.
    await invite({ emails: [ANA.email], list: 'Curso de prueba 2026', by: 'dueño' });
    const back = await asUser(db, ANA, (tx) => tx.query('select progress from public.readings'));
    expect(back.rows).toEqual([{ progress: 0.5 }]);
  });

  it('by list: every one of it, with their sessions', async () => {
    await signIn(ANA);
    const r = await remove({ list: 'Curso de prueba 2026' });
    expect(r).toMatchObject({
      removed: ['ana.perez@ug.uchile.cl', 'luis@ug.uchile.cl'],
      kept_admins: [],
      sessions_closed: 2,
    });
    expect(await allowed(LUIS)).toBe(false);
    expect(await sessions(LUIS)).toBe(0);
    await expect(remove({ list: 'Curso de prueba 2026' })).rejects.toThrow(/no list named/);
  });

  it('never removes an administrator without "include_admins": true', async () => {
    const owner = await signIn(OWNER);
    await signIn(FRIEND);
    const r = await remove({ list: 'Equipo' });
    expect(r).toMatchObject({
      removed: ['invitado@ug.uchile.cl'],
      kept_admins: ['dueno@ug.uchile.cl'],
      sessions_closed: 1,
    });
    expect(await hasAccess(owner)).toBe(true);
    expect(await sessions(OWNER)).toBe(2);
    expect(await remove({ emails: [OWNER.email] })).toMatchObject({
      removed: [],
      kept_admins: [OWNER.email],
      sessions_closed: 0,
    });
    expect(await allowed(OWNER)).toBe(true);

    expect(await remove({ emails: [OWNER.email], include_admins: true })).toMatchObject({
      removed: [OWNER.email],
      kept_admins: [],
      sessions_closed: 1,
    });
    expect(await allowed(OWNER)).toBe(false);
    await invite({ emails: [OWNER.email, FRIEND.email], list: 'Equipo', by: 'dueño' });
  });

  it('asks for exactly one of emails or list', async () => {
    await expect(remove({})).rejects.toThrow(/expected/);
    await expect(remove({ emails: [], list: 'Equipo' })).rejects.toThrow(/expected/);
    await expect(remove({ emails: 'a@ug.uchile.cl' })).rejects.toThrow(/expected/);
  });

  it('closes the sessions of an asked account that had no invitation', async () => {
    await signIn(STRAY);
    expect(await remove({ emails: [STRAY.email] })).toMatchObject({
      removed: [],
      not_invited: [STRAY.email],
      sessions_closed: 1,
    });
  });
});

describe('access_status', () => {
  it('tells «not invited» from «signed out»: only the first one is told where to write', async () => {
    await invite({ emails: [LUIS.email], list: 'Curso de prueba 2026', by: 'dueño' });
    const luis = await signIn(LUIS);
    expect(await status(luis)).toBe('allowed');
    // Signed out on another device: supabase-js closes every session of the account, still invited.
    await db.query('delete from auth.sessions where user_id = $1', [LUIS.sub]);
    expect(await status(luis)).toBe('signed_out');
    expect(await status({ ...LUIS })).toBe('signed_out');
    // Removed: «not invited» comes first, whatever the session.
    const again = await signIn(LUIS);
    await remove({ emails: [LUIS.email] });
    expect(await status(again)).toBe('not_invited');
    expect(await status({ sub: STRAY.sub, email: STRAY.email })).toBe('not_invited');
  });

  it('needs the session of the token, still open', async () => {
    const owner = await signIn(OWNER);
    expect(await hasAccess(owner)).toBe(true);
    expect(await hasAccess(OWNER)).toBe(false);
    expect(await hasAccess({ ...owner, session_id: 'no-es-un-uuid' })).toBe(false);
    expect(await hasAccess({ ...FRIEND, session_id: owner.session_id })).toBe(false);
    await db.query(
      `update auth.sessions set not_after = now() - interval '1 minute' where id = $1`,
      [owner.session_id],
    );
    expect(await hasAccess(owner)).toBe(false);
    // Deleting the account in Authentication → Users takes its sessions with it.
    const friend = await signIn(FRIEND);
    expect(await hasAccess(friend)).toBe(true);
    await db.query('delete from auth.sessions where user_id = $1', [FRIEND.sub]);
    expect(await hasAccess(friend)).toBe(false);
  });
});

describe('access_report', () => {
  it('every invitation with its account, the accounts without one, the lists and the setting', async () => {
    await db.query(`update auth.users set last_sign_in_at = '2026-11-08T12:00:00Z' where id = $1`, [
      OWNER.sub,
    ]);
    await invite({ emails: ['sin.cuenta@ug.uchile.cl'], list: 'Prueba', by: 'dueño' });
    const r = await report();
    expect(r['open_to_domain']).toBe(false);
    expect(r['lists']).toEqual([
      { list: 'Equipo', invited: 2, with_account: 2 },
      { list: 'Prueba', invited: 1, with_account: 0 },
    ]);
    const invited = r['invited'] as Record<string, unknown>[];
    expect(invited.map((i) => [i['email'], i['list'], i['has_account'], i['admin']])).toEqual([
      ['dueno@ug.uchile.cl', 'Equipo', true, true],
      ['invitado@ug.uchile.cl', 'Equipo', true, false],
      ['sin.cuenta@ug.uchile.cl', 'Prueba', false, false],
    ]);
    expect(invited[0]!['last_sign_in_at']).toMatch(/^2026-11-08T12:00:00/);
    expect(
      (r['accounts_without_invite'] as { email: string }[]).map((a) => a.email).sort(),
    ).toEqual([ANA.email, LUIS.email, STRAY.email].sort());
  });
});

describe('permissions', () => {
  const ADMIN_ONLY = [
    `select public.invite_emails('{"emails": ["z@ug.uchile.cl"], "list": "L", "by": "x"}')`,
    `select public.remove_invites('{"emails": ["invitado@ug.uchile.cl"]}')`,
    'select public.access_report()',
    `select public.normalize_invite_email('a')`,
  ];

  it('neither anon nor a signed-in user (not even an administrator) runs any of it', async () => {
    for (const sql of ADMIN_ONLY) {
      for (const who of [null, OWNER]) {
        await expect(
          asUser(db, who, (tx) => tx.query(sql)),
          sql,
        ).rejects.toThrow(/permission denied/);
      }
    }
    for (const sql of ['select public.access_status()', 'select public.is_allowed_user()']) {
      await expect(
        asUser(db, null, (tx) => tx.query(sql)),
        sql,
      ).rejects.toThrow(/permission denied/);
    }
  });

  it('a signed-in student cannot ask whether someone else is invited', async () => {
    // is_invited() takes any email: through the API (rpc/is_invited) it told a student whether a classmate is
    // invited (Revisión de cero, 2.1). The hook keeps it; a student only asks about themselves.
    await expect(
      asUser(db, FRIEND, (tx) => tx.query(`select public.is_invited('dueno@ug.uchile.cl')`)),
    ).rejects.toThrow(/permission denied/);
    const r = await db.query<{ auth_admin: boolean; signed_in: boolean }>(
      `select has_function_privilege('supabase_auth_admin', 'public.is_invited(text)', 'execute') as auth_admin,
              has_function_privilege('authenticated', 'public.is_invited(text)', 'execute') as signed_in`,
    );
    expect(r.rows).toEqual([{ auth_admin: true, signed_in: false }]);
    expect(await allowed(FRIEND)).toBe(true);
    expect(await allowed(STRAY)).toBe(false);
  });

  it('the service role runs them (step 2.10, through the Worker)', async () => {
    const r = await asService(async (tx) => {
      const { rows } = await tx.query<{ r: { open_to_domain: boolean } }>(
        'select public.access_report() as r',
      );
      return rows[0]!.r;
    });
    expect(r.open_to_domain).toBe(false);
  });
});
