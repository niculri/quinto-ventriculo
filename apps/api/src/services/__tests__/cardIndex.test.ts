// Tests for the answer with a card browser index: gzip as it is for a browser that takes it, plain for one that does not.
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PREVIEW_HEADER } from '@qv/schema/http';
import { cardIndexResponse } from '../cardIndex';

const PLAIN = '{"cards":[1,2,3]}';
const gzipped = () => new Uint8Array(gzipSync(PLAIN));
const streamOf = (bytes: Uint8Array) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });

describe('cardIndexResponse', () => {
  it('a browser that takes gzip gets the bytes as they are, marked as gzip', async () => {
    const r = cardIndexResponse(
      { body: gzipped(), contentType: 'x', etag: '"e"' },
      { preview: false, acceptsGzip: true },
    );
    expect(r.headers.get('Content-Encoding')).toBe('gzip');
    expect(r.headers.get('ETag')).toBe('"e"');
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(gzipped());
  });

  it('one that does not gets the JSON itself, whatever shape the store gave the bytes in', async () => {
    for (const body of [gzipped(), gzipped().buffer, streamOf(gzipped())]) {
      const r = cardIndexResponse(
        { body: body as Uint8Array, contentType: 'x' },
        { preview: false, acceptsGzip: false },
      );
      expect(r.headers.get('Content-Encoding')).toBeNull();
      expect(await r.text()).toBe(PLAIN);
    }
  });

  it('the draft’s index is never kept and says it is the draft; the published one is kept', () => {
    const object = { body: gzipped(), contentType: 'x' };
    const draft = cardIndexResponse(object, { preview: true, acceptsGzip: true });
    expect(draft.headers.get('Cache-Control')).toBe('no-store');
    expect(draft.headers.get(PREVIEW_HEADER)).toBe('draft');
    const published = cardIndexResponse(object, { preview: false, acceptsGzip: true });
    expect(published.headers.get('Cache-Control')).toMatch(/^private, max-age=\d+$/);
    expect(published.headers.get(PREVIEW_HEADER)).toBeNull();
    expect(published.headers.get('Vary')).toContain('Accept-Encoding');
  });

  it('a store that gives no bytes at all is an error, not an empty index', () => {
    expect(() =>
      cardIndexResponse(
        { body: null as unknown as Uint8Array, contentType: 'x' },
        { preview: false, acceptsGzip: true },
      ),
    ).toThrow('The index has no body');
  });
});
