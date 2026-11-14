// `/api/health/deep`: whether each part the site needs answers, for an external monitor. Public, so it says only
// `ok` or `fail` per part, never an error, URL, key or row; what failed and why goes to the Worker's log.
import type { Database as ContentDatabase } from '@qv/db-types/content';
import type { Database as UsersDatabase } from '@qv/db-types/users';

export type HealthCheck = (signal: AbortSignal) => Promise<void>;

type CheckStatus = 'ok' | 'fail';

export interface DeepHealthResult {
  ok: boolean;
  checks: Record<string, CheckStatus>;
}

export interface SharedHealthCache {
  get(): Promise<DeepHealthResult | null>;
  put(result: DeepHealthResult, ttlSeconds: number): Promise<void>;
}

export interface DeepHealth {
  run(): Promise<DeepHealthResult>;
}

export interface DeepHealthOptions {
  ttl?: number;
  timeoutMs?: number;
  now?: () => number;
  shared?: SharedHealthCache;
}

const HEALTH_TTL = 60;
const TIMEOUT_MS = 5000;

/** A request is not a query: the result is kept `ttl` seconds, and concurrent requests share one round of checks. */
export function deepHealth(
  checks: Record<string, HealthCheck>,
  op: DeepHealthOptions = {},
): DeepHealth {
  const ttl = (op.ttl ?? HEALTH_TTL) * 1000;
  const timeoutMs = op.timeoutMs ?? TIMEOUT_MS;
  const now = op.now ?? Date.now;
  let last: { result: DeepHealthResult; until: number } | null = null;
  let running: Promise<DeepHealthResult> | null = null;

  const one = async (name: string, check: HealthCheck): Promise<CheckStatus> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        check(controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error(`timed out after ${timeoutMs} ms`));
          }, timeoutMs);
        }),
      ]);
      return 'ok';
    } catch (e) {
      console.error(`health/deep: ${name} failed:`, e);
      return 'fail';
    } finally {
      clearTimeout(timer);
    }
  };

  const fresh = async (): Promise<DeepHealthResult> => {
    if (op.shared) {
      const hit = await op.shared.get().catch(() => null);
      if (hit) return hit;
    }
    const names = Object.keys(checks).sort();
    const statuses = await Promise.all(names.map((name) => one(name, checks[name]!)));
    const result: DeepHealthResult = {
      ok: statuses.every((s) => s === 'ok'),
      checks: Object.fromEntries(names.map((name, i) => [name, statuses[i]!])),
    };
    if (op.shared) await op.shared.put(result, ttl / 1000).catch(() => undefined);
    return result;
  };

  return {
    async run() {
      if (last && last.until > now()) return last.result;
      running ??= fresh()
        .then((result) => {
          last = { result, until: now() + ttl };
          return result;
        })
        .finally(() => {
          running = null;
        });
      return running;
    },
  };
}

type Fetch = typeof fetch;

export function usersDatabaseCheck(
  supabaseUrl: string,
  publishableKey: string | undefined,
  doFetch: Fetch = fetch,
): HealthCheck {
  return async (signal) => {
    if (!publishableKey) throw new Error('USERS_SUPABASE_PUBLISHABLE_KEY is missing');
    // By fetch, not supabase-js: it needs the abort signal and the status alone, and no client for one call.
    const fn: keyof UsersDatabase['public']['Functions'] = 'health';
    const r = await doFetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: '{}',
      signal,
    });
    if (!r.ok) throw new Error(`users health(): ${r.status}`);
    if ((await r.json()) !== true) throw new Error('users health(): unexpected answer');
  };
}

export function authCheck(
  supabaseUrl: string,
  publishableKey: string | undefined,
  doFetch: Fetch = fetch,
): HealthCheck {
  return async (signal) => {
    if (!publishableKey) throw new Error('USERS_SUPABASE_PUBLISHABLE_KEY is missing');
    const r = await doFetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/health`, {
      headers: { apikey: publishableKey },
      signal,
    });
    await r.body?.cancel();
    if (!r.ok) throw new Error(`auth health: ${r.status}`);
  };
}

export function contentDatabaseCheck(
  supabaseUrl: string,
  serviceKey: string,
  doFetch: Fetch = fetch,
): HealthCheck {
  return async (signal) => {
    // By fetch, as the users' check: the abort signal and the status alone, without reading the body.
    const fn: keyof ContentDatabase['public']['Functions'] = 'site_settings';
    const r = await doFetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: '{}',
      signal,
    });
    await r.body?.cancel();
    if (!r.ok) throw new Error(`content site_settings(): ${r.status}`);
  };
}

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
