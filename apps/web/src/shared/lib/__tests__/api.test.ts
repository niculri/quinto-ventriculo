// Tests the content API client: what each request carries (token, body, cache, signal) and how each failure reads.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, PREVIEW_HEADERS, createApiClient } from '../api';

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
    expect(lastCall()[1].cache).toBe('no-cache');
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
