/**
 * `/api/health/deep` (step 2.5): whether what the site needs answers, for an external monitor. Public and without a
 * session, so it says only `ok` or `fail` for each part: never an error, a URL, a key, a table or a row. What failed
 * and why goes to the Worker's log (`console.error`, Workers Logs).
 *
 * A request does not mean a query: the result is remembered `ttl` seconds (60) in the isolate, the requests that
 * arrive while the checks run wait for the same ones, and the Worker can add a cache shared by the isolates of a data
 * center (`shared`, Cloudflare's Cache API). A thousand requests a minute make at most one round of checks per isolate.
 */

/** A part of the site that is checked: it resolves if it answers and throws (or rejects) if not. */
export type HealthCheck = (signal: AbortSignal) => Promise<void>;

export type CheckStatus = 'ok' | 'fail';

export interface DeepHealthResult {
  ok: boolean;
  checks: Record<string, CheckStatus>;
}

/** A cache of the last result shared by isolates (the Worker uses Cloudflare's Cache API). */
export interface SharedHealthCache {
  get(): Promise<DeepHealthResult | null>;
  put(result: DeepHealthResult, ttlSeconds: number): Promise<void>;
}

export interface DeepHealth {
  run(): Promise<DeepHealthResult>;
}

export interface DeepHealthOptions {
  /** Seconds a result is kept (default 60). */
  ttl?: number;
  /** Milliseconds each check has before it counts as failed (default 5000). */
  timeoutMs?: number;
  /** Milliseconds since 1970. Injected in tests. */
  now?: () => number;
  shared?: SharedHealthCache;
}

export const HEALTH_TTL = 60;
const TIMEOUT_MS = 5000;

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

// --- the checks of the production Worker (worker.ts) ---------------------------------------------------------------

/** What `fetch` the checks use (injected in tests). */
type Fetch = typeof fetch;

/** The users' database: `public.health()` (migration 20261120000000_health.sql), with the public key. */
export function usersDatabaseCheck(
  supabaseUrl: string,
  publishableKey: string | undefined,
  doFetch: Fetch = fetch,
): HealthCheck {
  return async (signal) => {
    if (!publishableKey) throw new Error('USERS_SUPABASE_PUBLISHABLE_KEY is missing');
    const r = await doFetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/health`, {
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

/** Supabase Auth of the users' project (signing in), with the public key. */
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

/** The content database: `site_settings()` (one row), with the service key the Worker already has. */
export function contentDatabaseCheck(
  supabaseUrl: string,
  serviceKey: string,
  doFetch: Fetch = fetch,
): HealthCheck {
  return async (signal) => {
    const r = await doFetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/site_settings`, {
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

/** What of an R2 bucket the checks use (a binding has it; tests give a fake). */
export interface BucketLike {
  head(key: string): Promise<unknown>;
  list(options: { prefix?: string; startAfter?: string; limit?: number }): Promise<{
    objects: { key: string; size: number; uploaded: Date }[];
    truncated: boolean;
  }>;
}

/** The images' bucket answers: a `head` of a key that does not exist (a class B operation, the cheap kind). */
export function mediaCheck(bucket: BucketLike): HealthCheck {
  return async () => {
    await bucket.head('health/probe');
  };
}

export const BACKUP_MAX_AGE_HOURS = 36;
const BACKUP_PREFIX = 'users/';
const BACKUP_SUFFIX = '.tar.age';

/**
 * The newest copy of the users' database (ops/backup in the private repository) is less than 36 hours old and not
 * empty. Its keys start with the UTC date (`users/2026-11-09-071702Z.tar.age`), so the listing starts three days back
 * and reads a handful of keys, not the 30 days.
 */
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

/** The shared cache of the production Worker: Cloudflare's Cache API, under a URL that nothing else uses. */
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
