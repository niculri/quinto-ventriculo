// Tests the signed image URLs: their path and expiry, the ones a text carries, the text unsigned and the same image with
// another signature.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isExpired,
  lookupIn,
  mediaExpiry,
  mediaPath,
  mediaUrlsIn,
  sameImage,
  secondsNow,
  unsignedMedia,
  untilRenewal,
} from '../signedMedia';

const A = '/api/media/notes/aaaa.webp?e=1000&s=xyz';
const B = '/api/media/cards/bbbb.webp?e=2000&s=uvw';

afterEach(() => {
  vi.useRealTimers();
});

describe('a signed URL', () => {
  it('has its path and its expiry, also written in full or with another origin', () => {
    expect(mediaPath(A)).toBe('/api/media/notes/aaaa.webp');
    expect(mediaPath(`https://www.ejemplo.cl${A}`)).toBe('/api/media/notes/aaaa.webp');
    expect(mediaExpiry(A)).toBe(1000);
    expect(mediaExpiry('/api/media/notes/aaaa.webp?s=xyz')).toBeNull();
    expect(mediaExpiry('/api/media/notes/aaaa.webp?e=1.5&s=xyz')).toBeNull();
  });

  it('what is not one has neither', () => {
    for (const src of ['/favicon.svg?e=10', 'data:image/png;base64,AAAA', 'http://[']) {
      expect(mediaPath(src), src).toBeNull();
      expect(mediaExpiry(src), src).toBeNull();
      expect(isExpired(src, 1e12), src).toBe(false);
    }
  });

  it('opens until its second of expiry, that one included', () => {
    expect(isExpired(A, 999)).toBe(false);
    expect(isExpired(A, 1000)).toBe(false);
    expect(isExpired(A, 1001)).toBe(true);
  });
});

describe('the URLs of a text', () => {
  const html = `<p><img src="${A.replace('&', '&amp;')}" alt="a"><img src='${B}'></p><img src="/x.png">`;

  it('are found in HTML (with its escaped ampersands) and in JSON', () => {
    expect(mediaUrlsIn(html)).toEqual([A, B]);
    expect(mediaUrlsIn(JSON.stringify({ html, src: A }))).toEqual([A, B, A]);
    expect(mediaUrlsIn('<p>sin imágenes</p>')).toEqual([]);
  });

  it('are looked up by their path, the last one winning', () => {
    const later = A.replace('e=1000', 'e=3000');
    const fresh = lookupIn([A, B, later, '/x.png']);
    expect(fresh('/api/media/notes/aaaa.webp')).toBe(later);
    expect(fresh('/api/media/cards/bbbb.webp')).toBe(B);
    expect(fresh('/api/media/otra.webp')).toBeNull();
  });

  it('unsigned, two answers that only sign again are the same text', () => {
    const again = html.replace('e=1000', 'e=5000').replace('s=uvw', 's=nueva');
    expect(unsignedMedia(again)).toBe(unsignedMedia(html));
    expect(unsignedMedia(html)).toBe(
      `<p><img src="/api/media/notes/aaaa.webp" alt="a"><img src='/api/media/cards/bbbb.webp'></p><img src="/x.png">`,
    );
    expect(unsignedMedia(html.replace('alt="a"', 'alt="b"'))).not.toBe(unsignedMedia(html));
  });
});

describe('the same image', () => {
  it('is one path with any signature; what is not a signed image is never the same', () => {
    expect(sameImage(A, A.replace('e=1000', 'e=9000'))).toBe(true);
    expect(sameImage(A, B)).toBe(false);
    expect(sameImage('/logo.svg', '/logo.svg')).toBe(false);
  });

  it('the time is counted in whole seconds', () => {
    vi.useFakeTimers({ now: 1_800_000_000_999 });
    expect(secondsNow()).toBe(1_800_000_000);
  });

  it('a link is renewed from ten minutes before it expires: the wait until then, none if it passed, never more than a timer can', () => {
    vi.useFakeTimers({ now: 1_800_000_000_000 });
    expect(untilRenewal(1_800_000_000 + 3600)).toBe((50 * 60 + 1) * 1000);
    expect(untilRenewal(1_800_000_000 + 5 * 60)).toBe(0);
    expect(untilRenewal(1_800_000_000 + 400 * 86_400)).toBe(2 ** 31 - 1);
  });
});
