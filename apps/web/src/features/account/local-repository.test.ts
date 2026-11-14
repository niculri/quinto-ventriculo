// Pins the rules that the in-memory account repository re-implements from the account functions of the users
// database. Above each test, the db/tests case that checks the same rule in SQL («db: none» when there is none);
// «differs» marks a behaviour that is not the database's.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_DELETION_DAYS } from '@qv/schema';
import { AccountError, localAccountRepository } from './repository';

const NOW = Date.parse('2026-03-10T15:00:00Z');
const EMAIL = 'persona.prueba@ug.uchile.cl';
const V1 = { terms: '1', privacy: '1' };
const V2 = { terms: '2', privacy: '1' };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('accepting the terms', () => {
  // db: account.test.ts › a new version of either text asks again, once
  it('accepting the same versions again keeps the first date; new ones get a new date', async () => {
    const repo = localAccountRepository({ email: EMAIL });
    const first = await repo.accept(V1);
    vi.setSystemTime(NOW + 60_000);
    expect(await repo.accept(V1)).toEqual(first);
    const second = await repo.accept(V2);
    expect(second.acceptedAt).toBe(new Date(NOW + 60_000).toISOString());
    expect((await repo.resume(V2)).accepted).toMatchObject({ ...V2, ...second });
  });

  // differs — db: account.test.ts › after a rollback to versions accepted before, entering does not ask again
  it('entering gives the versions accepted last, whatever versions the page asks about', async () => {
    const repo = localAccountRepository({ email: EMAIL });
    await repo.accept(V1);
    await repo.accept(V2);
    expect((await repo.resume(V1)).accepted).toMatchObject(V2);
  });
});

describe('accepting the terms again', () => {
  // differs — accept_legal() keeps one row per pair of versions (on conflict do nothing): accepting V1 again gives back
  // the date V1 was first accepted (no db test)
  it('V1, then V2, then V1 again: V1 gets a new date', async () => {
    const repo = localAccountRepository({ email: EMAIL });
    await repo.accept(V1);
    vi.setSystemTime(NOW + 60_000);
    await repo.accept(V2);
    vi.setSystemTime(NOW + 120_000);
    expect((await repo.accept(V1)).acceptedAt).toBe(new Date(NOW + 120_000).toISOString());
  });
});

describe('deleting the account', () => {
  // db: account.test.ts › asks for the account’s own email; › marks it, closes every session and says until when
  it(`asks for the account’s own email, in any case, and is deleted after ${ACCOUNT_DELETION_DAYS} days`, async () => {
    const repo = localAccountRepository({ email: EMAIL });
    await expect(repo.requestDeletion('otra@ug.uchile.cl')).rejects.toBeInstanceOf(AccountError);
    expect(await repo.requestDeletion(`  ${EMAIL.toUpperCase()} `)).toEqual({
      deleteAfter: new Date(NOW + ACCOUNT_DELETION_DAYS * 86_400_000).toISOString(),
    });
  });

  // db: account.test.ts › signing in again before the 7 days cancels it, and the web is told once
  it('entering again cancels it, and says so once', async () => {
    const repo = localAccountRepository({ email: EMAIL });
    await repo.requestDeletion(EMAIL);
    expect((await repo.resume(V1)).deletionCancelled).toBe(true);
    expect((await repo.resume(V1)).deletionCancelled).toBe(false);
  });
});
