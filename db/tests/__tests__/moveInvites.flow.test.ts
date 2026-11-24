// Moving invited people between lists from «Acceso»: only an administrator with an open session, only the list and
// `invited_by` change, and a person is always in exactly one list.
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { OWNER_EMAIL, asUser, createDatabase } from '../pglite';
import { callAs, signIn } from '../helpers/users';
import type { Claims } from '../helpers/users';

let db: PGlite;
const OWNER = { sub: '00000000-0000-4000-8000-0000000000d1', email: OWNER_EMAIL };
const ANA = { sub: '00000000-0000-4000-8000-0000000000d2', email: 'ana.perez@ug.uchile.cl' };
const COURSE = Array.from({ length: 30 }, (_, i) => `alumno.${i}@ug.uchile.cl`);

interface Moved {
  moved: { email: string; from: string; to: string }[];
  already: string[];
  not_invited: string[];
}

const move = (c: Claims | null, p: unknown) =>
  callAs<Moved>(db, c, 'select public.admin_move_invites($1::jsonb) as r', [JSON.stringify(p)]);
const moves = (emails: string[], list: string) => ({
  moves: emails.map((email) => ({ email, list })),
});

async function rows() {
  return (
    await db.query<{ email: string; list: string; invited_by: string | null; invited_at: string }>(
      `select email, list, invited_by, invited_at::text from public.invited_emails order by email`,
    )
  ).rows;
}

let owner: Claims;
let ana: Claims;

beforeAll(async () => {
  db = await createDatabase('users');
  for (const u of [OWNER, ANA]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u.sub, u.email]);
  }
  await db.query(
    `insert into public.invited_emails (email, list, invited_by)
     select e, 'Curso 2026', 'quien.cargo@ug.uchile.cl' from unnest($1::text[]) e`,
    [[ANA.email, ...COURSE]],
  );
  owner = await signIn(db, OWNER);
  ana = await signIn(db, ANA);
});

describe('who can move', () => {
  it('a student gets admin_only, and nothing changes', async () => {
    const before = await rows();
    await expect(move(ana, moves([ANA.email], 'Equipo'))).rejects.toThrow(/admin_only/);
    expect(await rows()).toEqual(before);
  });

  it('without a session (anon) it cannot even be called', async () => {
    await expect(move(null, moves([ANA.email], 'Equipo'))).rejects.toThrow(/permission denied/);
  });

  it('an administrator whose session was closed gets session_closed', async () => {
    const closed = await signIn(db, OWNER);
    await db.query('delete from auth.sessions where id = $1', [closed.session_id]);
    await expect(move(closed, moves([ANA.email], 'Equipo'))).rejects.toThrow(/session_closed/);
  });

  it('nobody signed in writes the list by hand: the table is closed to them', async () => {
    for (const c of [ana, owner]) {
      await expect(
        asUser(db, c, (tx) =>
          tx.query(`update public.invited_emails set list = 'Otra' where email = $1`, [ANA.email]),
        ),
      ).rejects.toThrow(/permission denied/);
    }
  });
});

describe('what moving does', () => {
  it('moves one person to an existing list, with the administrator as `invited_by`', async () => {
    const before = (await rows()).find((r) => r.email === ANA.email)!;
    const r = await move(owner, moves([' Ana.Perez@UG.uchile.cl '], 'Equipo'));
    expect(r).toEqual({
      moved: [{ email: ANA.email, from: 'Curso 2026', to: 'Equipo' }],
      already: [],
      not_invited: [],
    });
    expect((await rows()).find((x) => x.email === ANA.email)).toEqual({
      ...before,
      list: 'Equipo',
      invited_by: OWNER.email,
    });
  });

  it('their access, their session and their progress do not change', async () => {
    await db.query(
      `insert into public.study_days (user_id, day, deck_id, answers, new_seen) values ($1, current_date, '1', 4, 2)`,
      [ANA.sub],
    );
    await move(owner, moves([ANA.email], 'Curso 2026'));
    expect(await callAs(db, ana, 'select public.access_status() as r')).toBe('allowed');
    expect(
      (await db.query('select answers from public.study_days where user_id = $1', [ANA.sub])).rows,
    ).toEqual([{ answers: 4 }]);
  });

  it('moves 30 people to a new list in one call', async () => {
    const r = await move(owner, moves(COURSE, '  Ayudantes  '));
    expect(r.moved).toHaveLength(30);
    expect(r.moved.every((m) => m.from === 'Curso 2026' && m.to === 'Ayudantes')).toBe(true);
    const lists = new Set(
      (await rows()).filter((x) => COURSE.includes(x.email)).map((x) => x.list),
    );
    expect([...lists]).toEqual(['Ayudantes']);
  });

  it('undoes by sending each one back to where they were, in one call', async () => {
    const r = await move(owner, moves([ANA.email, COURSE[0]!], 'Equipo'));
    const back = await move(owner, {
      moves: r.moved.map((m) => ({ email: m.email, list: m.from })),
    });
    expect(back.moved.map((m) => [m.email, m.to])).toEqual([
      [COURSE[0], 'Ayudantes'],
      [ANA.email, 'Curso 2026'],
    ]);
  });

  it('whoever is already in that list stays as they were, and an unknown email is not invited', async () => {
    await db.query(
      `update public.invited_emails set invited_by = 'x@ug.uchile.cl' where email = $1`,
      [ANA.email],
    );
    const r = await move(owner, {
      moves: [
        { email: ANA.email, list: 'Curso 2026' },
        { email: 'nadie@ug.uchile.cl', list: 'Curso 2026' },
        { email: '   ', list: 'Curso 2026' },
      ],
    });
    expect(r).toEqual({ moved: [], already: [ANA.email], not_invited: ['', 'nadie@ug.uchile.cl'] });
    expect((await rows()).find((x) => x.email === ANA.email)!.invited_by).toBe('x@ug.uchile.cl');
    expect((await rows()).some((x) => x.email === 'nadie@ug.uchile.cl')).toBe(false);
  });

  it('an administrator can be moved too, and stays one', async () => {
    await move(owner, moves([OWNER.email], 'Dueños'));
    expect(await callAs(db, owner, 'select public.is_admin() as r')).toBe(true);
    await move(owner, moves([OWNER.email], 'Equipo'));
  });
});

describe('always in exactly one list', () => {
  it('the same email twice, an empty list or a long one is refused, and nothing changes', async () => {
    const before = await rows();
    await expect(
      move(owner, {
        moves: [
          { email: ANA.email, list: 'Equipo' },
          { email: 'ANA.perez@ug.uchile.cl', list: 'Ayudantes' },
        ],
      }),
    ).rejects.toThrow(/each email goes once/);
    await expect(move(owner, moves([ANA.email], '   '))).rejects.toThrow(/"list" is required/);
    await expect(move(owner, moves([ANA.email], 'x'.repeat(61)))).rejects.toThrow(
      /"list" is required/,
    );
    expect(await rows()).toEqual(before);
  });

  it('nobody ends in two lists or in none after all the moves', async () => {
    const { rows: counts } = await db.query<{ n: number; lists: number }>(
      `select count(*)::int as n, count(distinct email)::int as lists from public.invited_emails where list is not null`,
    );
    expect(counts[0]!.n).toBe(counts[0]!.lists);
    expect(
      (await db.query(`select 1 from public.invited_emails where list is null or list = ''`)).rows,
    ).toEqual([]);
    expect((await rows()).filter((x) => [ANA.email, ...COURSE].includes(x.email))).toHaveLength(31);
  });

  it('a call without its shape, or with more than 500 moves, is refused', async () => {
    await expect(move(owner, [])).rejects.toThrow(/expected/);
    await expect(move(owner, { moves: [ANA.email] })).rejects.toThrow(/expected/);
    await expect(move(owner, { moves: [{ email: ANA.email }] })).rejects.toThrow(/expected/);
    await expect(move(owner, { moves: [{ email: 1, list: 'Equipo' }] })).rejects.toThrow(
      /expected/,
    );
    const many = Array.from({ length: 501 }, (_, i) => `x${i}@ug.uchile.cl`);
    await expect(move(owner, moves(many, 'Equipo'))).rejects.toThrow(/at most 500/);
  });
});
