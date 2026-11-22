// Tests that the in-memory account repository follows the users database's account rules.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_DELETION_DAYS } from '@qv/schema';
import { memoryStorage } from '../../../../../test/storage';
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

describe('the last accepted, when the dates tie', () => {
  it('the newest terms win, then the newest privacy policy, whatever the order they were kept in', async () => {
    const at = new Date(NOW).toISOString();
    const acceptances = [
      { terms: '1', privacy: '9', acceptedAt: at },
      { terms: '2', privacy: '1', acceptedAt: at },
      { terms: '2', privacy: '3', acceptedAt: at },
      { terms: '2', privacy: '3', acceptedAt: at },
    ];
    for (const list of [acceptances, [...acceptances].reverse()]) {
      const repo = localAccountRepository({ email: EMAIL, initial: { acceptances: list } });
      expect((await repo.resume({ terms: '7', privacy: '7' })).accepted).toMatchObject({
        terms: '2',
        privacy: '3',
      });
    }
  });

  it('an account kept the old way, with only the last acceptance, still counts as accepted', async () => {
    const accepted = { ...V1, acceptedAt: new Date(NOW).toISOString() };
    const repo = localAccountRepository({ email: EMAIL, initial: { accepted } });
    expect((await repo.resume(V1)).accepted).toEqual(accepted);
    expect(await repo.accept(V1)).toEqual({ acceptedAt: accepted.acceptedAt });
  });
});

describe('the account in the browser', () => {
  it('what one tab accepts, another one reads; the old form is read too', async () => {
    const storage = memoryStorage();
    await localAccountRepository({ storage, email: EMAIL }).accept(V1);
    expect(
      (await localAccountRepository({ storage, email: EMAIL }).resume(V1)).accepted,
    ).toMatchObject(V1);
    storage.setItem('qv-demo-account', JSON.stringify({ accepted: { ...V2, acceptedAt: 'x' } }));
    expect((await localAccountRepository({ storage }).resume(V2)).accepted).toMatchObject(V2);
  });

  it('nothing saved or something unreadable leaves what it started with', async () => {
    const storage = memoryStorage();
    const initial = { acceptances: [{ ...V1, acceptedAt: new Date(NOW).toISOString() }] };
    expect((await localAccountRepository({ storage, initial }).resume(V1)).accepted).toMatchObject(
      V1,
    );
    storage.setItem('qv-demo-account', '{no es json');
    expect((await localAccountRepository({ storage, initial }).resume(V1)).accepted).toMatchObject(
      V1,
    );
  });

  it('a blocked storage keeps the account in memory', async () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error('blocked');
    };
    const repo = localAccountRepository({ storage, email: EMAIL });
    await repo.accept(V1);
    expect((await repo.resume(V1)).accepted).toMatchObject(V1);
  });
});

describe('downloading the data', () => {
  it('a JSON with the email, the acceptances and what the demo adds', async () => {
    const repo = localAccountRepository({ email: EMAIL, exported: () => ({ cards: 3 }) });
    await repo.accept(V1);
    const blob = await repo.exportData();
    expect(blob.type).toBe('application/json');
    expect(JSON.parse(await blob.text())).toEqual({
      site: 'El Quinto Ventrículo',
      format: 1,
      exported_at: new Date(NOW).toISOString(),
      account: { email: EMAIL },
      tables: { legal_acceptances: [{ ...V1, acceptedAt: new Date(NOW).toISOString() }] },
      demo: { cards: 3 },
    });
  });

  it('without an email nor demo data, the email is null and there is no demo part', async () => {
    const data = JSON.parse(await (await localAccountRepository().exportData()).text()) as object;
    expect(data).toMatchObject({ account: { email: null } });
    expect(data).not.toHaveProperty('demo');
  });
});

describe('deleting an account without an email', () => {
  it('any email typed is a mismatch', async () => {
    await expect(
      localAccountRepository().requestDeletion('alguien@ug.uchile.cl'),
    ).rejects.toBeInstanceOf(AccountError);
  });
});
