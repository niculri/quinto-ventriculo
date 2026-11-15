// Tests that the in-memory account repository follows the users database's account rules.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_DELETION_DAYS } from '@qv/schema';
import { AccountError, localAccountRepository } from '..';

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
  it('accepting the same versions again keeps the first date; new ones get a new date', async () => {
    const repo = localAccountRepository({ email: EMAIL });
    const first = await repo.accept(V1);
    vi.setSystemTime(NOW + 60_000);
    expect(await repo.accept(V1)).toEqual(first);
    const second = await repo.accept(V2);
    expect(second.acceptedAt).toBe(new Date(NOW + 60_000).toISOString());
    expect((await repo.resume(V2)).accepted).toMatchObject({ ...V2, ...second });
  });

  it('entering gives the versions the page asks about if they were accepted, otherwise the last accepted', async () => {
    const repo = localAccountRepository({ email: EMAIL });
    await repo.accept(V1);
    vi.setSystemTime(NOW + 60_000);
    await repo.accept(V2);
    expect((await repo.resume(V1)).accepted).toMatchObject(V1);
    expect((await repo.resume({ terms: '9', privacy: '9' })).accepted).toMatchObject(V2);
  });
});

describe('accepting the terms again', () => {
  it('V1, then V2, then V1 again: V1 keeps its first date', async () => {
    const repo = localAccountRepository({ email: EMAIL });
    await repo.accept(V1);
    vi.setSystemTime(NOW + 60_000);
    await repo.accept(V2);
    vi.setSystemTime(NOW + 120_000);
    expect((await repo.accept(V1)).acceptedAt).toBe(new Date(NOW).toISOString());
  });
});

describe('deleting the account', () => {
  it(`asks for the account’s own email, in any case, and is deleted after ${ACCOUNT_DELETION_DAYS} days`, async () => {
    const repo = localAccountRepository({ email: EMAIL });
    await expect(repo.requestDeletion('otra@ug.uchile.cl')).rejects.toBeInstanceOf(AccountError);
    expect(await repo.requestDeletion(`  ${EMAIL.toUpperCase()} `)).toEqual({
      deleteAfter: new Date(NOW + ACCOUNT_DELETION_DAYS * 86_400_000).toISOString(),
    });
  });

  it('entering again cancels it, and says so once', async () => {
    const repo = localAccountRepository({ email: EMAIL });
    await repo.requestDeletion(EMAIL);
    expect((await repo.resume(V1)).deletionCancelled).toBe(true);
    expect((await repo.resume(V1)).deletionCancelled).toBe(false);
  });
});
