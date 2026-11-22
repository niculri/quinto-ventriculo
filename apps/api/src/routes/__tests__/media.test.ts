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
});
