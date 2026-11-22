// Tests for the signature of the private images: what a signature opens, until when, and what it never opens.
import { describe, expect, it } from 'vitest';
import { MediaSigner, isValidKey } from '../mediaSigner';

const SECRET = 'secreto-de-prueba-0123456789-0123456789';
const NOW = 1_800_000_000;
const KEY = `tests/${'a'.repeat(32)}.webp`;
const THUMB = `cards/thumb/${'b'.repeat(32)}.webp`;

const signer = () => new MediaSigner(SECRET);
const parts = (url: string) => {
  const q = new URL(`http://x${url}`).searchParams;
  return { e: Number(q.get('e')), s: q.get('s')! };
};

describe('the secret and the keys', () => {
  it('a secret under 32 characters is refused at once', () => {
    expect(() => new MediaSigner('corto')).toThrow('MEDIA_SECRET');
    expect(() => new MediaSigner('x'.repeat(31))).toThrow('MEDIA_SECRET');
    expect(() => new MediaSigner('x'.repeat(32))).not.toThrow();
  });

  it('a key has folders, and nothing that goes up', () => {
    expect(isValidKey(KEY)).toBe(true);
    for (const bad of [
      'sola.png',
      '../x/y.png',
      'a/../b.png',
      'A/b.png',
      '/a/b.png',
      'a b/c.png',
    ]) {
      expect(isValidKey(bad), bad).toBe(false);
    }
  });
});

describe('the signature of an image', () => {
  it('the link lasts until the second hour after the current one, so that it repeats for an hour', async () => {
    const a = parts(await signer().url(KEY, NOW));
    const b = parts(await signer().url(KEY, NOW + 3599 - (NOW % 3600)));
    expect(a.e).toBe((Math.floor(NOW / 3600) + 2) * 3600);
    expect(a.e).toBeGreaterThan(NOW + 3600);
    expect(b).toEqual(a);
    expect(parts(await signer().url(KEY, NOW + 3600)).e).toBe(a.e + 3600);
  });

  it('opens its own image until it expires, and not an instant later', async () => {
    const s = signer();
    const { e, s: signature } = parts(await s.url(KEY, NOW));
    expect(await s.isValid(KEY, e, signature, e)).toBe(true);
    expect(await s.isValid(KEY, e, signature, e + 1)).toBe(false);
  });

  it('is tied to the key, the expiry and the secret', async () => {
    const s = signer();
    const { e, s: signature } = parts(await s.url(KEY, NOW));
    expect(await s.isValid(`tests/${'c'.repeat(32)}.webp`, e, signature, NOW)).toBe(false);
    expect(await s.isValid(KEY, e + 3600, signature, NOW)).toBe(false);
    expect(
      await new MediaSigner('otro-secreto-0123456789-0123456789').isValid(KEY, e, signature, NOW),
    ).toBe(false);
  });

  it('a signature that is not even the shape of one, or an expiry that is not a whole number, opens nothing', async () => {
    const s = signer();
    const { e, s: signature } = parts(await s.url(KEY, NOW));
    expect(await s.isValid(KEY, e, 'corta', NOW)).toBe(false);
    expect(await s.isValid(KEY, e, `${signature}$`, NOW)).toBe(false);
    expect(await s.isValid(KEY, e + 0.5, signature, NOW)).toBe(false);
    expect(await s.isValid(KEY, Number.NaN, signature, NOW)).toBe(false);
  });
});

describe('the signature of a prefix', () => {
  it('opens only the thumbnails of the allowed prefix, and signs no other prefix', async () => {
    const s = signer();
    const { expires, query } = await s.prefixQuery('cards/thumb/', NOW);
    const signature = new URLSearchParams(query).get('s')!;
    expect(await s.isValidPrefix(THUMB, 'cards/thumb/', expires, signature, NOW)).toBe(true);
    expect(await s.isValidPrefix(KEY, 'cards/thumb/', expires, signature, NOW)).toBe(false);
    expect(
      await s.isValidPrefix('cards/thumb/../x.webp', 'cards/thumb/', expires, signature, NOW),
    ).toBe(false);
    await expect(s.signPrefix('tests/', expires)).rejects.toThrow('Prefijo sin firma');
    expect(await s.isValidPrefix(KEY, 'tests/', expires, signature, NOW)).toBe(false);
  });

  it('expires like the others, and does not accept a malformed signature', async () => {
    const s = signer();
    const { expires, query } = await s.prefixQuery('cards/thumb/', NOW);
    const signature = new URLSearchParams(query).get('s')!;
    expect(await s.isValidPrefix(THUMB, 'cards/thumb/', expires, signature, expires + 1)).toBe(
      false,
    );
    expect(await s.isValidPrefix(THUMB, 'cards/thumb/', expires + 0.5, signature, NOW)).toBe(false);
    expect(await s.isValidPrefix(THUMB, 'cards/thumb/', expires, 'no$vale', NOW)).toBe(false);
  });

  it('the signature of an image is not the signature of a prefix, nor the other way round', async () => {
    const s = signer();
    const image = parts(await s.url(THUMB, NOW));
    expect(await s.isValidPrefix(THUMB, 'cards/thumb/', image.e, image.s, NOW)).toBe(false);
    const prefixed = await s.signPrefix('cards/thumb/', image.e);
    expect(await s.isValid(THUMB, image.e, prefixed, NOW)).toBe(false);
    // Even for a «key» that is the prefix itself: the two kinds of message never coincide.
    expect(await s.isValid('cards/thumb/', image.e, prefixed, NOW)).toBe(false);
  });
});

describe('signing what a page carries', () => {
  it('html: each data-media becomes a src with the ampersands escaped, and an odd key a marker', async () => {
    const out = await signer().signHtml(
      `<img data-media="${KEY}"><img data-media="../malo"><img data-media="${KEY}">`,
      NOW,
    );
    expect(out.match(/src="\/api\/media\/tests\/a+\.webp\?e=\d+&amp;s=[\w-]+"/g)).toHaveLength(2);
    expect(out).toContain('data-media-invalid=""');
    expect(out).not.toContain('data-media="');
  });

  it('json: a src is added after each media, and a media that is not a valid key is left as it is', async () => {
    const out = await signer().signJsonMedia(
      `{"a": {"media": "${KEY}"}, "b": {"media":"../malo"}, "c": "{\\"media\\": \\"${KEY}\\"}"}`,
      NOW,
    );
    expect(out).toMatch(
      new RegExp(`"media": "${KEY}","src": "/api/media/${KEY}\\?e=\\d+&s=[\\w-]+"`),
    );
    expect(out).toContain('{"media":"../malo"}');
    expect(out.match(/"src"/g)).toHaveLength(1);
  });
});
