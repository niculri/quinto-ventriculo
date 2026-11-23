// Tests for the validator of the material: a 304 that reads nothing while nothing changed, the whole answer as soon as
// a publication, a course turned off, the build or the hour change it, and never in the admin mode.
import { describe, expect, it, vi } from 'vitest';
import { PREVIEW_HEADER } from '@qv/schema/http';
import { memoryRepository } from '../../adapters/memory/content';
import { memorySiteSettings } from '../../adapters/memory/settings';
import { createApp } from '../../app';
import type { AppOptions } from '../../dependencies';
import type { ContentRepository } from '../../ports/content';
import { MediaSigner } from '../../services/mediaSigner';
import { bundle, releases } from '../../test/draftApp';
import { matchesValidator, validatorOf } from '../revalidate';

const NOW = 1_793_448_000;
const USER = { id: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' };
const ADMIN = 'admin-token';

function setup(options: Partial<AppOptions> = {}, withVersion = true) {
  let version = 'r1.u0';
  let now = NOW;
  const published = memoryRepository(bundle('Traducción'));
  const reads = { catalog: 0, note: 0, cardChanges: 0 };
  const repository: ContentRepository = {
    ...published,
    catalog: () => {
      reads.catalog += 1;
      return published.catalog();
    },
    note: (slug) => {
      reads.note += 1;
      return published.note(slug);
    },
    cardChanges: (since, limit) => {
      reads.cardChanges += 1;
      return published.cardChanges(since, limit);
    },
  };
  const current = vi.fn(() => Promise.resolve(version));
  const app = createApp({
    verifier: { verify: (t) => Promise.resolve(t === 'x' || t === ADMIN ? USER : null) },
    repository,
    preview: memoryRepository(bundle('Traducción (borrador)')),
    admins: {
      isAdmin: (t) => Promise.resolve(t === ADMIN),
      isAdminNow: () => Promise.resolve(true),
    },
    media: { get: () => Promise.resolve(null) },
    signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
    settings: memorySiteSettings(),
    releases,
    ...(withVersion ? { contentVersion: { current } } : {}),
    contentVersionTtl: 0,
    version: 'build-1',
    now: () => now,
    ...options,
  });
  const get = (path: string, headers: Record<string, string> = {}, token = 'x') =>
    app.request(path, { headers: { Authorization: `Bearer ${token}`, ...headers } });
  return {
    app,
    get,
    reads,
    current,
    setVersion: (v: string) => (version = v),
    setNow: (s: number) => (now = s),
  };
}

describe('the validator of the material', () => {
  it('is weak, and changes with the version, the courses turned off, the build and the hour', () => {
    const base = {
      version: 'r1.u0',
      settings: {
        hideEmptySemesters: false,
        hiddenCourses: ['b', 'a'],
        updatedAt: null,
        updatedBy: null,
      },
      build: 'b1',
      nowSec: NOW,
    };
    const tag = validatorOf(base);
    expect(tag).toMatch(/^W\/"r1\.u0\.[0-9a-z]+\.b1\.[0-9a-z]+"$/);
    // The order of the list does not count: the panel may send it in any order.
    expect(
      validatorOf({ ...base, settings: { ...base.settings, hiddenCourses: ['a', 'b'] } }),
    ).toBe(tag);
    for (const other of [
      { ...base, version: 'r2.u0' },
      { ...base, settings: { ...base.settings, hiddenCourses: ['a'] } },
      { ...base, settings: { ...base.settings, hideEmptySemesters: true } },
      { ...base, settings: null },
      { ...base, build: 'b2' },
      { ...base, build: null },
      { ...base, nowSec: NOW + 3600 },
    ]) {
      expect(validatorOf(other)).not.toBe(tag);
    }
    expect(validatorOf({ ...base, nowSec: NOW + 1 })).toBe(tag);
    expect(validatorOf({ ...base, build: null })).toContain('.dev.');
  });

  it('If-None-Match matches weakly, in a list, or with «*»', () => {
    const tag = 'W/"r1.u0.x.b.y"';
    expect(matchesValidator(undefined, tag)).toBe(false);
    expect(matchesValidator('', tag)).toBe(false);
    expect(matchesValidator('"r1.u0.x.b.y"', tag)).toBe(true);
    expect(matchesValidator('W/"otro", W/"r1.u0.x.b.y"', tag)).toBe(true);
    expect(matchesValidator('*', tag)).toBe(true);
    expect(matchesValidator('W/"r2.u0.x.b.y"', tag)).toBe(false);
  });
});

describe('the routes of the material, revalidated', () => {
  it('a 200 with its validator; the same validator is a 304 that reads nothing of the material', async () => {
    const { get, reads } = setup();
    const first = await get('/api/catalog');
    expect(first.status).toBe(200);
    expect(first.headers.get('Cache-Control')).toBe('private, no-cache');
    const tag = first.headers.get('ETag')!;
    expect(tag).toMatch(/^W\//);
    expect(reads.catalog).toBe(1);

    const again = await get('/api/catalog', { 'If-None-Match': tag });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe('');
    expect(again.headers.get('ETag')).toBe(tag);
    expect(again.headers.get('Cache-Control')).toBe('private, no-cache');
    expect(again.headers.get('Vary')).toBe(`Authorization, ${PREVIEW_HEADER}`);
    expect(reads.catalog).toBe(1);
  });

  it('after a publication the same validator gets the whole answer, with a new one', async () => {
    const { get, reads, setVersion } = setup();
    const tag = (await get('/api/notes/11-traduccion')).headers.get('ETag')!;
    setVersion('r2.u0');
    const after = await get('/api/notes/11-traduccion', { 'If-None-Match': tag });
    expect(after.status).toBe(200);
    expect(after.headers.get('ETag')).not.toBe(tag);
    expect(reads.note).toBe(2);
  });

  it('so does a course turned off, and the next hour (the image links are signed for it)', async () => {
    const { app, get, setNow } = setup();
    const tag = (await get('/api/catalog')).headers.get('ETag')!;
    setNow(NOW + 3600);
    expect((await get('/api/catalog', { 'If-None-Match': tag })).status).toBe(200);
    const next = (await get('/api/catalog')).headers.get('ETag')!;
    const off = await app.request('/api/admin/site-settings', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${ADMIN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ hiddenCourses: ['biologia-celular'] }),
    });
    expect(off.status).toBe(200);
    expect((await get('/api/catalog', { 'If-None-Match': next })).status).toBe(200);
  });

  it('the card changes are revalidated too, without the settings', async () => {
    const { get, reads } = setup();
    const first = await get('/api/anki/card-changes?since=0');
    const tag = first.headers.get('ETag')!;
    expect(tag).toContain('.-.');
    expect((await get('/api/anki/card-changes?since=0', { 'If-None-Match': tag })).status).toBe(
      304,
    );
    expect(reads.cardChanges).toBe(1);
  });

  it('a 404 or a 400 goes without a validator, and is not a 304 either', async () => {
    const { get } = setup();
    const tag = (await get('/api/catalog')).headers.get('ETag')!;
    const missing = await get('/api/notes/no-existe');
    expect(missing.status).toBe(404);
    expect(missing.headers.get('ETag')).toBeNull();
    expect(missing.headers.get('Cache-Control')).toBe('private, no-cache');
    const bad = await get('/api/notes/NO_VALE', { 'If-None-Match': 'W/"otro"' });
    expect(bad.status).toBe(400);
    expect(bad.headers.get('ETag')).toBeNull();
    expect(tag).toBeTruthy();
  });

  it('the admin mode is never kept nor answered with a 304', async () => {
    const { get, current } = setup();
    const tag = (await get('/api/catalog')).headers.get('ETag')!;
    const calls = current.mock.calls.length;
    const draft = await get(
      '/api/catalog',
      { [PREVIEW_HEADER]: 'draft', 'If-None-Match': tag },
      ADMIN,
    );
    expect(draft.status).toBe(200);
    expect(draft.headers.get('Cache-Control')).toBe('no-store');
    expect(draft.headers.get('ETag')).toBeNull();
    expect(current.mock.calls.length).toBe(calls);
  });

  it('without a content version, or when it cannot be read, the whole answer without a validator', async () => {
    const without = setup({}, false);
    const plain = await without.get('/api/catalog', { 'If-None-Match': '*' });
    expect(plain.status).toBe(200);
    expect(plain.headers.get('ETag')).toBeNull();
    expect(plain.headers.get('Cache-Control')).toBe('private, no-cache');

    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = setup({ contentVersion: { current: () => Promise.reject(new Error('caída')) } });
    const r = await broken.get('/api/catalog', { 'If-None-Match': '*' });
    expect(r.status).toBe(200);
    expect(r.headers.get('ETag')).toBeNull();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('publishing or undoing in this isolate forgets the version kept', async () => {
    const { app, get, current, setVersion } = setup({ contentVersionTtl: 60_000 });
    const tag = (await get('/api/catalog')).headers.get('ETag')!;
    setVersion('r2.u0');
    // Kept: other isolates see it within their few seconds.
    expect((await get('/api/catalog', { 'If-None-Match': tag })).status).toBe(304);
    const post = (path: string, body: unknown) =>
      app.request(path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ADMIN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    const published = await post('/api/admin/release/publish', {
      fingerprint: 'f'.repeat(32),
      title: 'Biología celular · Certamen 2',
      checks: { blocking: 0, pending: 0, ready: true, warnings: [], marks: [] },
    });
    expect(published.status).toBe(200);
    const fresh = await get('/api/catalog', { 'If-None-Match': tag });
    expect(fresh.status).toBe(200);
    const newTag = fresh.headers.get('ETag')!;
    setVersion('r2x.u0');
    expect((await post('/api/admin/release/revert', { id: 7 })).status).toBe(200);
    expect((await get('/api/catalog', { 'If-None-Match': newTag })).status).toBe(200);
    expect(current).toHaveBeenCalledTimes(3);
  });
});
