// Tests for the Analytics Engine reader of the opens: the SQL API's account, token, dataset and counts.
import { describe, expect, it } from 'vitest';
import { analyticsEngineReader } from '../analytics-engine';
import { bodyOf } from '../../../test/fetch';

describe('analyticsEngineReader', () => {
  it('the SQL API: the account, the token, the dataset, and its counts as text', async () => {
    const sent: { url: string; auth: string | null; sql: string }[] = [];
    const reader = analyticsEngineReader({
      accountId: 'cuenta-de-prueba',
      token: 'token-de-prueba',
      fetch: (async (url: string, init: RequestInit) => {
        const sql = bodyOf(init);
        sent.push({ url, auth: new Headers(init.headers).get('Authorization'), sql });
        const data = sql.includes('toStartOfInterval')
          ? [{ hour: '2026-11-09 13:00:00', kind: 'note', n: '7' }]
          : sql.includes('blob2')
            ? [{ kind: 'note', path: '/api/notes/apunte', n: '7' }]
            : [{ context: 'home', n: 2 }];
        return new Response(JSON.stringify({ meta: [], data, rows: data.length }));
      }) as typeof fetch,
    });
    expect(await reader.read()).toEqual({
      hourly: [{ hour: '2026-11-09T13:00:00Z', kind: 'note', count: 7 }],
      items: [{ kind: 'note', path: '/api/notes/apunte', count: 7 }],
      searches: [{ context: 'home', count: 2 }],
    });
    expect(sent).toHaveLength(3);
    for (const s of sent) {
      expect(s.url).toBe(
        'https://api.cloudflare.com/client/v4/accounts/cuenta-de-prueba/analytics_engine/sql',
      );
      expect(s.auth).toBe('Bearer token-de-prueba');
      expect(s.sql).toContain('FROM qv_usage');
      expect(s.sql).toMatch(/FORMAT JSON$/);
    }
  });
});
