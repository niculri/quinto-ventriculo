// In-memory test databases (PGlite) with the fake Supabase and the migrations of db/users or db/content.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';

export type { PGlite };

const HERE = import.meta.dirname;

/**
 * The databases already built in this test process, as data-directory dumps by their migrations: loading a dump
 * takes a fraction of applying every migration again, and each call still gets a database of its own.
 */
const built = new Map<string, Promise<Blob>>();

/**
 * The databases handed out and not closed yet, apart by when they were asked for: inside a test (or its
 * beforeEach) or outside one (beforeAll, the top of the file). Each open database holds some 300 MB and a
 * worker runs many test files, so tests/setup.ts closes them all after each file; a file that makes one per
 * test calls closeAfterEachTest().
 */
const open = { test: new Set<PGlite>(), file: new Set<PGlite>() };

function track(db: PGlite): PGlite {
  open[expect.getState().currentTestName ? 'test' : 'file'].add(db);
  return db;
}

export async function closeDatabases(of: 'test' | 'file'): Promise<void> {
  const all = of === 'file' ? [...open.test, ...open.file] : [...open.test];
  open.test.clear();
  if (of === 'file') open.file.clear();
  await Promise.all(all.filter((db) => !db.closed).map((db) => db.close()));
}

/** For a test file whose tests make their own databases and share none made inside a test. */
export function closeAfterEachTest(): void {
  afterEach(() => closeDatabases('test'));
}

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
  const key = JSON.stringify([name, order, until ?? null]);
  let dump = built.get(key);
  if (!dump) {
    dump = createFreshDatabase(name, order, until)
      .then(async (db) => {
        const data = await db.dumpDataDir('none');
        await db.close();
        return data;
      })
      .catch((error: unknown) => {
        built.delete(key);
        throw error;
      });
    built.set(key, dump);
  }
  return track(await PGlite.create({ loadDataDir: await dump, extensions: { unaccent } }));
}

/**
 * Like createDatabase, but applying every migration now: for what depends on when the database was made (the
 * numbers of the content's card changes start at that time).
 */
export async function createFreshDatabase(
  name: 'users' | 'content',
  order: string[] = [],
  until?: string,
): Promise<PGlite> {
  const db = track(await PGlite.create({ extensions: { unaccent } }));
  await db.exec(readFileSync(join(HERE, 'fakeSupabase.sql'), 'utf8'));
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

export const OWNER_EMAIL = 'dueno@ug.uchile.cl';
const FRIEND_EMAIL = 'invitado@ug.uchile.cl';

/**
 * The rows the first migrations inserted in production (the real ones are not in the public code), with test
 * emails and at the same point, so that every later migration finds them as in production.
 */
const SEEDS: Record<string, string> = {
  '20261101000100_invites.sql': `insert into public.invited_emails (email, note) values
    ('${OWNER_EMAIL}', 'Autor'), ('${FRIEND_EMAIL}', 'Invitado de prueba');`,
  '20261101000500_admin.sql': `insert into public.admin_emails (email, note) values ('${OWNER_EMAIL}', 'Autor');`,
  // In production the site owner's row is marked after this migration, outside the public code.
  '20261116000000_admin_owner.sql': `update public.admin_emails set owner = true where email = '${OWNER_EMAIL}';`,
};

export async function applyMigration(db: PGlite, name: 'users' | 'content', file: string) {
  await db.exec(readFileSync(join(HERE, '..', name, 'supabase', 'migrations', file), 'utf8'));
}

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
