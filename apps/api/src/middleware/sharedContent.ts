// The material's answers kept for every student under their validator (content version, courses turned off, build and
// hour) and their address, so that a data center reads each one from the content database once, not once a student.
import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import type { Dependencies } from '../dependencies';
import type { AppEnv } from '../env';

/** Says whether an answer came from the shared cache: `hit` or `miss` (absent when the cache was not asked). */
export const CACHE_HEADER = 'X-QV-Cache';

const HOUR = 3600;
const hourOf = (sec: number) => Math.floor(sec / HOUR);

/** Without the Worker's context (Node, the tests) the copy is stored before answering. */
function inBackground(c: Context<AppEnv>, work: Promise<void>): Promise<void> {
  try {
    c.executionCtx.waitUntil(work);
    return Promise.resolve();
  } catch {
    return work;
  }
}

/**
 * After `revalidate`, which only leaves a validator for a student's read with a known content version: the admin mode
 * and a version that cannot be read never reach the cache. Only a whole answer (200) goes in.
 */
export const sharedContent = (deps: Dependencies) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const validator = c.get('validator');
    if (!validator) {
      await next();
      return;
    }
    const url = new URL(c.req.url);
    const key = `${validator.tag} ${url.pathname}${url.search}`;
    const hit = await deps.contentCache.match(key);
    if (hit) {
      c.header(CACHE_HEADER, 'hit');
      return c.body(hit.body, 200, { 'Content-Type': hit.contentType });
    }
    await next();
    c.header(CACHE_HEADER, 'miss');
    const now = deps.now();
    // Its images were signed for the hour in the key: one signed in the next hour would outlive the others.
    if (c.res.status !== 200 || hourOf(now) !== hourOf(validator.nowSec)) return;
    const ttl = Math.min(deps.contentCacheTtl, HOUR - (now % HOUR));
    await inBackground(c, deps.contentCache.put(key, c.res.clone(), ttl));
  });
