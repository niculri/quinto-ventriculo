// The signed URLs of the private images (`/api/media/<key>?e=…&s=…`): their path, until when they open, the ones a
// text carries and the same text unsigned.
import { apiPaths } from '@qv/schema/http';

const MEDIA = apiPaths.media('');
const SIGNED = new RegExp(
  `${MEDIA.replace(/[/.]/g, '\\$&')}[^?"'\\s<>\\\\]+\\?[^"'\\s<>\\\\]*`,
  'g',
);
const BASE = 'http://media.invalid';

/** Where a renewal found an image's new URL, by its path; null when it brought none. */
export type FreshMedia = (path: string) => string | null;

/** Signs again the images of the read that brought `path` whose links expire before `beforeSec`; says where each is. */
export type RenewMedia = (path: string, beforeSec: number) => Promise<FreshMedia>;

/** An image not loaded yet is signed again this long before its link expires (a link lasts at least 24 hours). */
export const RENEW_BEFORE_SEC = 2 * 3600;

export const secondsNow = () => Math.floor(Date.now() / 1000);

/** The longest a timer can wait: with more it fires at once. A link further away is planned again when it does. */
const LONGEST_WAIT_MS = 2 ** 31 - 1;

/** How long until a link that expires at `expiry` is within the margin, as `isExpired` counts it. */
export function untilRenewal(expiry: number): number {
  const wait = (expiry - RENEW_BEFORE_SEC + 1) * 1000 - Date.now();
  return Math.min(LONGEST_WAIT_MS, Math.max(0, wait));
}

function parse(src: string): URL | null {
  try {
    return new URL(src, BASE);
  } catch {
    return null;
  }
}

/** The path of a signed image (`/api/media/<key>`), or null when `src` is not one. */
export function mediaPath(src: string): string | null {
  const url = parse(src);
  return url?.pathname.startsWith(MEDIA) ? url.pathname : null;
}

/** The second its signature stops opening it, or null when it is not a signed image. */
export function mediaExpiry(src: string): number | null {
  const url = parse(src);
  if (!url?.pathname.startsWith(MEDIA)) return null;
  const e = Number(url.searchParams.get('e') ?? Number.NaN);
  return Number.isInteger(e) ? e : null;
}

/** The API opens an image until its second of expiry, that one included. */
export function isExpired(src: string, nowSec: number): boolean {
  const e = mediaExpiry(src);
  return e !== null && e < nowSec;
}

/** Every signed image in an HTML or a JSON text, as the browser asks for it (the HTML escapes the `&`). */
export function mediaUrlsIn(text: string): string[] {
  return [...text.matchAll(SIGNED)].map(([url]) => url.replaceAll('&amp;', '&'));
}

export function lookupIn(urls: readonly string[]): FreshMedia {
  const byPath = new Map<string, string>();
  for (const url of urls) {
    const path = mediaPath(url);
    if (path) byPath.set(path, url);
  }
  return (path) => byPath.get(path) ?? null;
}

/** The text without the signatures: two answers equal here differ only in when their images expire. */
export function unsignedMedia(text: string): string {
  return text.replace(SIGNED, (url) => url.slice(0, url.indexOf('?')));
}

/** The same image, maybe with another signature. */
export function sameImage(a: string, b: string): boolean {
  const path = mediaPath(a);
  return path !== null && path === mediaPath(b);
}
