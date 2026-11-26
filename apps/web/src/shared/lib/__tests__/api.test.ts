// Tests the content API client: what each request carries (token, body, cache, signal) and how each failure reads.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, PREVIEW_HEADERS, createApiClient, forgetKeptAnswers } from '../api';

type Call = [string, RequestInit];

let respond: (url: string, init: RequestInit) => Promise<Response>;
const fetchMock = vi.fn((url: string, init: RequestInit) => respond(url, init));
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const lastCall = () => fetchMock.mock.calls.at(-1) as Call;

beforeEach(() => {
  fetchMock.mockClear();
  respond = () => json({ query: 'ribo', results: [] });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('what a request carries', () => {
  it('the session’s token when there is one, and nothing in its place when there is none', async () => {
    await createApiClient(async () => 'abc', 'https://qv.test').search('ribo', 8);
    const [url, init] = lastCall();
    expect(url).toBe('https://qv.test/api/search?q=ribo&limit=8');
    expect(init.headers).toEqual({ Authorization: 'Bearer abc' });
    await createApiClient(async () => null).search('ribo');
    expect(lastCall()[1].headers).toEqual({});
    expect(lastCall()[1]).not.toHaveProperty('method');
  });

  it('a body as JSON, with its method, and a count that survives leaving the page', async () => {
    respond = () => json({ ok: true });
    await createApiClient(async () => null).usageOpen({ kind: 'search', from: 'home' });
    const [, init] = lastCall();
    expect(init).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ kind: 'search', from: 'home' }),
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('the browser’s copy unless asked fresh; in the admin mode, never any copy', async () => {
    respond = () => json({});
    const plain = createApiClient(async () => null);
    await plain.catalog().catch(() => {});
    expect(lastCall()[1]).not.toHaveProperty('cache');
    await plain.catalog(undefined, { fresh: true }).catch(() => {});
    expect(lastCall()[1].cache).toBe('reload');
    const admin = createApiClient(async () => null, '', PREVIEW_HEADERS);
    await admin.catalog().catch(() => {});
    expect(lastCall()[1]).toMatchObject({ cache: 'no-store', headers: PREVIEW_HEADERS });
    await admin.catalog(undefined, { fresh: true }).catch(() => {});
    expect(lastCall()[1].cache).toBe('no-store');
  });

  it('the signal that cancels it', async () => {
    const signal = new AbortController().signal;
    await createApiClient(async () => null).search('ribo', 20, signal);
    expect(lastCall()[1].signal).toBe(signal);
  });
});

describe('a failure', () => {
  const api = () => createApiClient(async () => null);

  it('without a connection reads as «offline», with status 0', async () => {
    respond = () => Promise.reject(new TypeError('Failed to fetch'));
    await expect(api().search('ribo')).rejects.toEqual(
      new ApiRequestError(0, 'offline', 'No hay conexión con el servidor. Revisa tu internet.'),
    );
  });

  it('a cancelled request stays cancelled, not offline', async () => {
    const aborted = new DOMException('The operation was aborted.', 'AbortError');
    respond = () => Promise.reject(aborted);
    await expect(api().search('ribo')).rejects.toBe(aborted);
  });

  it('keeps the code and message the API gave', async () => {
    respond = () => json({ error: 'not_found', message: 'No existe ese apunte.' }, 404);
    const e = await api()
      .search('ribo')
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiRequestError);
    expect(e).toMatchObject({ status: 404, code: 'not_found', message: 'No existe ese apunte.' });
    expect(e).toMatchObject({ retryAfter: null });
  });

  it.each([
    ['10', 10],
    ['Wed, 25 Nov 2026 12:00:00 GMT', null],
    [null, null],
  ])('a 429 keeps the seconds of its Retry-After (%s → %s)', async (header, seconds) => {
    respond = () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'rate_limited', message: 'Espera unos segundos.' }), {
          status: 429,
          headers: header ? { 'Retry-After': header } : {},
        }),
      );
    await expect(api().search('ribo')).rejects.toMatchObject({
      status: 429,
      code: 'rate_limited',
      message: 'Espera unos segundos.',
      retryAfter: seconds,
    });
  });

  it.each([
    [
      'a body that is not JSON',
      () => Promise.resolve(new Response('<html>502</html>', { status: 502 })),
    ],
    ['JSON that is not an error of the API', () => json({ oops: true }, 500)],
  ])('with %s, reads as an unknown error of the server', async (_, response) => {
    respond = response;
    await expect(api().search('ribo')).rejects.toMatchObject({
      code: 'unknown',
      message: 'El servidor respondió con un error. Intenta de nuevo.',
    });
  });

  it('an answer that is not what the route promises is refused, even with status 200', async () => {
    respond = () => json({ query: 'ribo' });
    await expect(api().search('ribo')).rejects.toThrow(/results/);
  });
});

describe('the answers kept with their validator', () => {
  const FOUND = { query: 'ribo', results: [] };
  const tagged = (body: unknown, tag: string | null, status = 200) =>
    Promise.resolve(
      new Response(status === 304 ? null : JSON.stringify(body), {
        status,
        headers: tag ? { ETag: tag } : {},
      }),
    );
  const ifNoneMatch = () => (lastCall()[1].headers as Record<string, string>)['If-None-Match'];

  it('sends the validator back, outside the browser’s cache, and a 304 is the same answer, not parsed again', async () => {
    const api = createApiClient(async () => 't');
    respond = () => tagged(FOUND, 'W/"v1"');
    const first = await api.search('ribo');
    expect(ifNoneMatch()).toBeUndefined();
    expect(lastCall()[1]).not.toHaveProperty('cache');
    respond = () => tagged(null, 'W/"v1"', 304);
    expect(await api.search('ribo')).toBe(first);
    expect(ifNoneMatch()).toBe('W/"v1"');
    expect(lastCall()[1].cache).toBe('no-store');
  });

  it('a new answer replaces the kept one; one without a validator is not kept', async () => {
    const api = createApiClient(async () => 't');
    respond = () => tagged(FOUND, 'W/"v1"');
    await api.search('ribo');
    respond = () => tagged({ ...FOUND, query: 'otra' }, 'W/"v2"');
    expect((await api.search('ribo')).query).toBe('otra');
    respond = () => tagged(FOUND, null);
    await api.search('ribo');
    expect(ifNoneMatch()).toBe('W/"v2"');
    await api.search('ribo');
    expect(ifNoneMatch()).toBeUndefined();
  });

  it('checking again without a connection, with the server down or too many requests in a row, keeps what was shown; a 404 is said', async () => {
    const api = createApiClient(async () => 't');
    respond = () => tagged(FOUND, 'W/"v1"');
    const first = await api.search('ribo');
    respond = () => Promise.reject(new TypeError('Failed to fetch'));
    expect(await api.search('ribo')).toBe(first);
    respond = () => json({ error: 'internal', message: 'x' }, 503);
    expect(await api.search('ribo')).toBe(first);
    respond = () => json({ error: 'rate_limited', message: 'x' }, 429);
    expect(await api.search('ribo')).toBe(first);
    respond = () => json({ error: 'not_found', message: 'Ya no está.' }, 404);
    await expect(api.search('ribo')).rejects.toMatchObject({ status: 404, code: 'not_found' });
  });

  it('after forgetting, each path comes once from the API past every copy, and then with its validator', async () => {
    const api = createApiClient(async () => 't');
    respond = () => tagged(FOUND, 'W/"v1"');
    await api.search('ribo');
    await api.note('a-b').catch(() => undefined);
    forgetKeptAnswers(api);
    respond = () => tagged(FOUND, 'W/"v2"');
    await api.search('ribo');
    expect(lastCall()[1].cache).toBe('reload');
    expect(ifNoneMatch()).toBeUndefined();
    await api.search('ribo');
    expect(ifNoneMatch()).toBe('W/"v2"');
    respond = () => tagged(null, 'W/"v2"', 304);
    await api.note('a-b').catch(() => undefined);
    expect(lastCall()[1].cache).toBe('reload');
  });

  it('nothing of the admin mode, nor of a write, is kept', async () => {
    const admin = createApiClient(async () => 't', '', PREVIEW_HEADERS);
    respond = () => tagged(FOUND, 'W/"v1"');
    await admin.search('ribo');
    await admin.search('ribo');
    expect(ifNoneMatch()).toBeUndefined();
    forgetKeptAnswers(admin);
    const api = createApiClient(async () => 't');
    respond = () => tagged({ ok: true }, 'W/"v1"');
    await api.usageOpen({ kind: 'search', from: 'home' });
    await api.usageOpen({ kind: 'search', from: 'home' });
    expect(ifNoneMatch()).toBeUndefined();
  });
});

describe('the images’ links', () => {
  const NOW = 1_800_000_000;
  const found = (e: number) => ({
    query: 'ribo',
    results: [
      {
        noteId: 'AP-BC-C2-11',
        noteSlug: 'a-b',
        noteTitle: 'A',
        courseName: 'B',
        anchor: 'x',
        section: 'X',
        snippet: `<img src="/api/media/notes/a.webp?e=${String(e)}&amp;s=firma${String(e)}">`,
        score: 1,
      },
    ],
  });
  afterEach(() => vi.useRealTimers());

  it('an answer with an image already given gets its first link, and is not kept with a validator', async () => {
    vi.useFakeTimers({ now: NOW * 1000, toFake: ['Date'] });
    const api = createApiClient(async () => 't');
    const tagged = (body: unknown) =>
      Promise.resolve(new Response(JSON.stringify(body), { headers: { ETag: 'W/"v1"' } }));
    respond = () => tagged(found(NOW + 7200));
    const first = (await api.search('ribo')).results[0]!.snippet;
    vi.setSystemTime((NOW + 3600) * 1000);
    respond = () => tagged(found(NOW + 10_800));
    expect((await api.search('ribo')).results[0]!.snippet).toBe(first);
    await api.search('ribo');
    expect((lastCall()[1].headers as Record<string, string>)['If-None-Match']).toBeUndefined();
  });

  it('with a clock that runs late, a link the API is about to refuse is not handed out again', async () => {
    vi.useFakeTimers({ now: NOW * 1000, toFake: ['Date'] });
    const api = createApiClient(async () => 't');
    // The API's clock is 50 min ahead: the first link has 10 min left for it, an hour for this one.
    const dated = (body: unknown) =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          headers: { Date: new Date((NOW + 3000) * 1000).toUTCString() },
        }),
      );
    respond = () => dated(found(NOW + 3600));
    await api.search('ribo');
    respond = () => dated(found(NOW + 7200));
    expect((await api.search('ribo')).results[0]!.snippet).toContain(`e=${String(NOW + 7200)}`);
  });

  it('a body that is not JSON is still a failure with the API’s words, or the server’s', async () => {
    respond = () => Promise.resolve(new Response('<html>', { status: 502 }));
    await expect(createApiClient(async () => null).search('ribo')).rejects.toMatchObject({
      status: 502,
      code: 'unknown',
    });
    const cut = new ReadableStream({ start: (c) => c.error(new Error('cortado')) });
    respond = () => Promise.resolve(new Response(cut, { status: 500 }));
    await expect(createApiClient(async () => null).search('ribo')).rejects.toMatchObject({
      status: 500,
      code: 'unknown',
    });
  });
});
