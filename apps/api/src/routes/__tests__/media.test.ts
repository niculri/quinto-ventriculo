// Tests for GET /api/media: how long the browser may keep an image, which never outlasts its signed link.
import { describe, expect, it } from 'vitest';
import { memoryRepository } from '../../adapters/memory/content';
import { createApp } from '../../app';
import { MEDIA_MAX_AGE } from '../../http';
import { MediaSigner } from '../../services/mediaSigner';
import { bundle } from '../../test/draftApp';

const NOW = 1_800_000_000;
const KEY = `tests/${'a'.repeat(32)}.webp`;
const signer = new MediaSigner('secreto-de-prueba-0123456789-0123456789');

const app = createApp({
  verifier: { verify: async () => null },
  repository: memoryRepository(bundle('x')),
  media: { get: async () => ({ body: new Uint8Array([1]), contentType: 'image/webp' }) },
  signer,
  now: () => NOW,
});

const open = async (expires: number) =>
  app.request(`/api/media/${KEY}?e=${expires}&s=${await signer.sign(KEY, expires)}`);

describe('the cache of an image', () => {
  it('lasts the time left of the link when that is less than the cap, and the cap otherwise', async () => {
    const soon = await open(NOW + 120);
    expect(soon.headers.get('Cache-Control')).toBe('private, max-age=120, immutable');
    const late = await open(NOW + 100_000);
    expect(late.headers.get('Cache-Control')).toBe(`private, max-age=${MEDIA_MAX_AGE}, immutable`);
  });

  it('a link that expires this very second is still served, for no time at all', async () => {
    const last = await open(NOW);
    expect(last.status).toBe(200);
    expect(last.headers.get('Cache-Control')).toBe('private, max-age=0, immutable');
  });

  it('is private and never taken for another type', async () => {
    const r = await open(NOW + 60);
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(r.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect(r.headers.get('ETag')).toBeNull();
  });

  it('an image the browser already has is a 304 without its bytes, and one taken off the site is still a 404', async () => {
    let stored: { etag: string } | null = { etag: '"v1"' };
    const cancelled: string[] = [];
    const checked = createApp({
      verifier: { verify: async () => null },
      repository: memoryRepository(bundle('x')),
      media: {
        get: async () =>
          stored && {
            body: new ReadableStream({ cancel: () => void cancelled.push('body') }),
            contentType: 'image/webp',
            etag: stored.etag,
          },
      },
      signer,
      now: () => NOW,
    });
    const url = `/api/media/${KEY}?e=${NOW + 60}&s=${await signer.sign(KEY, NOW + 60)}`;
    const again = await checked.request(url, { headers: { 'If-None-Match': '"v1"' } });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe('');
    expect(again.headers.get('ETag')).toBe('"v1"');
    expect(again.headers.get('Cache-Control')).toBe('private, max-age=60, immutable');
    expect(cancelled).toEqual(['body']);
    expect((await checked.request(url, { headers: { 'If-None-Match': '"v0"' } })).status).toBe(200);
    stored = null;
    expect((await checked.request(url, { headers: { 'If-None-Match': '"v1"' } })).status).toBe(404);
    const expired = `/api/media/${KEY}?e=${NOW - 1}&s=${await signer.sign(KEY, NOW - 1)}`;
    expect((await checked.request(expired, { headers: { 'If-None-Match': '"v1"' } })).status).toBe(
      403,
    );
  });

  it('an image that comes whole (not a stream) is a 304 too', async () => {
    const whole = createApp({
      verifier: { verify: async () => null },
      repository: memoryRepository(bundle('x')),
      media: {
        get: async () => ({ body: new Uint8Array([1]), contentType: 'image/webp', etag: '"v1"' }),
      },
      signer,
      now: () => NOW,
    });
    const url = `/api/media/${KEY}?e=${NOW + 60}&s=${await signer.sign(KEY, NOW + 60)}`;
    expect((await whole.request(url, { headers: { 'If-None-Match': 'W/"v1"' } })).status).toBe(304);
  });
});
