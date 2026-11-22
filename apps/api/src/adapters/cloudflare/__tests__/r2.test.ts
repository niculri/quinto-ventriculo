// Tests for the media store on R2: what a missing object, a typeless one and a head answer.
import { describe, expect, it } from 'vitest';
import { r2Store } from '../r2';

const bucket = (objects: Record<string, { contentType?: string; etag: string }>) =>
  ({
    get: async (key: string) => {
      const o = objects[key];
      return o
        ? {
            body: new ReadableStream(),
            httpEtag: o.etag,
            httpMetadata: o.contentType ? { contentType: o.contentType } : undefined,
          }
        : null;
    },
    head: async (key: string) => (objects[key] ? {} : null),
  }) as unknown as R2Bucket;

describe('r2Store', () => {
  it('an object that is not there is null, and one without a type is bytes', async () => {
    const store = r2Store(
      bucket({ 'a.png': { contentType: 'image/png', etag: '"1"' }, b: { etag: '"2"' } }),
    );
    expect(await store.get('nada')).toBeNull();
    expect((await store.get('a.png'))?.contentType).toBe('image/png');
    expect(await store.get('b')).toMatchObject({
      contentType: 'application/octet-stream',
      etag: '"2"',
    });
  });

  it('has asks only for the head, not for the body', async () => {
    const store = r2Store(bucket({ 'a.png': { etag: '"1"' } }));
    expect(await store.has?.('a.png')).toBe(true);
    expect(await store.has?.('nada')).toBe(false);
  });
});
