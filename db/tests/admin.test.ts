import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './pglite';

let db: PGlite;
const ADMIN = { sub: '00000000-0000-4000-8000-0000000000a1', email: 'dueno@ug.uchile.cl' };
const STUDENT = { sub: '00000000-0000-4000-8000-0000000000a2', email: 'invitado@ug.uchile.cl' };
const OUTSIDER = {
  sub: '00000000-0000-4000-8000-0000000000a3',
  email: 'otra.persona@ug.uchile.cl',
};

const report = (tx: Pick<PGlite, 'query'>, comment = 'La respuesta está mal') =>
  tx.query<{ id: string }>(
    `insert into public.card_reports (note_guid, ord, card_code, card_version, comment)
     values ('g1', 0, 'T-BC-C2-11-086', 1, $1) returning id`,
    [comment],
  );

beforeAll(async () => {
  db = await createDatabase('users');
  for (const u of [ADMIN, STUDENT, OUTSIDER]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u.sub, u.email]);
  }
});

const isAdmin = (claims: typeof ADMIN | null) =>
  asUser(db, claims, async (tx) => {
    const r = await tx.query<{ v: boolean }>('select public.is_admin() as v');
    return r.rows[0]!.v;
  });

describe('administrators', () => {
  it('only the listed accounts are administrators', async () => {
    expect(await isAdmin(ADMIN)).toBe(true);
    expect(await isAdmin(STUDENT)).toBe(false);
  });

  it('nobody signed in can read or change the list', async () => {
    await expect(
      asUser(db, ADMIN, (tx) => tx.query('select * from public.admin_emails')),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, STUDENT, (tx) =>
        tx.query(`insert into public.admin_emails (email) values ('invitado@ug.uchile.cl')`),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('without a session, is_admin() cannot even be called', async () => {
    await expect(isAdmin(null)).rejects.toThrow(/permission denied/);
  });

  it('an administrator who is no longer invited stops being one', async () => {
    await db.query(`delete from public.invited_emails where email = $1`, [ADMIN.email]);
    expect(await isAdmin(ADMIN)).toBe(false);
    await db.query(`insert into public.invited_emails (email, list) values ($1, 'Equipo')`, [
      ADMIN.email,
    ]);
    expect(await isAdmin(ADMIN)).toBe(true);
  });
});

describe('reports of cards', () => {
  it('a student reports and sees only their own; the administrator sees them all with who wrote them', async () => {
    await asUser(db, STUDENT, (tx) => report(tx));
    await asUser(db, ADMIN, (tx) => report(tx, 'Otro error'));
    const mine = await asUser(db, STUDENT, (tx) =>
      tx.query<{ comment: string }>('select comment from public.card_reports'),
    );
    expect(mine.rows.map((r) => r.comment)).toEqual(['La respuesta está mal']);
    const all = await asUser(db, ADMIN, (tx) =>
      tx.query<{ comment: string; reporter_email: string }>(
        'select comment, reporter_email from public.admin_card_reports()',
      ),
    );
    expect(all.rows).toHaveLength(2);
    expect(all.rows.find((r) => r.comment === 'La respuesta está mal')?.reporter_email).toBe(
      STUDENT.email,
    );
  });

  it('a student cannot use the panel’s list, nor report as somebody else', async () => {
    await expect(
      asUser(db, STUDENT, (tx) => tx.query('select * from public.admin_card_reports()')),
    ).rejects.toThrow(/Solo para administradores/);
    await expect(
      asUser(db, STUDENT, (tx) =>
        tx.query(
          `insert into public.card_reports (user_id, note_guid, ord, comment) values ($1, 'g', 0, 'x')`,
          [ADMIN.sub],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('an account that is not invited cannot report', async () => {
    await expect(asUser(db, OUTSIDER, (tx) => report(tx))).rejects.toThrow(/row-level security/);
  });

  it('an empty comment is not a report', async () => {
    await expect(asUser(db, STUDENT, (tx) => report(tx, '   '))).rejects.toThrow(
      /check constraint/,
    );
  });

  it('only the administrator changes the status, and nobody changes what the student wrote', async () => {
    const { rows } = await asUser(db, STUDENT, (tx) => report(tx, 'Para resolver'));
    const id = rows[0]!.id;
    const byStudent = await asUser(db, STUDENT, (tx) =>
      tx.query(`update public.card_reports set status = 'resolved' where id = $1`, [id]),
    );
    expect(byStudent.affectedRows).toBe(0);
    const byAdmin = await asUser(db, ADMIN, (tx) =>
      tx.query(
        `update public.card_reports set status = 'resolved', resolved_at = now() where id = $1`,
        [id],
      ),
    );
    expect(byAdmin.affectedRows).toBe(1);
    await expect(
      asUser(db, ADMIN, (tx) =>
        tx.query(`update public.card_reports set comment = 'otra cosa' where id = $1`, [id]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
