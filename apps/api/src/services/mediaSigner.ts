// Signs the URLs of the private images so that a copied link expires: an <img> tag cannot send the session token.
import { MediaKey, apiPaths } from '@qv/schema/http';

const DAY = 86_400;

/** The only prefixes one signature may open: the card browser's thumbnails, hundreds in a list. */
const SIGNED_PREFIXES: readonly string[] = ['cards/thumb/'];

export function isValidKey(key: string): boolean {
  return MediaKey.safeParse(key).success;
}

/**
 * The UTC day a signature is made in: every link signed in it expires at the same moment, so that for a whole day an
 * image keeps its URL and the browser reuses its cache.
 */
export function signingDay(nowSec: number): number {
  return Math.floor(nowSec / DAY);
}

/** The end of the day after the current one: a link lasts between 24 and 48 hours. */
function expiry(nowSec: number): number {
  return (signingDay(nowSec) + 2) * DAY;
}

export class MediaSigner {
  private key: Promise<CryptoKey>;

  constructor(secret: string) {
    if (secret.length < 32) throw new Error('MEDIA_SECRET debe tener al menos 32 caracteres');
    this.key = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
  }

  async sign(key: string, expires: number): Promise<string> {
    const signature = await crypto.subtle.sign('HMAC', await this.key, this.message(key, expires));
    return base64url(new Uint8Array(signature));
  }

  async isValid(key: string, expires: number, signature: string, nowSec: number): Promise<boolean> {
    if (!Number.isInteger(expires) || expires < nowSec) return false;
    const bytes = fromBase64url(signature);
    if (!bytes) return false;
    return crypto.subtle.verify('HMAC', await this.key, bytes, this.message(key, expires));
  }

  async signPrefix(prefix: string, expires: number): Promise<string> {
    if (!SIGNED_PREFIXES.includes(prefix)) throw new Error(`Prefijo sin firma: ${prefix}`);
    const signature = await crypto.subtle.sign(
      'HMAC',
      await this.key,
      this.prefixMessage(prefix, expires),
    );
    return base64url(new Uint8Array(signature));
  }

  async isValidPrefix(
    key: string,
    prefix: string,
    expires: number,
    signature: string,
    nowSec: number,
  ): Promise<boolean> {
    if (!SIGNED_PREFIXES.includes(prefix) || !key.startsWith(prefix) || !isValidKey(key)) {
      return false;
    }
    if (!Number.isInteger(expires) || expires < nowSec) return false;
    const bytes = fromBase64url(signature);
    if (!bytes) return false;
    return crypto.subtle.verify('HMAC', await this.key, bytes, this.prefixMessage(prefix, expires));
  }

  async prefixQuery(prefix: string, nowSec: number): Promise<{ expires: number; query: string }> {
    const expires = expiry(nowSec);
    const s = await this.signPrefix(prefix, expires);
    return { expires, query: `e=${expires}&p=${encodeURIComponent(prefix)}&s=${s}` };
  }

  async url(key: string, nowSec: number): Promise<string> {
    const expires = expiry(nowSec);
    return `${apiPaths.media(key)}?e=${expires}&s=${await this.sign(key, expires)}`;
  }

  async signHtml(html: string, nowSec: number): Promise<string> {
    const keys = new Set([...html.matchAll(/data-media="([^"]+)"/g)].map((m) => m[1]!));
    const urls = new Map<string, string>();
    for (const key of keys) {
      if (isValidKey(key)) urls.set(key, await this.url(key, nowSec));
    }
    return html.replace(/data-media="([^"]+)"/g, (_, key: string) => {
      const url = urls.get(key);
      return url ? `src="${url.replace(/&/g, '&amp;')}"` : 'data-media-invalid=""';
    });
  }

  /**
   * Adds a signed `src` after every `"media": "<key>"` without parsing the JSON (too big for a Worker request's CPU).
   * Only a JSON key can match: a quote inside a string is `\"`.
   */
  async signJsonMedia(json: string, nowSec: number): Promise<string> {
    const re = /"media"(\s*):(\s*)"([^"\\]+)"/g;
    const keys = new Set([...json.matchAll(re)].map((m) => m[3]!));
    const urls = new Map<string, string>();
    for (const key of keys) {
      if (isValidKey(key)) urls.set(key, await this.url(key, nowSec));
    }
    return json.replace(re, (all, a: string, b: string, key: string) => {
      const url = urls.get(key);
      return url ? `${all},"src"${a}:${b}${JSON.stringify(url)}` : all;
    });
  }

  private message(key: string, expires: number) {
    return new TextEncoder().encode(`${key}\n${expires}`);
  }

  /** Never equal to a key's message: a key has no «:». */
  private prefixMessage(prefix: string, expires: number) {
    return new TextEncoder().encode(`prefix:${prefix}\n${expires}`);
  }
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(text)) return null;
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
