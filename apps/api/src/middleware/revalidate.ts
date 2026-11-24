// On the routes of the material: every answer is checked again by the browser, and an unchanged one is a 304 that reads
// nothing of the material (its validator is the content version, the courses turned off, the build and the day).
import { createMiddleware } from 'hono/factory';
import type { SiteSettings } from '@qv/schema';
import type { Dependencies } from '../dependencies';
import type { AppEnv } from '../env';
import type { ContentVersionReader } from '../services/contentVersion';
import { signingDay } from '../services/mediaSigner';

/** FNV-1a, 32 bits: short, and enough to tell two lists of courses turned off apart. */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const settingsMark = (s: SiteSettings) =>
  fnv1a(JSON.stringify([s.hideEmptySemesters, [...s.hiddenCourses].sort()]));

/**
 * The signing day is in it because the image URLs inside a note, a card or a section all expire at the end of the
 * next day: an answer kept from an earlier day would bring links that expire sooner.
 */
export function validatorOf(parts: {
  version: string;
  settings: SiteSettings | null;
  build: string | null;
  nowSec: number;
}): string {
  const settings = parts.settings ? settingsMark(parts.settings) : '-';
  const day = signingDay(parts.nowSec).toString(36);
  return `W/"${parts.version}.${settings}.${parts.build ?? 'dev'}.${day}"`;
}

/** Weak comparison (RFC 9110, 13.1.2), over the list `If-None-Match` may bring. */
export function matchesValidator(header: string | undefined, tag: string): boolean {
  if (!header) return false;
  const opaque = (t: string) => t.trim().replace(/^W\//, '');
  const wanted = opaque(tag);
  return header.split(',').some((t) => t.trim() === '*' || opaque(t) === wanted);
}

/** After `requireSession` (and `visibleContent` when `withSettings`); the admin mode's answers are never kept. */
export const revalidate = (
  deps: Dependencies,
  versions: ContentVersionReader,
  withSettings: boolean,
) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (c.get('preview')) {
      await next();
      return;
    }
    c.header('Cache-Control', 'private, no-cache');
    const version = await versions.read();
    if (version === null) {
      await next();
      return;
    }
    const tag = validatorOf({
      version,
      settings: withSettings ? c.get('settings') : null,
      build: deps.version,
      nowSec: deps.now(),
    });
    if (matchesValidator(c.req.header('If-None-Match'), tag)) {
      c.header('ETag', tag);
      return c.body(null, 304);
    }
    await next();
    // Only a whole answer: a 404 or a 500 kept with a validator would come back as if it were still true.
    if (c.res.status === 200) c.header('ETag', tag);
  });
