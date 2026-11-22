// Tests the account repository of the users database: the download goes by fetch with the session's token and is
// saved as it comes, and every way it can fail ends in an AccountError the page can say.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountError, accountError, supabaseAccountRepository } from '..';

const clientWith = (token: string | null, rpc = vi.fn()) =>
  ({
    rpc,
    auth: {
      getSession: async () => ({
        data: { session: token ? { access_token: token } : null },
      }),
    },
  }) as unknown as SupabaseClient<Database>;

const PROJECT = { url: 'https://proyecto.supabase.co//', key: 'clave-publica' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('downloading the data', () => {
  it('posts to export_my_data with the token, and keeps the bytes the database sent', async () => {
    const fetch = vi.fn(async () => new Response('{"a":1}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const blob = await supabaseAccountRepository(clientWith('tok'), PROJECT).exportData();
    expect(await blob.text()).toBe('{"a":1}');
    expect(blob.type).toBe('application/json');
    expect(fetch).toHaveBeenCalledWith('https://proyecto.supabase.co/rest/v1/rpc/export_my_data', {
      method: 'POST',
      headers: {
        apikey: 'clave-publica',
        Authorization: 'Bearer tok',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: '{}',
    });
  });

  it('without a session it says the session closed, and asks nothing', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      supabaseAccountRepository(clientWith(null), PROJECT).exportData(),
    ).rejects.toMatchObject({
      code: 'session_closed',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('a network failure is «unknown»', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );
    await expect(
      supabaseAccountRepository(clientWith('t'), PROJECT).exportData(),
    ).rejects.toMatchObject({
      code: 'unknown',
    });
  });

  it('a refusal says its code, and one without a readable body is «unknown»', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"message":"session_closed"}', { status: 401 })),
    );
    await expect(
      supabaseAccountRepository(clientWith('t'), PROJECT).exportData(),
    ).rejects.toMatchObject({
      code: 'session_closed',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>', { status: 502 })),
    );
    await expect(
      supabaseAccountRepository(clientWith('t'), PROJECT).exportData(),
    ).rejects.toMatchObject({
      code: 'unknown',
    });
  });
});

describe('the refusals of the other calls', () => {
  it('an rpc that fails gives the code the database sent', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'admin_account' } }));
    await expect(
      supabaseAccountRepository(clientWith('t', rpc), PROJECT).requestDeletion('a@b.cl'),
    ).rejects.toMatchObject({ code: 'admin_account' });
  });

  it('an AccountError passes as it is; something that is not an object is «unknown»', () => {
    const own = new AccountError('email_mismatch', 'propio');
    expect(accountError(own)).toBe(own);
    expect(accountError('session_closed').code).toBe('unknown');
    expect(accountError(null).code).toBe('unknown');
  });
});
