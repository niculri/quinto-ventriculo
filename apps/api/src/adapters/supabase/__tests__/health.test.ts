// Tests for the health checks of the users' and the content databases, with made-up URLs and keys.
import { describe, expect, it } from 'vitest';
import { authCheck, contentDatabaseCheck, usersDatabaseCheck } from '../health';

const USERS = 'https://users.example.supabase.co';
const CONTENT = 'https://content.example.supabase.co';

describe('the database checks of the Worker', () => {
  const signal = new AbortController().signal;
  const answer = (status: number, body: unknown = null) =>
    new Response(body === null ? null : JSON.stringify(body), { status });

  it('users: health() with the public key, and only «true» is an answer', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fake = (status: number, body: unknown) =>
      (async (url: string, init: RequestInit) => {
        seen.push({ url, init });
        return answer(status, body);
      }) as unknown as typeof fetch;
    await usersDatabaseCheck(`${USERS}/`, 'sb_publishable_x', fake(200, true))(signal);
    expect(seen[0]!.url).toBe(`${USERS}/rest/v1/rpc/health`);
    expect(seen[0]!.init.method).toBe('POST');
    expect((seen[0]!.init.headers as Record<string, string>).apikey).toBe('sb_publishable_x');
    await expect(
      usersDatabaseCheck(USERS, 'sb_publishable_x', fake(200, false))(signal),
    ).rejects.toThrow();
    await expect(
      usersDatabaseCheck(USERS, 'sb_publishable_x', fake(404, { message: 'no' }))(signal),
    ).rejects.toThrow();
    await expect(usersDatabaseCheck(USERS, undefined, fake(200, true))(signal)).rejects.toThrow();
  });

  it('auth: GET /auth/v1/health', async () => {
    let url = '';
    const fake = (async (u: string) => {
      url = u;
      return answer(200, { name: 'GoTrue' });
    }) as unknown as typeof fetch;
    await authCheck(USERS, 'sb_publishable_x', fake)(signal);
    expect(url).toBe(`${USERS}/auth/v1/health`);
    const down = (async () => answer(503)) as unknown as typeof fetch;
    await expect(authCheck(USERS, 'sb_publishable_x', down)(signal)).rejects.toThrow();
  });

  it('content: site_settings() with the service key', async () => {
    let url = '';
    const fake = (async (u: string) => {
      url = u;
      return answer(200, { hideEmptySemesters: false });
    }) as unknown as typeof fetch;
    await contentDatabaseCheck(CONTENT, 'sb_secret_x', fake)(signal);
    expect(url).toBe(`${CONTENT}/rest/v1/rpc/site_settings`);
    const down = (async () => answer(500)) as unknown as typeof fetch;
    await expect(contentDatabaseCheck(CONTENT, 'sb_secret_x', down)(signal)).rejects.toThrow();
  });
});
