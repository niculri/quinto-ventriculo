import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { OWNER_EMAIL, applyMigration, asUser, createDatabase } from './pglite';

/**
 * Step 2.10 b: the owner names and removes administrators from «Acceso» (…_admin_owner.sql). Only the owner (the row of
 * admin_emails with `owner`), with the session open; only someone invited; never the owner. The other administrators
 * use the panel, but cannot call admin_set_admin().
 */

let db: PGlite;
const OWNER = { sub: '00000000-0000-4000-8000-0000000000d1', email: OWNER_EMAIL };
const FRIEND = { sub: '00000000-0000-4000-8000-0000000000d2', email: 'invitado@ug.uchile.cl' };
const SECOND = { sub: '00000000-0000-4000-8000-0000000000d3', email: 'segunda.admin@ug.uchile.cl' };
const ANA = { sub: '00000000-0000-4000-8000-0000000000d4', email: 'ana.perez@ug.uchile.cl' };

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
const setAdmin = (c: Claims | null, p: unknown) =>
  call(c, 'select public.admin_set_admin($1::jsonb) as r', [JSON.stringify(p)]);
const remove = (c: Claims | null, p: unknown) =>
  call(c, 'select public.admin_remove_invites($1::jsonb) as r', [JSON.stringify(p)]);
const isAdmin = (c: Claims) =>
  asUser(
    db,
    c,
    async (tx) => (await tx.query<{ a: boolean }>('select public.is_admin() as a')).rows[0]!.a,
  );
const admins = async () =>
  (
    await db.query<{ email: string; owner: boolean; added_by: string | null }>(
      'select email, owner, added_by from public.admin_emails order by email',
    )
  ).rows;

let owner: Claims;
let friend: Claims;
let second: Claims;

beforeEach(async () => {
  db = await createDatabase('users');
  for (const u of [OWNER, FRIEND, SECOND, ANA]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u.sub, u.email]);
  }
  // A second administrator (step 2.5), invited in «Equipo». Ana has an account and no invitation.
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

describe('who the owner is', () => {
  it('the report says it, and whether it is who is looking', async () => {
    expect(await report(owner)).toMatchObject({ owner: OWNER.email, you_are_owner: true });
    expect(await report(second)).toMatchObject({ owner: OWNER.email, you_are_owner: false });
    // What step 2.10 read is still there.
    expect(await report(second)).toMatchObject({ open_to_domain: false });
  });

  it('at most one owner', async () => {
    await expect(
      db.query(`update public.admin_emails set owner = true where email = $1`, [SECOND.email]),
    ).rejects.toThrow(/admin_emails_one_owner/);
  });

  it('without a row marked (a deployment that did not mark it yet), nobody is the owner', async () => {
    await db.query(`update public.admin_emails set owner = false where owner`);
    expect(await report(owner)).toMatchObject({ owner: null, you_are_owner: false });
    await expect(setAdmin(owner, { email: FRIEND.email, admin: true })).rejects.toThrow(
      /owner_only/,
    );
  });

  it('the helper is out of reach of a signed-in person, and admin_emails stays unreadable', async () => {
    await expect(
      asUser(db, owner, (tx) => tx.query('select public.caller_is_owner()')),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, owner, (tx) => tx.query('select owner from public.admin_emails')),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, owner, (tx) =>
        tx.query(`update public.admin_emails set owner = true where email = '${SECOND.email}'`),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('who can call admin_set_admin()', () => {
  it('another administrator gets owner_only, and nothing changes', async () => {
    const before = await admins();
    await expect(setAdmin(second, { email: FRIEND.email, admin: true })).rejects.toThrow(
      /owner_only/,
    );
    await expect(setAdmin(second, { email: OWNER.email, admin: false })).rejects.toThrow(
      /owner_only/,
    );
    await expect(setAdmin(second, { email: SECOND.email, admin: false })).rejects.toThrow(
      /owner_only/,
    );
    expect(await admins()).toEqual(before);
  });

  it('a student gets admin_only; without a session it cannot even be called', async () => {
    await expect(setAdmin(friend, { email: FRIEND.email, admin: true })).rejects.toThrow(
      /admin_only/,
    );
    await expect(setAdmin(null, { email: FRIEND.email, admin: true })).rejects.toThrow(
      /permission denied/,
    );
    expect((await admins()).map((a) => a.email)).toEqual([OWNER.email, SECOND.email].sort());
  });

  it('the owner with the session closed gets session_closed', async () => {
    const closed = await signIn(OWNER);
    await db.query('delete from auth.sessions where id = $1', [closed.session_id]);
    await expect(setAdmin(closed, { email: FRIEND.email, admin: true })).rejects.toThrow(
      /session_closed/,
    );
    expect((await admins()).map((a) => a.email)).not.toContain(FRIEND.email);
  });

  it('a call without the shape is refused', async () => {
    for (const p of [
      'invitado@ug.uchile.cl',
      { email: FRIEND.email },
      { email: FRIEND.email, admin: 'true' },
      { email: 3, admin: true },
      { email: '  ', admin: true },
    ]) {
      await expect(setAdmin(owner, p)).rejects.toThrow(/expected/);
    }
  });
});

describe('what the owner does', () => {
  it('names an invited person, however the email is written: they use the panel, but do not name anybody', async () => {
    expect(
      await setAdmin(owner, { email: ` ${FRIEND.email.toUpperCase()} `, admin: true }),
    ).toEqual({ email: FRIEND.email, admin: true, changed: true });
    expect(await admins()).toContainEqual({
      email: FRIEND.email,
      owner: false,
      added_by: OWNER.email,
    });
    expect(await isAdmin(friend)).toBe(true);
    expect(await report(friend)).toMatchObject({ you_are_owner: false });
    const row = ((await report(owner)).invited as { email: string; admin: boolean }[]).find(
      (i) => i.email === FRIEND.email,
    );
    expect(row).toMatchObject({ admin: true });
    await expect(setAdmin(friend, { email: SECOND.email, admin: false })).rejects.toThrow(
      /owner_only/,
    );
    // Again: nothing changes.
    expect(await setAdmin(owner, { email: FRIEND.email, admin: true })).toEqual({
      email: FRIEND.email,
      admin: true,
      changed: false,
    });
  });

  it('only someone invited: an account without an invitation, or nobody, is refused', async () => {
    for (const email of [ANA.email, 'nadie@ug.uchile.cl', 'alguien@gmail.com']) {
      await expect(setAdmin(owner, { email, admin: true })).rejects.toThrow(/not_invited/);
    }
    expect((await admins()).map((a) => a.email)).toEqual([OWNER.email, SECOND.email].sort());
  });

  it('removes an administrator: they stay invited, with their sessions, as a student', async () => {
    expect(await setAdmin(owner, { email: SECOND.email, admin: false })).toEqual({
      email: SECOND.email,
      admin: false,
      changed: true,
    });
    expect((await admins()).map((a) => a.email)).toEqual([OWNER.email]);
    // The database stops at once.
    expect(await isAdmin(second)).toBe(false);
    await expect(report(second)).rejects.toThrow(/admin_only/);
    expect(
      (await db.query('select 1 from public.invited_emails where email = $1', [SECOND.email])).rows,
    ).toHaveLength(1);
    expect(
      (await db.query('select 1 from auth.sessions where id = $1', [second.session_id])).rows,
    ).toHaveLength(1);
    // Someone who is not an administrator: nothing changes.
    expect(await setAdmin(owner, { email: FRIEND.email, admin: false })).toMatchObject({
      changed: false,
    });
  });

  it('nobody removes the owner, not even himself', async () => {
    await expect(
      setAdmin(owner, { email: ` ${OWNER.email.toUpperCase()}`, admin: false }),
    ).rejects.toThrow(/owner_stays/);
    expect(await admins()).toContainEqual({ email: OWNER.email, owner: true, added_by: null });
    expect(await report(owner)).toMatchObject({ you_are_owner: true });
  });

  it('the panel still never removes an administrator: only once they are not one any more', async () => {
    await setAdmin(owner, { email: FRIEND.email, admin: true });
    expect(await remove(owner, { emails: [FRIEND.email] })).toMatchObject({
      removed: [],
      kept_admins: [FRIEND.email],
    });
    await setAdmin(owner, { email: FRIEND.email, admin: false });
    expect(await remove(owner, { emails: [FRIEND.email] })).toMatchObject({
      removed: [FRIEND.email],
      kept_admins: [],
    });
    // Without an invitation they cannot be named again until they are invited.
    await expect(setAdmin(owner, { email: FRIEND.email, admin: true })).rejects.toThrow(
      /not_invited/,
    );
  });
});

// Revisión de cero (2.10 b): the side roads. What the web sends never makes an owner nor says who named; the functions
// of step 2.10 never take out the owner nor another administrator; an invisible character does not get round
// owner_stays; and removing someone keeps their account and their progress.
describe('side roads', () => {
  it('«owner» and «added_by» sent by the web are ignored', async () => {
    expect(
      await setAdmin(owner, {
        email: FRIEND.email,
        admin: true,
        owner: true,
        added_by: SECOND.email,
      }),
    ).toEqual({ email: FRIEND.email, admin: true, changed: true });
    expect(await admins()).toContainEqual({
      email: FRIEND.email,
      owner: false,
      added_by: OWNER.email,
    });
    expect(await report(friend)).toMatchObject({ owner: OWNER.email, you_are_owner: false });
  });

  it('another administrator cannot take out the owner nor an administrator with the functions of step 2.10', async () => {
    await setAdmin(owner, { email: FRIEND.email, admin: true });
    const before = await admins();
    expect(await remove(second, { list: 'Equipo' })).toMatchObject({
      removed: [],
      kept_admins: [OWNER.email, FRIEND.email, SECOND.email].sort(),
    });
    expect(
      await remove(second, { emails: [OWNER.email, FRIEND.email], include_admins: true }),
    ).toMatchObject({ removed: [], kept_admins: [OWNER.email, FRIEND.email].sort() });
    // Inviting again whoever is already there changes nothing either.
    await call(second, 'select public.admin_invite_emails($1::jsonb) as r', [
      JSON.stringify({ emails: [OWNER.email], list: 'Otra' }),
    ]);
    expect(await admins()).toEqual(before);
    expect(await report(owner)).toMatchObject({ owner: OWNER.email, you_are_owner: true });
  });

  it('owner_stays also with invisible characters in the email', async () => {
    const ZERO_WIDTH = String.fromCodePoint(0x200b);
    const NO_BREAK = String.fromCodePoint(0xa0);
    await expect(
      setAdmin(owner, {
        email: `${OWNER.email.slice(0, 3)}${ZERO_WIDTH}${OWNER.email.slice(3)}${NO_BREAK}`,
        admin: false,
      }),
    ).rejects.toThrow(/owner_stays/);
    expect(await admins()).toContainEqual({ email: OWNER.email, owner: true, added_by: null });
  });

  it('without a session, neither the report nor the helper can be called', async () => {
    await expect(report(null)).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, null, (tx) => tx.query('select public.caller_is_owner()')),
    ).rejects.toThrow(/permission denied/);
  });

  it('removing an administrator keeps their account and their progress: they go on studying', async () => {
    await db.query(
      `insert into public.card_states (user_id, note_guid, ord, deck_id) values ($1, 'guid-1', 0, '1')`,
      [SECOND.sub],
    );
    await setAdmin(owner, { email: SECOND.email, admin: false });
    expect(
      (await db.query('select 1 from auth.users where id = $1', [SECOND.sub])).rows,
    ).toHaveLength(1);
    expect(
      (await db.query('select 1 from public.card_states where user_id = $1', [SECOND.sub])).rows,
    ).toHaveLength(1);
    expect(
      await asUser(
        db,
        second,
        async (tx) =>
          (await tx.query<{ a: boolean }>('select public.is_allowed_user() as a')).rows[0]!.a,
      ),
    ).toBe(true);
  });
});

// Revisión de cero (2.10 b): changing the owner from the SQL editor (the block of docs/configuracion.md, with test
// emails): to an administrator it works; to somebody who is not one it changes nothing, so the site keeps its owner.
describe('changing the owner by SQL', () => {
  const change = (email: string) =>
    db.exec(`do $$
begin
  update public.admin_emails set owner = false where owner;
  update public.admin_emails set owner = true where email = '${email}';
  if not found then
    raise exception 'Ese correo no está en admin_emails: primero hay que nombrarlo (e invitarlo).';
  end if;
end;
$$;`);

  it('to an administrator: the other one is the owner now', async () => {
    await change(SECOND.email);
    expect(await report(owner)).toMatchObject({ owner: SECOND.email, you_are_owner: false });
    expect(await report(second)).toMatchObject({ you_are_owner: true });
  });

  it('to somebody who is not an administrator: refused, and the owner stays', async () => {
    await expect(change(FRIEND.email)).rejects.toThrow(/no está en admin_emails/);
    expect(await report(owner)).toMatchObject({ owner: OWNER.email, you_are_owner: true });
  });
});

describe('the migration on a database as production had it', () => {
  it('keeps the administrators as they were, nobody is the owner until the row is marked', async () => {
    db = await createDatabase('users', [], '20261116000000_admin_owner.sql');
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [OWNER.sub, OWNER.email]);
    const me = await signIn(OWNER);
    const before = await report(me);
    await applyMigration(db, 'users', '20261116000000_admin_owner.sql');
    expect(await admins()).toEqual([{ email: OWNER.email, owner: false, added_by: null }]);
    expect(await report(me)).toEqual({ ...before, owner: null, you_are_owner: false });
    // The line of the private repository.
    await db.query(`update public.admin_emails set owner = true where email = $1`, [OWNER.email]);
    expect(await report(me)).toMatchObject({ owner: OWNER.email, you_are_owner: true });
  });
});
