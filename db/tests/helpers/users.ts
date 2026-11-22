// Signed-in people and calls as one of them, for the tests of the users' database.
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createDatabase } from '../pglite';

export interface Person {
  sub: string;
  email: string;
}

export interface Claims extends Person {
  session_id?: string | undefined;
}

export interface SignedIn extends Person {
  session_id: string;
}

/** A session with its refresh token, as Supabase Auth leaves them when someone signs in. */
export async function signIn(db: PGlite, user: Person): Promise<SignedIn> {
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

/** The `r` column of the first row of a query run as `claims` (anonymous when null), under RLS. */
export const callAs = <T = Record<string, unknown>>(
  db: PGlite,
  claims: Claims | null,
  sql: string,
  args: unknown[] = [],
) => asUser(db, claims, async (tx) => (await tx.query<{ r: T }>(sql, args)).rows[0]!.r);

/** A users' database open to the whole domain, with these people already in `auth.users`. */
export async function usersDatabaseWith(people: Person[]): Promise<PGlite> {
  const db = await createDatabase('users');
  await db.query('update public.access_settings set open_to_domain = true');
  for (const person of people) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [
      person.sub,
      person.email,
    ]);
  }
  return db;
}
