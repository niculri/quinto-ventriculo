// Tests for the usage figures of the users' database: the administrator's own token and a refusal.
import { describe, expect, it } from 'vitest';
import { bodyOf, urlOf } from '../../../test/fetch';
import { supabaseUsageStats } from '../usageStats';

describe('supabaseUsageStats', () => {
  const groups = { decks: { d: ['u', 'a', 'c'] as [string, string, string] }, quizzes: {} };

  it('asks admin_usage() with the token of the person asking, not with the Worker’s key', async () => {
    const seen: { url: string; headers: Headers; body: string }[] = [];
    const stats = supabaseUsageStats({
      supabaseUrl: 'https://u.example.co//',
      publishableKey: 'sb_publishable_x',
      fetch: async (url, init) => {
        seen.push({ url: urlOf(url), headers: new Headers(init?.headers), body: bodyOf(init) });
        return Response.json({ today: '2026-11-19' });
      },
    });
    expect(await stats.stats('token-de-ana', groups)).toEqual({ today: '2026-11-19' });
    expect(seen[0]!.url).toBe('https://u.example.co/rest/v1/rpc/admin_usage');
    expect(seen[0]!.headers.get('Authorization')).toBe('Bearer token-de-ana');
    expect(seen[0]!.headers.get('apikey')).toBe('sb_publishable_x');
    expect(JSON.parse(seen[0]!.body)).toEqual({ p: groups });
  });

  it('a refusal is an error with its status', async () => {
    const stats = supabaseUsageStats({
      supabaseUrl: 'https://u.example.co',
      publishableKey: 'k',
      fetch: async () => new Response('{}', { status: 403 }),
    });
    await expect(stats.stats('t', groups)).rejects.toThrow('admin_usage: 403');
  });
});
