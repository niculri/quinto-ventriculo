// The in-memory administrators and invitations repository against the users database: the same steps on both, the SQL
// through the Supabase adapter, the in-memory one starting from the invitations the database has.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { createDatabase, OWNER_EMAIL } from '@qv/db/testing';
import { fakeSupabase, signIn } from '@qv/db/postgrest';
import type { Person } from '@qv/db/postgrest';
import { AccessReport, InviteResult, RemoveResult, SetAdminResult } from '@qv/schema/user';
import { beforeEach, describe, expect, it } from 'vitest';
import { DATABASE_TIMEOUT, onBoth } from '../../../test/contract';
import { localAdminRepository } from './memory';
import type { AdminRepository } from './port';
import { supabaseAdminRepository } from './supabase';

type PGlite = Awaited<ReturnType<typeof createDatabase>>;
let db: PGlite;
let owner: Person;

beforeEach(async () => {
  db = await createDatabase('users');
  owner = await signIn(db, OWNER_EMAIL, { invited: false });
}, DATABASE_TIMEOUT);

const sqlAs = (who: Person) => {
  const rest = fakeSupabase(db, () => who);
  return supabaseAdminRepository(createClient<Database>(rest.url, rest.key, rest.options));
};

/**
 * The sessions a removal closes: the database's are real ones (none for an invitation without an account, two for a
 * person signed in on two devices); the demo has none and says one for each person removed.
 */
const withoutSessions = (list: unknown) =>
  (list as { value?: unknown }[]).map((o) =>
    o.value && typeof o.value === 'object' && 'sessionsClosed' in o.value
      ? { value: { ...o.value, sessionsClosed: '…' } }
      : o,
  );

/** The SQL as `who`, and the in-memory repository with what the database has (as the site owner sees it). */
async function pair(who: Person, role: { admin: boolean; owner: boolean }) {
  const report = await sqlAs(owner).accessReport();
  return {
    sql: sqlAs(who),
    memory: localAdminRepository({
      ...role,
      email: who.email,
      invites: report.invited,
      accountsWithoutInvite: report.accountsWithoutInvite,
      openToDomain: report.openToDomain,
    }),
  };
}

const mail = (i: number) => `persona${i}@ug.uchile.cl`;
const many = (count: number) => Array.from({ length: count }, (_, i) => mail(1000 + i));

describe('invitations', () => {
  it('what is invited, already there, rejected and why; the limits of a call; the report', async () => {
    const { sql, memory } = await pair(owner, { admin: true, owner: true });
    const got = await onBoth(sql, memory, [
      (r) => r.isAdmin(),
      (r) => r.accessReport(),
      (r) =>
        r.invite({
          emails: [
            mail(1),
            ` ${mail(2).toUpperCase()}\u200b`,
            mail(1),
            '',
            'a@gmail.com',
            'ñandú@ug.uchile.cl',
            OWNER_EMAIL,
          ],
          list: '  Curso A ',
          note: '  Primer año ',
        }),
      (r) => r.invite({ emails: [mail(3)], list: 'Curso B', note: null }),
      (r) => r.invite({ emails: [mail(4)], list: '', note: null }),
      (r) => r.invite({ emails: [mail(4)], list: 'x'.repeat(61), note: null }),
      // Sixty letters, one of them outside the basic plane: sixty characters for the database.
      (r) => r.invite({ emails: [mail(4)], list: `${'C'.repeat(59)}\u{1d400}`, note: null }),
      (r) => r.invite({ emails: [mail(5)], list: 'Curso B', note: 'n'.repeat(201) }),
      (r) => r.invite({ emails: [mail(5)], list: 'Curso B', note: `${'n'.repeat(199)}\u{1d400}` }),
      // More than 500 and a wrong list: the count is what is refused.
      (r) => r.invite({ emails: many(501), list: '', note: null }),
      (r) => r.accessReport(),
    ]);
    expect(got.memory).toEqual(got.sql);
    for (const side of [got.raw.sql, got.raw.memory]) {
      expect(AccessReport.parse(side[10])).toBeTruthy();
      expect(InviteResult.parse(side[2])).toBeTruthy();
    }
  });

  it('removing: by emails or by list, the administrators kept, the limits', async () => {
    await sqlAs(owner).invite({ emails: [mail(1), mail(2), mail(3)], list: 'Curso A', note: null });
    await sqlAs(owner).invite({ emails: [mail(4)], list: 'Curso B', note: null });
    await sqlAs(owner).setAdmin({ email: mail(2), admin: true });
    const { sql, memory } = await pair(owner, { admin: true, owner: true });
    const got = await onBoth(sql, memory, [
      (r) => r.removeInvites({ emails: [mail(1), ` ${mail(2)} `, mail(9), '', OWNER_EMAIL] }),
      (r) => r.removeInvites({ list: 'Curso B' }),
      (r) => r.removeInvites({ list: 'Curso B' }),
      (r) => r.removeInvites({ list: ' Curso A ' }),
      (r) => r.removeInvites({ list: '   ' }),
      (r) => r.removeInvites({ emails: many(501) }),
      (r) => r.accessReport(),
    ]);
    expect(withoutSessions(got.memory)).toEqual(withoutSessions(got.sql));
    expect(RemoveResult.parse(got.raw.sql[0])).toBeTruthy();
    expect(RemoveResult.parse(got.raw.memory[0])).toBeTruthy();
  });
});

describe('administrators', () => {
  it('the owner names and removes; not without an invitation; the owner stays; an empty email', async () => {
    await sqlAs(owner).invite({ emails: [mail(1)], list: 'Curso A', note: null });
    const { sql, memory } = await pair(owner, { admin: true, owner: true });
    const got = await onBoth(sql, memory, [
      (r) => r.setAdmin({ email: ` ${mail(1).toUpperCase()} `, admin: true }),
      (r) => r.setAdmin({ email: mail(1), admin: true }),
      (r) => r.setAdmin({ email: mail(9), admin: true }),
      (r) => r.setAdmin({ email: OWNER_EMAIL, admin: false }),
      (r) => r.setAdmin({ email: '  ', admin: true }),
      (r) => r.setAdmin({ email: mail(1), admin: false }),
      (r) => r.setAdmin({ email: mail(1), admin: false }),
      (r) => r.accessReport(),
    ]);
    expect(got.memory).toEqual(got.sql);
    expect(SetAdminResult.parse(got.raw.memory[0])).toBeTruthy();
  });

  it('an administrator who is not the owner, and a student', async () => {
    const admin = await signIn(db, mail(7));
    await sqlAs(owner).setAdmin({ email: mail(7), admin: true });
    const student = await signIn(db, mail(8));
    const asAdmin = await pair(admin, { admin: true, owner: false });
    const asStudent = await pair(student, { admin: false, owner: false });
    const steps: ((r: AdminRepository) => Promise<unknown>)[] = [
      (r) => r.isAdmin(),
      (r) => r.setAdmin({ email: mail(8), admin: true }),
      async (r) => {
        const report = await r.accessReport();
        return { owner: report.owner, youAreOwner: report.youAreOwner };
      },
      (r) => r.invite({ emails: [mail(9)], list: 'Curso A', note: null }),
      (r) => r.removeInvites({ emails: [mail(9)] }),
      (r) => r.deckImpact(['1']),
    ];
    for (const { sql, memory } of [asAdmin, asStudent]) {
      const got = await onBoth(sql, memory, steps);
      // The site owner's email: the database gives it to every administrator; in memory, only the site owner has it.
      const owners = (list: unknown) =>
        (list as { value?: { owner?: string | null } }[]).map((o) =>
          o.value && typeof o.value === 'object' && 'owner' in o.value
            ? { value: { ...o.value, owner: '…' } }
            : o,
        );
      expect(withoutSessions(owners(got.memory))).toEqual(withoutSessions(owners(got.sql)));
    }
  });
});

describe('the impact of a release', () => {
  it('only an administrator; decks by number, once each, in order; at most 300', async () => {
    const { sql, memory } = await pair(owner, { admin: true, owner: true });
    const got = await onBoth(sql, memory, [
      (r) => r.deckImpact(['20', '3', '20', 'no', '']),
      (r) => r.deckImpact([]),
      (r) => r.deckImpact(Array.from({ length: 301 }, (_, i) => String(i))),
    ]);
    expect(got.memory).toEqual(got.sql);
  });

  // The database counts everybody who studied the deck, the administrator included; the in-memory repository does not
  // see the demo's study progress, so it always says nobody.
  it.fails('counts the administrator’s own progress too', async () => {
    await db.query(
      `insert into public.card_states (user_id, note_guid, ord, deck_id, phase, interday, due, last_review)
       values ($1, 'g', 0, '5', 'review', true, now(), now())`,
      [owner.sub],
    );
    const { sql, memory } = await pair(owner, { admin: true, owner: true });
    const got = await onBoth(sql, memory, [(r) => r.deckImpact(['5'])]);
    expect(got.memory).toEqual(got.sql);
  });
});
