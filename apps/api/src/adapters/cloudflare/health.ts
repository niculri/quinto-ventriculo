// The health checks of the media bucket and the backups bucket, and the cache the isolates share.
import type { DeepHealthResult, HealthCheck, SharedHealthCache } from '../../ports/health';

export interface BucketLike {
  head(key: string): Promise<unknown>;
  list(options: { prefix?: string; startAfter?: string; limit?: number }): Promise<{
    objects: { key: string; size: number; uploaded: Date }[];
    truncated: boolean;
  }>;
}

/** A `head` of a missing key: a class B operation, the cheap kind. */
export function mediaCheck(bucket: BucketLike): HealthCheck {
  return async () => {
    await bucket.head('health/probe');
  };
}

const BACKUP_MAX_AGE_HOURS = 36;
const BACKUP_PREFIX = 'users/';
const BACKUP_SUFFIX = '.tar.age';

/** The keys start with the UTC date (`users/2026-11-09-071702Z.tar.age`), so the listing starts three days back. */
export function latestBackupCheck(
  bucket: BucketLike | undefined,
  now: () => number = Date.now,
  maxAgeHours = BACKUP_MAX_AGE_HOURS,
): HealthCheck {
  return async () => {
    if (!bucket) throw new Error('the BACKUPS binding is missing');
    const since = new Date(now() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    let newest = 0;
    let startAfter = `${BACKUP_PREFIX}${since}`;
    for (let page = 0; page < 10; page++) {
      const r = await bucket.list({ prefix: BACKUP_PREFIX, startAfter, limit: 100 });
      for (const o of r.objects) {
        if (o.key.endsWith(BACKUP_SUFFIX) && o.size > 0) {
          newest = Math.max(newest, o.uploaded.getTime());
        }
      }
      if (!r.truncated || r.objects.length === 0) break;
      startAfter = r.objects[r.objects.length - 1]!.key;
    }
    if (!newest) throw new Error('no copy in the last three days');
    const hours = (now() - newest) / 3_600_000;
    if (hours > maxAgeHours) throw new Error(`the newest copy is ${hours.toFixed(1)} hours old`);
  };
}

export function cloudflareHealthCache(cache: Cache, origin: string): SharedHealthCache {
  const key = new Request(`${origin.replace(/\/+$/, '')}/__qv-health-deep-cache`);
  return {
    async get() {
      const r = await cache.match(key);
      if (!r) return null;
      const body: unknown = await r.json();
      return isResult(body) ? body : null;
    },
    async put(result, ttlSeconds) {
      await cache.put(
        key,
        new Response(JSON.stringify(result), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': `max-age=${Math.max(1, Math.floor(ttlSeconds))}`,
          },
        }),
      );
    },
  };
}

function isResult(x: unknown): x is DeepHealthResult {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as { ok?: unknown; checks?: unknown };
  return (
    typeof r.ok === 'boolean' &&
    typeof r.checks === 'object' &&
    r.checks !== null &&
    Object.values(r.checks).every((s) => s === 'ok' || s === 'fail')
  );
}
