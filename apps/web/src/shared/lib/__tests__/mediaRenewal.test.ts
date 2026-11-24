// Tests the renewal from the cache: a copy of the read on screen asked for once, only while its link expires too soon;
// the read on screen never changes (only a copy that signs again goes to the cache), and a refusal is not asked again.
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../api';
import { CONTENT_QUERY } from '../contentQuery';
import { renewFromCache } from '../mediaRenewal';

const PATH = '/api/media/notes/aaaa.webp';
const NOW = 1_800_000_000;
const signed = (e: number) => `${PATH}?e=${e}&amp;s=s${e}`;
const plain = (e: number) => `${PATH}?e=${e}&s=s${e}`;
const LATER = NOW + 86_400;

interface Note {
  html: string;
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let answer: () => Promise<Note> = () =>
    Promise.resolve({ html: `<p>Texto</p><img src="${signed(NOW - 10)}">` });
  const note = vi.fn(() => answer());
  const watch = (queryKey: string[], queryFn: () => Promise<unknown>, content = true) =>
    new QueryObserver(client, {
      queryKey,
      queryFn,
      ...(content ? { meta: CONTENT_QUERY } : {}),
    }).subscribe(() => undefined);
  const loaded = (key: string[]) =>
    vi.waitFor(() => expect(client.getQueryData(key)).toBeDefined());
  const reply = (next: () => Promise<Note>) => (answer = next);
  return { client, note, watch, loaded, reply };
}

async function onScreen() {
  const s = setup();
  s.watch(['note', 'a'], s.note);
  await s.loaded(['note', 'a']);
  vi.useFakeTimers({ now: NOW * 1000, toFake: ['Date'] });
  return s;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('renewFromCache', () => {
  it('a copy that only signs again goes to the cache too, and brings the new URL', async () => {
    const { client, note, reply } = await onScreen();
    reply(() => Promise.resolve({ html: `<p>Texto</p><img src="${signed(LATER)}">` }));
    const fresh = await renewFromCache(client)(PATH, NOW);
    expect(note).toHaveBeenCalledTimes(2);
    expect(fresh(PATH)).toBe(plain(LATER));
    expect(fresh('/api/media/otra.webp')).toBeNull();
    expect(client.getQueryData<Note>(['note', 'a'])!.html).toContain(signed(LATER));
  });

  it('a copy with other content leaves the read as it was, and still brings the new URL', async () => {
    const { client, reply } = await onScreen();
    reply(() => Promise.resolve({ html: `<p>Otro texto</p><img src="${signed(LATER)}">` }));
    const fresh = await renewFromCache(client)(PATH, NOW);
    expect(fresh(PATH)).toBe(plain(LATER));
    expect(client.getQueryData<Note>(['note', 'a'])!.html).toBe(
      `<p>Texto</p><img src="${signed(NOW - 10)}">`,
    );
  });

  it('a copy that fails changes nothing on the read; within half a minute it is not asked for again, then it is', async () => {
    const { client, note, reply } = await onScreen();
    reply(() => Promise.reject(new ApiRequestError(500, 'internal', 'Algo falló.')));
    const renew = renewFromCache(client);
    expect((await renew(PATH, NOW))(PATH)).toBe(plain(NOW - 10));
    const query = client.getQueryCache().find({ queryKey: ['note', 'a'] })!;
    expect(query.state.status).toBe('success');
    expect(query.state.error).toBeNull();
    await renew(PATH, NOW);
    expect(note).toHaveBeenCalledTimes(2);
    vi.setSystemTime((NOW + 31) * 1000);
    await renew(PATH, NOW + 31);
    expect(note).toHaveBeenCalledTimes(3);
  });

  it('a read the API refused (a piece taken off the site) is never asked for again', async () => {
    const { client, note, reply } = await onScreen();
    reply(() => Promise.reject(new ApiRequestError(404, 'not_found', 'No existe.')));
    const renew = renewFromCache(client);
    await renew(PATH, NOW);
    vi.setSystemTime((NOW + 3600) * 1000);
    expect((await renew(PATH, NOW + 3600))(PATH)).toBe(plain(NOW - 10));
    expect(note).toHaveBeenCalledTimes(2);
  });

  it('asked for again only while its link expires before the time given, and once for all the images together', async () => {
    const { client, note, reply } = await onScreen();
    reply(() => Promise.resolve({ html: `<p>Texto</p><img src="${signed(LATER)}">` }));
    const renew = renewFromCache(client);
    const [a, b] = await Promise.all([renew(PATH, NOW), renew(PATH, NOW)]);
    expect(note).toHaveBeenCalledTimes(2);
    expect(a(PATH)).toBe(b(PATH));
    // Its link now lasts a day: nothing is asked for until the time given reaches it.
    vi.setSystemTime((NOW + 60) * 1000);
    await renew(PATH, NOW + 60);
    expect(note).toHaveBeenCalledTimes(2);
    await renew(PATH, LATER + 1);
    expect(note).toHaveBeenCalledTimes(3);
  });

  it('leaves alone what is not material, not on screen, has no answer, has no link or does not carry the image', async () => {
    const { client, note, watch, loaded } = setup();
    const other = vi.fn(() =>
      Promise.resolve({ html: '<img src="/api/media/otra.webp?e=1&s=x">' }),
    );
    const progress = vi.fn(() => Promise.resolve({ html: `<img src="${signed(1)}">` }));
    const unsigned = vi.fn(() => Promise.resolve({ html: `<img src="${PATH}">` }));
    const pending = vi.fn(() => new Promise<never>(() => undefined));
    watch(['note', 'b'], other);
    watch(['progress'], progress, false);
    watch(['note', 'u'], unsigned);
    watch(['note', 'c'], pending);
    await client.query({ queryKey: ['note', 'gone'], queryFn: note, meta: CONTENT_QUERY });
    await loaded(['note', 'b']);
    await loaded(['progress']);
    await loaded(['note', 'u']);
    const fresh = await renewFromCache(client)(PATH, NOW);
    expect(fresh(PATH)).toBeNull();
    for (const read of [other, progress, unsigned, note, pending]) {
      expect(read).toHaveBeenCalledTimes(1);
    }
  });
});
