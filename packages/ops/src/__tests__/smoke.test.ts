// Tests for the smoke test, against a fake site.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { firstAsset, formatSmoke, normalizeBase, runSmoke } from '../smoke';

const HTML =
  '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-De-cK4wB.js"></script>' +
  '</head><body><div id="root"><p>El Quinto Ventrículo</p></div></body></html>';

// A body of null is a response with no content type at all (a string body always brings text/plain).
type Answer = { status: number; type?: string; body?: string | null; location?: string };

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
    return new Response(a.status === 301 || a.body === null ? null : (a.body ?? ''), {
      status: a.status,
      headers,
    });
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

describe('what each check of the smoke test refuses', () => {
  const base = 'https://www.quintoventriculo.cl';
  const run = async (change: Record<string, Answer | 'network'>) =>
    (await runSmoke(base, { fetch: site(change).fetchFn })).checks;
  const detailOf = (checks: { ok: boolean; detail: string }[], index: number) => checks[index]!;

  it('a redirect where there should be a page is a failure that says where it goes', async () => {
    const checks = await run({
      [`${base}/`]: { status: 302, location: 'https://elsewhere.test/' },
    });
    expect(detailOf(checks, 0)).toMatchObject({
      ok: false,
      detail: 'respondió 302 → https://elsewhere.test/, no 200',
    });
  });

  it('a page without a content type, or with another one, is not HTML', async () => {
    const none = await run({ [`${base}/`]: { status: 200, body: null } });
    expect(detailOf(none, 0).detail).toBe('respondió sin tipo, no HTML');
    const json = await run({ [`${base}/`]: { status: 200, type: 'application/json', body: HTML } });
    expect(detailOf(json, 0).detail).toBe('respondió application/json, no HTML');
  });

  it('a home page with the app but with no script still passes it, and says the script is missing', async () => {
    const checks = await run({
      [`${base}/`]: { status: 200, type: 'text/html', body: '<div id="root"></div>' },
    });
    expect(detailOf(checks, 0)).toEqual({
      name: 'La portada responde con la app',
      ok: true,
      detail: '200, HTML con la app (sin scripts de /assets/)',
    });
    expect(detailOf(checks, 1)).toMatchObject({
      ok: false,
      detail: expect.stringContaining('ningún'),
    });
  });

  it('an asset must be JavaScript: another type or none is refused', async () => {
    const asset = `${base}/assets/index-De-cK4wB.js`;
    const html = await run({ [asset]: { status: 200, type: 'text/html', body: '<p>' } });
    expect(detailOf(html, 1).detail).toBe('/assets/index-De-cK4wB.js: respondió text/html');
    const none = await run({ [asset]: { status: 200, body: null } });
    expect(detailOf(none, 1).detail).toBe('/assets/index-De-cK4wB.js: respondió sin tipo');
  });

  it('a route of the app must also be HTML', async () => {
    const route = `${base}/semesters/1`;
    const json = await run({ [route]: { status: 200, type: 'application/json', body: '{}' } });
    expect(detailOf(json, 2).detail).toBe('respondió application/json, no HTML');
    const none = await run({ [route]: { status: 200, body: null } });
    expect(detailOf(none, 2).detail).toBe('respondió sin tipo, no HTML');
  });

  it('the API health answers { ok: true }, and the version is optional', async () => {
    const notOk = await run({
      [`${base}/api/health`]: { status: 200, type: 'application/json', body: '{"ok":false}' },
    });
    expect(detailOf(notOk, 3).detail).toBe('respondió 200 sin { ok: true }');
    const noVersion = await run({
      [`${base}/api/health`]: { status: 200, type: 'application/json', body: '{"ok":true}' },
    });
    expect(detailOf(noVersion, 3)).toMatchObject({ ok: true, detail: '200 (sin versión)' });
    const numeric = await runSmoke(base, {
      fetch: site({
        [`${base}/api/health`]: {
          status: 200,
          type: 'application/json',
          body: '{"ok":true,"version":7}',
        },
      }).fetchFn,
    });
    expect(numeric.version).toBeNull();
  });

  it('the bare domain must answer 301 exactly, and with a destination', async () => {
    const probe = 'https://quintoventriculo.cl/semesters/1?smoke=1';
    const temporary = await run({
      [probe]: { status: 302, location: `${base}/semesters/1?smoke=1` },
    });
    expect(temporary.at(-1)!.detail).toBe(`${probe} respondió 302, no 301`);
    const lost = await run({ [probe]: { status: 301 } });
    expect(lost.at(-1)!.detail).toContain('301 a (sin destino), no a');
  });

  it('a failure that is not an Error is shown as text', async () => {
    const fetchFn = (() => Promise.reject('plain string')) as unknown as typeof fetch;
    const result = await runSmoke(base, { fetch: fetchFn });
    expect(result.checks[0]!.detail).toBe('plain string');
  });

  describe('the report', () => {
    it('counts the failed checks and marks each line', async () => {
      const result = await runSmoke(base, {
        fetch: site({
          [`${base}/api/me`]: { status: 500 },
          [`${base}/api/health`]: { status: 503 },
        }).fetchFn,
      });
      const lines = formatSmoke(base, result);
      expect(lines.at(-1)).toBe('Falló 2 de 6.');
      expect(lines.filter((l) => l.startsWith('  ✗'))).toHaveLength(2);
      expect(lines.filter((l) => l.startsWith('  ✓'))).toHaveLength(4);
    });
  });

  describe('without an injected fetch', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('uses the global fetch, never follows redirects and gives every request a timeout', async () => {
      const calls: RequestInit[] = [];
      vi.stubGlobal('fetch', async (_url: URL, init: RequestInit) => {
        calls.push(init);
        return new Response('', { status: 404 });
      });
      const result = await runSmoke('https://quinto.example.workers.dev');
      expect(result.ok).toBe(false);
      expect(calls).toHaveLength(4);
      expect(calls.every((c) => c.redirect === 'manual' && c.signal instanceof AbortSignal)).toBe(
        true,
      );
    });
  });
});
