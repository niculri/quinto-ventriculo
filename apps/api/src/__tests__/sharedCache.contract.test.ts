// Tests of the shared cache of the material: the next student gets a read without the content database, and nothing
// comes out of it past the gates, for a course turned off, in the admin mode or after a publication.
import { describe, expect, it } from 'vitest';
import { Catalog } from '@qv/schema';
import { API_ROUTES, PREVIEW_HEADER } from '@qv/schema/http';
import type { ApiRouteName } from '@qv/schema/http';
import { memoryContentCache } from '../adapters/memory/contentCache';
import { memoryRateLimiter } from '../adapters/memory/rateLimit';
import { CACHE_HEADER } from '../middleware/sharedContent';
import { ADMIN, NOW, OFF, REFUSED, SHOWN, cacheApp } from '../test/cacheApp';

const PREVIEW = { [PREVIEW_HEADER]: 'draft' };

/** The reads of the material that go through the shared cache, with a path that answers 200, and the reads they make. */
const CACHED = {
  catalog: ['/api/catalog', 'catalog'],
  note: [`/api/notes/ap-${SHOWN}`, 'note'],
  deck: ['/api/decks/10', 'deckJson'],
  card: ['/api/cards/g-shown/0', 'card'],
  quizzes: [`/api/quizzes?course=${SHOWN}`, 'quizzes'],
  quiz: [`/api/quizzes/test-${SHOWN}`, 'quiz'],
  quizSection: [`/api/quizzes/test-${SHOWN}/sections/unica`, 'quizSectionJson'],
  cardChanges: ['/api/anki/card-changes?since=0', 'cardChanges'],
} as const satisfies Partial<Record<ApiRouteName, readonly [string, string]>>;

/** Every other route of the contract, and why it is not in the shared cache. */
const NOT_CACHED = {
  health: 'no material',
  deepHealth: 'no material',
  me: "the student's own",
  search: 'what is searched is what a student typed',
  cardIndex: 'read from the media store, not the content database',
  thumbs: 'one signature, no read of the content database',
  siteSettings: 'administration',
  setSiteSettings: 'a write',
  unpublished: 'administration',
  usageOpen: 'a write',
  clientError: 'a write',
  usage: 'administration',
  cardQuality: 'administration',
  release: 'administration',
  releaseItems: 'administration',
  releaseTexts: 'administration',
  releaseMedia: 'administration',
  releaseMarks: 'a write',
  publishRelease: 'a write',
  revertRelease: 'a write',
  releaseLog: 'administration',
  news: 'kept a minute in each isolate by its own service',
  announcements: 'administration',
  saveAnnouncement: 'a write',
  withdrawAnnouncement: 'a write',
  media: 'an image, not a read of the content database',
} as const satisfies Partial<Record<ApiRouteName, string>>;

const sameHeaders = (r: Response) => ({
  status: r.status,
  type: r.headers.get('Content-Type'),
  cacheControl: r.headers.get('Cache-Control'),
  vary: r.headers.get('Vary'),
  etag: r.headers.get('ETag'),
});

describe('the shared cache of the material', () => {
  it('accounts for every route of the contract', () => {
    expect([...Object.keys(CACHED), ...Object.keys(NOT_CACHED)].sort()).toEqual(
      Object.keys(API_ROUTES).sort(),
    );
  });

  it.each(Object.entries(CACHED))(
    '%s: the second student gets the first one’s answer, byte by byte, without reading it again',
    async (_, [path, read]) => {
      const { get, reads } = cacheApp();
      const first = await get(path, 'ana');
      const firstBody = await first.text();
      expect(first.headers.get(CACHE_HEADER)).toBe('miss');
      const before = reads[read];
      const second = await get(path, 'beto');
      expect(second.headers.get(CACHE_HEADER)).toBe('hit');
      expect(await second.text()).toBe(firstBody);
      expect(sameHeaders(second)).toEqual(sameHeaders(first));
      expect(second.headers.get('Cache-Control')).toBe('private, no-cache');
      expect(reads[read]).toBe(before);
    },
  );

  it.each(
    Object.entries(NOT_CACHED).filter(
      ([name]) => API_ROUTES[name as ApiRouteName].method === 'GET',
    ),
  )('%s never goes through it (%s)', async (name) => {
    const { get, cache } = cacheApp();
    const path = `/api${API_ROUTES[name as ApiRouteName].pattern.replace(/:[^/]+/g, 'x')}`;
    for (const who of ['ana', 'beto', ADMIN]) {
      expect((await get(path, who)).headers.get(CACHE_HEADER), name).toBeNull();
    }
    expect(cache.keys()).toEqual([]);
  });

  it('is asked only after the session, the invitation and the terms: nothing comes out for anybody else', async () => {
    const { get, app } = cacheApp();
    for (const [path] of Object.values(CACHED)) {
      expect((await get(path, 'ana')).status).toBe(200);
      for (const token of ['invalid', ...Object.keys(REFUSED)]) {
        const refused = await get(path, token);
        expect(refused.status, `${path} ${token}`).toBeGreaterThanOrEqual(401);
        expect(refused.headers.get(CACHE_HEADER)).toBeNull();
        expect(await refused.text()).not.toContain('publicado');
      }
      const anonymous = await app.request(path);
      expect(anonymous.status).toBe(401);
      expect(await anonymous.text()).not.toContain('publicado');
    }
  });

  it('a HEAD goes through the same gates, and the answer it leaves is the whole one', async () => {
    const { app, get } = cacheApp();
    for (const [path] of Object.values(CACHED)) {
      expect((await app.request(path, { method: 'HEAD' })).status, path).toBe(401);
      const head = await app.request(path, {
        method: 'HEAD',
        headers: { Authorization: 'Bearer ana' },
      });
      expect(head.status, path).toBe(200);
      expect(await head.text()).toBe('');
      const whole = await (await cacheApp().get(path, 'beto')).text();
      const after = await get(path, 'beto');
      expect(after.headers.get(CACHE_HEADER), path).toBe('hit');
      expect(await after.text()).toBe(whole);
    }
  });

  it('a student who sends the preview header, or asks for the published, neither gets nor leaves the draft', async () => {
    const { get } = cacheApp();
    for (const [path] of Object.values(CACHED)) {
      const asked = `${path}${path.includes('?') ? '&' : '?'}source=published`;
      for (const p of [path, asked]) {
        const r = await get(p, 'ana', PREVIEW);
        expect(r.headers.get(PREVIEW_HEADER), p).toBeNull();
        expect(await r.text()).not.toContain('borrador');
      }
      expect(await (await get(path, 'beto')).text()).not.toContain('borrador');
    }
  });

  it('a course turned off gives the same «no existe» as before, even with its answers in the cache', async () => {
    const { get, settings } = cacheApp();
    const off = [
      `/api/notes/ap-${OFF}`,
      '/api/decks/20',
      '/api/cards/g-off/0',
      `/api/quizzes/test-${OFF}`,
      `/api/quizzes/test-${OFF}/sections/unica`,
    ];
    for (const path of off) expect((await get(path, 'ana')).status, path).toBe(200);
    await get('/api/catalog', 'ana');

    await settings.set({ hiddenCourses: [OFF], by: ADMIN });
    for (const path of off) {
      const gone = await get(path, 'beto');
      expect(gone.status, path).toBe(404);
      expect(gone.headers.get(CACHE_HEADER)).toBe('miss');
    }
    const catalog = Catalog.parse(await (await get('/api/catalog', 'beto')).json());
    expect(catalog.semesters.flatMap((s) => s.courses.map((c) => c.id))).toEqual([SHOWN]);
    const list = await (await get(`/api/quizzes?course=${OFF}`, 'beto')).json();
    expect(list).toEqual({ quizzes: [] });

    await settings.set({ hiddenCourses: [], by: ADMIN });
    expect((await get(`/api/notes/ap-${OFF}`, 'beto')).status).toBe(200);
  });

  it('hiding the semesters without material is a key of its own', async () => {
    const { get, settings } = cacheApp();
    await get('/api/catalog', 'ana');
    await settings.set({ hideEmptySemesters: true, by: ADMIN });
    expect((await get('/api/catalog', 'beto')).headers.get(CACHE_HEADER)).toBe('miss');
  });

  it('the admin mode neither reads it nor writes it, also asking for what the students have', async () => {
    const { get, cache, draftReads } = cacheApp();
    for (const [path] of Object.values(CACHED)) await get(path, 'ana');
    const stored = cache.keys().sort();
    for (const [path] of Object.values(CACHED)) {
      for (const p of [path, `${path}${path.includes('?') ? '&' : '?'}source=published`]) {
        const r = await get(p, ADMIN, PREVIEW);
        expect(r.headers.get(CACHE_HEADER), p).toBeNull();
        expect(r.headers.get('Cache-Control')).toBe('no-store');
      }
    }
    expect(await (await get(`/api/notes/ap-${SHOWN}`, ADMIN, PREVIEW)).text()).toContain(
      'borrador',
    );
    expect(draftReads.note).toBeGreaterThan(0);
    expect(cache.keys().sort()).toEqual(stored);
    // Outside the admin mode the administrator is a student.
    expect((await get(`/api/notes/ap-${SHOWN}`, ADMIN)).headers.get(CACHE_HEADER)).toBe('hit');
  });

  it('a publication, an undo or a piece taken off changes the key: the next read is new', async () => {
    const { get, clock, reads } = cacheApp();
    await get('/api/catalog', 'ana');
    for (const version of ['r2.u0', 'r2x.u0', 'r2x.u1']) {
      clock.version = version;
      const r = await get('/api/catalog', 'beto');
      expect(r.headers.get(CACHE_HEADER), version).toBe('miss');
    }
    expect(reads.catalog).toBe(4);
  });

  it('without a content version nothing is kept', async () => {
    const { get, clock, cache, reads } = cacheApp();
    clock.version = null;
    await get('/api/catalog', 'ana');
    const r = await get('/api/catalog', 'beto');
    expect(r.headers.get(CACHE_HEADER)).toBeNull();
    expect(reads.catalog).toBe(2);
    expect(cache.keys()).toEqual([]);
  });

  it('keeps only whole answers: a «no existe» is read again every time', async () => {
    const { get, cache, reads } = cacheApp();
    for (const who of ['ana', 'beto'])
      expect((await get('/api/notes/ap-nunca', who)).status).toBe(404);
    expect(reads.note).toBe(2);
    expect(cache.keys()).toEqual([]);
  });

  it('nothing of the student is in it: the keys are the validator and the address', async () => {
    const { get, cache } = cacheApp();
    for (const [path] of Object.values(CACHED)) await get(path, 'ana-unica');
    expect(cache.keys().length).toBe(Object.keys(CACHED).length);
    for (const key of cache.keys()) expect(key).not.toMatch(/ana-unica/);
  });

  it('a new hour is a new key, and what came from the cache is what signing anew in that hour gives', async () => {
    const { get, clock } = cacheApp();
    const path = `/api/notes/ap-${SHOWN}`;
    await get(path, 'ana');
    clock.now = NOW + 3600;
    const fresh = await get(path, 'ana');
    expect(fresh.headers.get(CACHE_HEADER)).toBe('miss');
    const kept = await get(path, 'beto');
    expect(kept.headers.get(CACHE_HEADER)).toBe('hit');
    const alone = cacheApp({ contentCache: memoryContentCache(() => NOW + 3600) });
    alone.clock.now = NOW + 3600;
    expect(await kept.text()).toBe(await (await alone.get(path, 'beto')).text());
  });

  it('an answer whose hour ended while it was being made is not kept', async () => {
    let calls = 0;
    // The validator is made in the last second of the hour, the images are signed in the next one.
    const { get, cache } = cacheApp({ now: () => (calls++ === 0 ? NOW + 3599 : NOW + 3600) });
    expect((await get(`/api/notes/ap-${SHOWN}`, 'ana')).status).toBe(200);
    expect(cache.keys()).toEqual([]);
  });

  it('lasts at most its time, and never past the end of the hour', async () => {
    const { get, clock } = cacheApp({ contentCacheTtl: 900 });
    const path = '/api/catalog';
    clock.now = NOW + 10;
    await get(path, 'ana');
    clock.now = NOW + 10 + 899;
    expect((await get(path, 'beto')).headers.get(CACHE_HEADER)).toBe('hit');
    clock.now = NOW + 10 + 900;
    expect((await get(path, 'beto')).headers.get(CACHE_HEADER)).toBe('miss');
    clock.now = NOW + 3590;
    await get(path, 'ana');
    clock.now = NOW + 3599;
    expect((await get(path, 'beto')).headers.get(CACHE_HEADER)).toBe('hit');
  });

  it('an answer from the cache still counts for the student’s limit of requests', async () => {
    const holder = { now: NOW };
    const { get } = cacheApp({ studentRateLimit: memoryRateLimiter(2, 10, () => holder.now) });
    expect((await get('/api/catalog', 'ana')).status).toBe(200);
    expect((await get('/api/catalog', 'ana')).headers.get(CACHE_HEADER)).toBe('hit');
    expect((await get('/api/catalog', 'ana')).status).toBe(429);
  });

  it('the browser’s 304 comes before the cache, as before', async () => {
    const { get, cache } = cacheApp();
    const first = await get('/api/catalog', 'ana');
    const again = await get('/api/catalog', 'ana', { 'If-None-Match': first.headers.get('ETag')! });
    expect(again.status).toBe(304);
    expect(again.headers.get(CACHE_HEADER)).toBeNull();
    expect(cache.keys().length).toBe(1);
  });
});
