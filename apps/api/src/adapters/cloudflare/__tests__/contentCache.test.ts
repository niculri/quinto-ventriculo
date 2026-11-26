// Tests of the shared cache of the material on the Cache API: a digest only the Worker's secret gives, only the type and
// the time stored, a failing cache is a miss, and no Workers cache answers its addresses before the Worker.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { cloudflareContentCache } from '../contentCache';

const SECRET = 'secreto-de-prueba-0123456789-0123456789';

function fakeCache() {
  const stored = new Map<string, Response>();
  const cache = {
    match: async (key: Request) => stored.get(key.url)?.clone(),
    put: async (key: Request, response: Response) => {
      stored.set(key.url, response);
    },
  } as unknown as Cache;
  return { cache, stored };
}

const answer = () =>
  new Response('{"ok":true}', {
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'private, no-cache',
      Vary: 'Authorization',
      ETag: 'W/"x"',
    },
  });

describe('the shared cache on the Cache API', () => {
  it('stores under a digest of the key, with only the type and how long to keep it', async () => {
    const { cache, stored } = fakeCache();
    const shared = cloudflareContentCache(cache, 'https://site.test/', SECRET);
    await shared.put('W/"r1" /api/notes/secreto', answer(), 120.7);
    const [[url, response]] = [...stored.entries()] as [[string, Response]];
    expect(url).toMatch(/^https:\/\/site\.test\/__qv-content-cache\/[0-9a-f]{64}$/);
    expect(url).not.toContain('secreto');
    expect(Object.fromEntries(response.headers)).toEqual({
      'cache-control': 'max-age=120',
      'content-type': 'application/json; charset=UTF-8',
    });
    const hit = await shared.match('W/"r1" /api/notes/secreto');
    expect(hit?.contentType).toBe('application/json; charset=UTF-8');
    expect(await new Response(hit?.body).text()).toBe('{"ok":true}');
    expect(await shared.match('W/"r2" /api/notes/secreto')).toBeNull();
  });

  it('keeps at least a second, and gives a type to an answer without one', async () => {
    const { cache, stored } = fakeCache();
    const shared = cloudflareContentCache(cache, 'https://site.test', SECRET);
    await shared.put('k', new Response(new Uint8Array([1])), 0);
    const [response] = [...stored.values()];
    expect(response?.headers.get('Cache-Control')).toBe('max-age=1');
    expect(response?.headers.get('Content-Type')).toBe('application/octet-stream');
    stored.set([...stored.keys()][0]!, new Response(new Uint8Array([1])));
    expect((await shared.match('k'))?.contentType).toBe('application/octet-stream');
  });

  it('a cache that fails, or an entry without a body, is a miss and never an error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = {
      match: () => Promise.reject(new Error('down')),
      put: () => Promise.reject(new Error('down')),
    } as unknown as Cache;
    const shared = cloudflareContentCache(broken, 'https://site.test', SECRET);
    expect(await shared.match('k')).toBeNull();
    await expect(shared.put('k', answer(), 60)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
    const empty = { match: async () => new Response(null) } as unknown as Cache;
    expect(await cloudflareContentCache(empty, 'https://site.test', SECRET).match('k')).toBeNull();
  });

  it('its addresses cannot be computed from the key without the secret', async () => {
    const key = 'W/"r1.u0.-.build.abc" /api/notes/secreto';
    const urls: string[] = [];
    for (const secret of [SECRET, `${SECRET}-otro`]) {
      const { cache, stored } = fakeCache();
      await cloudflareContentCache(cache, 'https://site.test', secret).put(key, answer(), 60);
      urls.push([...stored.keys()][0]!);
    }
    expect(urls[0]).not.toBe(urls[1]);
    const plain = createHash('sha256').update(key).digest('hex');
    expect(urls[0]).not.toContain(plain);
  });
});

describe('wrangler.jsonc', () => {
  it('does not turn on the Workers cache, which answers before the Worker runs', () => {
    const text = readFileSync(new URL('../../../../wrangler.jsonc', import.meta.url), 'utf8')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/,(\s*[}\]])/g, '$1');
    const config = JSON.parse(text) as Record<string, unknown>;
    expect(config.cache).toBeUndefined();
  });
});
