import { describe, expect, it } from 'vitest';
import { firstAsset, formatSmoke, normalizeBase, runSmoke } from './smoke';

const HTML =
  '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-De-cK4wB.js"></script>' +
  '</head><body><div id="root"><p>El Quinto Ventrículo</p></div></body></html>';

type Answer = { status: number; type?: string; body?: string; location?: string };

/** A site that answers like the real one; `change` replaces some answers. */
function site(change: Record<string, Answer | 'network'> = {}) {
  const asked: string[] = [];
  const answers: Record<string, Answer | 'network'> = {
    'https://www.quintoventriculo.cl/': { status: 200, type: 'text/html', body: HTML },
    'https://www.quintoventriculo.cl/assets/index-De-cK4wB.js': {
      status: 200,
      type: 'text/javascript',
      body: 'x',
    },
    'https://www.quintoventriculo.cl/semesters/1': { status: 200, type: 'text/html', body: HTML },
    'https://www.quintoventriculo.cl/api/health': {
      status: 200,
      type: 'application/json',
      body: '{"ok":true,"version":"5fccf437"}',
    },
    'https://www.quintoventriculo.cl/api/me': {
      status: 401,
      type: 'application/json',
      body: '{"error":"unauthenticated"}',
    },
    'https://quintoventriculo.cl/semesters/1?smoke=1': {
      status: 301,
      location: 'https://www.quintoventriculo.cl/semesters/1?smoke=1',
    },
    ...change,
  };
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    asked.push(`${init?.method ?? 'GET'} ${url}`);
    expect(init?.redirect).toBe('manual');
    expect(new Headers(init?.headers).get('authorization')).toBeNull();
    const a = answers[url];
    if (a === 'network') throw new TypeError('fetch failed');
    if (!a) return new Response('{"error":"not_found"}', { status: 404 });
    const headers = new Headers();
    if (a.type) headers.set('content-type', a.type);
    if (a.location) headers.set('location', a.location);
    return new Response(a.status === 301 ? null : (a.body ?? ''), { status: a.status, headers });
  }) as typeof fetch;
  return { fetchFn, asked };
}

describe('npm run smoke', () => {
  it('passes against a site that answers well, only with GETs and without a session', async () => {
    const s = site();
    const result = await runSmoke('https://www.quintoventriculo.cl', { fetch: s.fetchFn });
    expect(result.checks.filter((c) => !c.ok)).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.version).toBe('5fccf437');
    expect(result.checks).toHaveLength(6);
    expect(s.asked.every((a) => a.startsWith('GET '))).toBe(true);
    expect(formatSmoke('https://www.quintoventriculo.cl/', result).at(-1)).toBe('Todo responde.');
  });

  it('fails when the API answers without a session', async () => {
    const s = site({
      'https://www.quintoventriculo.cl/api/me': {
        status: 200,
        type: 'application/json',
        body: '{}',
      },
    });
    const result = await runSmoke('https://www.quintoventriculo.cl', { fetch: s.fetchFn });
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => !c.ok)?.detail).toContain('sin sesión');
  });

  it('fails on a 5xx of the API', async () => {
    const s = site({
      'https://www.quintoventriculo.cl/api/me': { status: 500, body: 'boom' },
      'https://www.quintoventriculo.cl/api/health': { status: 503, body: 'down' },
    });
    const result = await runSmoke('https://www.quintoventriculo.cl', { fetch: s.fetchFn });
    expect(result.ok).toBe(false);
    expect(result.checks.filter((c) => !c.ok).map((c) => c.detail)).toEqual([
      'respondió 503, no 200',
      'respondió 500, no 401',
    ]);
  });

  it('fails when the home page is not the app or the asset is missing', async () => {
    const s = site({
      'https://www.quintoventriculo.cl/': { status: 200, type: 'text/html', body: '<p>Hola</p>' },
    });
    const result = await runSmoke('https://www.quintoventriculo.cl', { fetch: s.fetchFn });
    expect(result.checks.map((c) => c.ok)).toEqual([false, false, true, true, true, true]);
  });

  it('fails when the bare domain does not redirect to www with the same path', async () => {
    const s = site({
      'https://quintoventriculo.cl/semesters/1?smoke=1': {
        status: 301,
        location: 'https://www.quintoventriculo.cl/',
      },
    });
    const result = await runSmoke('https://www.quintoventriculo.cl', { fetch: s.fetchFn });
    expect(result.ok).toBe(false);
    expect(result.checks.at(-1)?.detail).toContain(
      'no a https://www.quintoventriculo.cl/semesters/1',
    );
  });

  it('a network failure is a failed check, not a crash', async () => {
    const s = site({ 'https://www.quintoventriculo.cl/': 'network' });
    const result = await runSmoke('https://www.quintoventriculo.cl', { fetch: s.fetchFn });
    expect(result.ok).toBe(false);
    expect(result.checks[0]!.detail).toBe('fetch failed');
  });

  it('without www (workers.dev) it does not check the redirect', async () => {
    const s = site();
    const base = 'https://quinto-ventriculo.example.workers.dev';
    const fetchFn = ((input: string | URL | Request, init?: RequestInit) =>
      s.fetchFn(
        String(input).replace(base, 'https://www.quintoventriculo.cl'),
        init,
      )) as typeof fetch;
    const result = await runSmoke(base, { fetch: fetchFn });
    expect(result.checks).toHaveLength(5);
    expect(result.ok).toBe(true);
  });

  it('checks the address', () => {
    expect(normalizeBase('https://www.quintoventriculo.cl/x?y=1').href).toBe(
      'https://www.quintoventriculo.cl/',
    );
    expect(() => normalizeBase('quintoventriculo')).toThrow('no es una dirección');
    expect(() => normalizeBase('ftp://x')).toThrow('http(s)');
    expect(firstAsset('<script src="/assets/a-1.js">')).toBe('/assets/a-1.js');
    expect(firstAsset('<p>')).toBeNull();
  });
});
