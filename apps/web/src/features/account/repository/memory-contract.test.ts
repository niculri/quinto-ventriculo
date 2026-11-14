// The in-memory account repository against the users database: the same steps on both, the SQL through the Supabase
// adapter, and the results compared after the adapter's translation.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { createDatabase, OWNER_EMAIL } from '@qv/db/testing';
import { fakeSupabase, signIn } from '@qv/db/postgrest';
import type { Person } from '@qv/db/postgrest';
import { ACCOUNT_DELETION_DAYS } from '@qv/schema';
import { AccountState } from '@qv/schema/user';
import { beforeAll, describe, expect, it } from 'vitest';
import { DATABASE_TIMEOUT, fromNow, onBoth } from '../../../test/contract';
import { localAccountRepository } from './memory';
import type { AccountRepository } from './port';
import { supabaseAccountRepository } from './supabase';

type PGlite = Awaited<ReturnType<typeof createDatabase>>;
let db: PGlite;
let n = 0;

beforeAll(async () => {
  db = await createDatabase('users');
}, DATABASE_TIMEOUT);

/** A new person, and their account in the SQL and in memory. */
async function pair(email = `persona${++n}@ug.uchile.cl`) {
  let me: Person = await signIn(db, email);
  const rest = fakeSupabase(db, () => me);
  const client = createClient<Database>(rest.url, rest.key, rest.options);
  const sql = supabaseAccountRepository(client, { url: rest.url, key: rest.key });
  return {
    sql,
    memory: localAccountRepository({ email }),
    /** Asking to delete the account closes its sessions: entering again opens a new one (in memory, nothing). */
    enter: async (repo: AccountRepository) => {
      if (repo === sql) me = { ...me, session_id: await openSession(me.sub) };
      return repo.resume(V1);
    },
  };
}

async function openSession(sub: string) {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.sessions (user_id) values ($1) returning id`,
    [sub],
  );
  return rows[0]!.id;
}

const V1 = { terms: '1', privacy: '1' };
const V2 = { terms: '2', privacy: '1' };
const V3 = { terms: '3', privacy: '2' };
const pause = () => new Promise((r) => setTimeout(r, 5));

describe('the legal texts', () => {
  it('each pair of versions keeps its first date, and entering gives the pair asked about if it was accepted', async () => {
    const { sql, memory } = await pair();
    const steps: ((r: AccountRepository) => Promise<unknown>)[] = [
      (r) => r.resume(V1),
      (r) => r.accept(V1),
      async (r) => (await pause(), r.accept(V2)),
      async (r) => (await pause(), r.accept(V1)),
      (r) => r.resume(V1),
      (r) => r.resume(V2),
      // Versions never accepted: the last one accepted.
      (r) => r.resume(V3),
      (r) => r.resume({ terms: '', privacy: '' }),
    ];
    const got = await onBoth(sql, memory, steps);
    expect(got.memory).toEqual(got.sql);
    for (const step of [0, 4, 5, 6, 7]) {
      expect(AccountState.parse(got.raw.sql[step])).toBeTruthy();
      expect(AccountState.parse(got.raw.memory[step])).toBeTruthy();
    }
  });
});

describe('deleting the account', () => {
  it(`asks for the account’s own email and is deleted after ${ACCOUNT_DELETION_DAYS} days; entering cancels it once`, async () => {
    const { sql, memory, enter } = await pair();
    const email = `persona${n}@ug.uchile.cl`;
    const steps: ((r: AccountRepository) => Promise<unknown>)[] = [
      (r) => r.requestDeletion('otra.persona@ug.uchile.cl'),
      (r) => r.requestDeletion(''),
      // Any case, spaces around and the invisible ones a paste brings.
      async (r) => {
        const { deleteAfter } = await r.requestDeletion(` ${email.toUpperCase()}\u200b `);
        return fromNow(deleteAfter, ACCOUNT_DELETION_DAYS * 86_400_000) < 60_000;
      },
      enter,
      enter,
    ];
    const got = await onBoth(sql, memory, steps);
    expect(got.memory).toEqual(got.sql);
    expect(got.raw.sql[2]).toBe(true);
    expect(got.raw.sql.slice(3)).toEqual([
      { accepted: null, deletionCancelled: true },
      { accepted: null, deletionCancelled: false },
    ]);
  });

  // The database refuses to delete an administrator's account; the in-memory repository does not know who is one, and
  // the demo's user (the site owner) can ask for it: the e2e test of «Eliminar mi cuenta» runs that way.
  it.fails('an administrator cannot delete their account', async () => {
    const { sql, memory } = await pair(OWNER_EMAIL);
    const got = await onBoth(sql, memory, [(r) => r.requestDeletion(OWNER_EMAIL)]);
    expect(got.memory).toEqual(got.sql);
  });
});
