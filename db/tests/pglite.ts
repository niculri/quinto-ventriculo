import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';

const HERE = import.meta.dirname;

/**
 * An in-memory database with the fake Supabase and every migration of `db/<name>`, in the order of their
 * names, or in `order` (the files it names first, in that order; the rest after, by name): the order they
 * were pasted into Supabase when it is not the order of their names.
 */
export async function createDatabase(
  name: 'users' | 'content',
  order: string[] = [],
  /** Stop before this migration (to test it on a database with data of the previous ones). */
  until?: string,
): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { unaccent } });
  await db.exec(readFileSync(join(HERE, 'fake-supabase.sql'), 'utf8'));
  const folder = join(HERE, '..', name, 'supabase', 'migrations');
  const byName = readdirSync(folder)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of order) {
    if (!byName.includes(file)) throw new Error(`No existe la migración ${file}`);
  }
  for (const file of [...order, ...byName.filter((f) => !order.includes(f))]) {
    if (file === until) break;
    await db.exec(readFileSync(join(folder, file), 'utf8'));
    if (name === 'users' && SEEDS[file]) await db.exec(SEEDS[file]);
  }
  return db;
}

/** The test accounts: the site's owner (invited, administrator) and a friend who helps to test (invited). */
export const OWNER_EMAIL = 'dueno@ug.uchile.cl';
export const FRIEND_EMAIL = 'invitado@ug.uchile.cl';

/**
 * The rows the first migrations inserted in production (the owner and a friend; step 2.4: they are not in the
 * public code), with test emails and at the same point, so that every later migration finds them as in production.
 */
const SEEDS: Record<string, string> = {
  '20261101000100_invites.sql': `insert into public.invited_emails (email, note) values
    ('${OWNER_EMAIL}', 'Autor'), ('${FRIEND_EMAIL}', 'Invitado de prueba');`,
  '20261101000500_admin.sql': `insert into public.admin_emails (email, note) values ('${OWNER_EMAIL}', 'Autor');`,
  // Step 2.10 b: the owner's row is marked in production after migrating (the line is in the private repository).
  '20261116000000_admin_owner.sql': `update public.admin_emails set owner = true where email = '${OWNER_EMAIL}';`,
};

/** Applies one migration of `db/<name>` (after `createDatabase(…, until)`). */
export async function applyMigration(db: PGlite, name: 'users' | 'content', file: string) {
  await db.exec(readFileSync(join(HERE, '..', name, 'supabase', 'migrations', file), 'utf8'));
}

/** Runs `fn` as a signed-in user (authenticated role and their JWT), inside a transaction. */
export async function asUser<T>(
  db: PGlite,
  claims: { sub: string; email: string } | null,
  fn: (tx: Pick<PGlite, 'query'>) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(claims ?? {}),
    ]);
    await tx.exec(`set local role ${claims ? 'authenticated' : 'anon'}`);
    return fn(tx);
  });
}
