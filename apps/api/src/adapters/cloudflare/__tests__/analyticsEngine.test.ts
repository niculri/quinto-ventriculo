// Tests for the Analytics Engine reader of the opens: the SQL API's account, token, dataset and counts.
import { describe, expect, it } from 'vitest';
import {
  aeTime,
  analyticsEngineReader,
  analyticsEngineRecorder,
  analyticsEngineSql,
  num,
  usagePoint,
} from '../analyticsEngine';
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

const readerWith = (data: unknown, status = 200) =>
  analyticsEngineReader({
    accountId: 'cuenta',
    token: 'token',
    fetch: async () => new Response(JSON.stringify(data), { status }),
  });

describe('usagePoint', () => {
  it('cuts the path at 200 characters and leaves the context blank when there is none', () => {
    const point = usagePoint({ kind: 'note', path: `/${'a'.repeat(300)}` });
    expect(point.blobs[1]).toHaveLength(200);
    expect(point.blobs[2]).toBe('');
    expect(point.indexes).toEqual(['note']);
  });

  it('keeps the kind of page of a search', () => {
    expect(usagePoint({ kind: 'search', path: '/', context: 'home' }).blobs).toEqual([
      'search',
      '/',
      'home',
    ]);
  });
});

describe('analyticsEngineRecorder', () => {
  it('a binding that throws never reaches the answer', () => {
    const recorder = analyticsEngineRecorder({
      writeDataPoint: () => {
        throw new Error('caído');
      },
    });
    expect(() => recorder.record({ kind: 'deck', path: '/x' })).not.toThrow();
  });
});

describe('analyticsEngineSql', () => {
  it('only a plain dataset name goes into the SQL', () => {
    expect(() => analyticsEngineSql({ accountId: 'a', token: 't', dataset: 'x; DROP' })).toThrow(
      'dataset inválido',
    );
    expect(() => analyticsEngineSql({ accountId: 'a', token: 't', dataset: 'Mayus' })).toThrow();
    expect(analyticsEngineSql({ accountId: 'a', token: 't', dataset: 'otro_1' }).dataset).toBe(
      'otro_1',
    );
    expect(analyticsEngineSql({ accountId: 'a', token: 't' }).dataset).toBe('qv_usage');
  });

  it('the account goes encoded into the URL', async () => {
    const urls: string[] = [];
    const { query } = analyticsEngineSql({
      accountId: 'a/b',
      token: 't',
      fetch: (async (url: string) => {
        urls.push(url);
        return Response.json({ data: [] });
      }) as unknown as typeof fetch,
    });
    await query('SELECT 1');
    expect(urls[0]).toContain('/accounts/a%2Fb/');
  });

  it('a refused request or a body without rows is an error', async () => {
    await expect(readerWith({}, 500).read()).rejects.toThrow('Analytics Engine: 500');
    await expect(readerWith({ meta: [] }).read()).rejects.toThrow('sin filas');
    await expect(readerWith(null).read()).rejects.toThrow('sin filas');
  });
});

describe('the rows of the opens', () => {
  it('drops the rows whose kind or hour it does not know', async () => {
    const counts = await readerWith({
      data: [
        { hour: '2026-11-09 13:00:00', kind: 'deck', n: 1 },
        { hour: '2026-11-09 13:00:00', kind: 'nada', n: 1 },
        { hour: 5, kind: 'note', n: 1 },
        null,
        'texto',
      ],
    }).read();
    expect(counts.hourly).toEqual([{ hour: '2026-11-09T13:00:00Z', kind: 'deck', count: 1 }]);
  });

  it('the most opened keeps notes, decks and quizzes with a path, and nothing else', async () => {
    const counts = await readerWith({
      data: [
        { kind: 'deck', path: '/d', n: 3 },
        { kind: 'quiz', path: '/q', n: 2 },
        { kind: 'search', path: '/s', n: 9 },
        { kind: 'note', path: 4, n: 1 },
      ],
    }).read();
    expect(counts.items).toEqual([
      { kind: 'deck', path: '/d', count: 3 },
      { kind: 'quiz', path: '/q', count: 2 },
    ]);
  });

  it('a search without a kind of page counts under an empty context', async () => {
    const counts = await readerWith({ data: [{ context: null, n: 4 }] }).read();
    expect(counts.searches).toEqual([{ context: '', count: 4 }]);
  });
});

describe('num and aeTime', () => {
  it('a count is a rounded, never negative, finite number', () => {
    expect(num('2.6')).toBe(3);
    expect(num(-1)).toBe(0);
    expect(num('abc')).toBe(0);
    expect(num(Number.POSITIVE_INFINITY)).toBe(0);
    expect(num(0)).toBe(0);
  });

  it('only the «date time» of the SQL API becomes ISO; an ISO time passes as it is', () => {
    expect(aeTime('2026-11-09 13:00:00')).toBe('2026-11-09T13:00:00Z');
    expect(aeTime('2026-11-09T13:00:00Z')).toBe('2026-11-09T13:00:00Z');
    expect(aeTime('9999')).toBe('9999');
  });
});
