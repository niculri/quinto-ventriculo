// The deep health check: runs each check with a timeout and keeps the result, so a request is not a query.
import type {
  CheckStatus,
  DeepHealth,
  DeepHealthResult,
  HealthCheck,
  SharedHealthCache,
} from '../ports/health';

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
