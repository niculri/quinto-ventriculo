// Pages that fail in the students' browsers, as anonymous Analytics Engine points (what, where, which deploy; never
// who). `POST /client-error` has no session: the worst error, the app that does not start, comes before the login.
import { CLIENT_ERROR_DAYS, ClientErrorGroup } from '@qv/schema';
import { ClientErrorBody } from '@qv/schema/http';
import type { ClientErrorReport } from '@qv/schema';
import type { ErrorCode } from '@qv/schema/http';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { aeTime, analyticsEngineSql, num } from './usage';
import type { AnalyticsReaderOptions, UsageDataset } from './usage';

/** Never awaited and never fails, like the opens. */
export interface ClientErrorRecorder {
  record(report: ClientErrorReport): void;
}

export interface ClientErrorsReader {
  read(): Promise<ClientErrorGroup[]>;
}

/** Emails and long runs of letters and digits (tokens, ids) out, in case a message carries them. */
export function scrubErrorMessage(message: string): string {
  return message
    .replace(/[^\s@<>()"']+@[^\s@<>()"']+/g, '(correo)')
    .replace(/[A-Za-z0-9_-]{24,}/g, '…')
    .slice(0, 300);
}

/** blob1 `error`, blob2 the path, blob3 the kind, blob4 the message, blob5 the version. */
export function clientErrorPoint(report: ClientErrorReport) {
  return {
    indexes: ['error'],
    blobs: ['error', report.page, report.kind, scrubErrorMessage(report.message), report.version],
    doubles: [1],
  };
}

export function analyticsEngineErrorRecorder(dataset: UsageDataset): ClientErrorRecorder {
  return {
    record(report) {
      try {
        dataset.writeDataPoint(clientErrorPoint(report));
      } catch (e) {
        console.error(e);
      }
    },
  };
}

const ERRORS_SHOWN = 50;

export function analyticsEngineErrorsReader(op: AnalyticsReaderOptions): ClientErrorsReader {
  const { dataset, query } = analyticsEngineSql(op);
  return {
    async read() {
      const rows = await query(
        `SELECT blob3 AS kind, blob2 AS page, blob4 AS message, blob5 AS version, SUM(_sample_interval) AS n, ` +
          `MAX(timestamp) AS latest FROM ${dataset} WHERE timestamp > NOW() - INTERVAL '${CLIENT_ERROR_DAYS}' DAY ` +
          `AND blob1 = 'error' GROUP BY kind, page, message, version ORDER BY latest DESC LIMIT ${ERRORS_SHOWN} FORMAT JSON`,
      );
      return rows.flatMap((r) => {
        const g = ClientErrorGroup.safeParse({
          kind: r['kind'],
          page: r['page'],
          message: r['message'],
          version: r['version'],
          count: num(r['n']),
          lastSeen: typeof r['latest'] === 'string' ? aeTime(r['latest']) : '',
        });
        return g.success ? [g.data] : [];
      });
    },
  };
}

/** Groups like the SQL above, for the local demo and the tests. */
export function memoryClientErrors(
  op: { now?: () => number } = {},
): ClientErrorRecorder & ClientErrorsReader & { points: (ClientErrorReport & { at: number })[] } {
  const now = op.now ?? Date.now;
  const points: (ClientErrorReport & { at: number })[] = [];
  return {
    points,
    record(report) {
      points.push({ ...report, message: scrubErrorMessage(report.message), at: now() });
    },
    async read() {
      const since = now() - CLIENT_ERROR_DAYS * 86_400_000;
      const groups = new Map<string, ClientErrorGroup & { at: number }>();
      for (const p of points) {
        if (p.at <= since) continue;
        const key = [p.kind, p.page, p.message, p.version].join('\u0000');
        const g = groups.get(key);
        if (g) {
          g.count += 1;
          if (p.at > g.at) Object.assign(g, { at: p.at, lastSeen: new Date(p.at).toISOString() });
        } else {
          const { at, ...report } = p;
          groups.set(key, { ...report, count: 1, at, lastSeen: new Date(at).toISOString() });
        }
      }
      return [...groups.values()]
        .sort((a, b) => b.at - a.at)
        .slice(0, ERRORS_SHOWN)
        .map(({ at: _at, ...g }) => g);
    },
  };
}

/** At most `limit` reports a minute in each isolate: a page in a loop, or someone sending on purpose, stops there. */
export function errorBudget(limit: number, now: () => number) {
  let minute = -1;
  let used = 0;
  return () => {
    const m = Math.floor(now() / 60_000);
    if (m !== minute) {
      minute = m;
      used = 0;
    }
    if (used >= limit) return false;
    used += 1;
    return true;
  };
}

const MAX_A_MINUTE = 60;

/** `ClientErrorBody` takes 1,024 UTF-16 units, three bytes each at most. */
const MAX_BODY_BYTES = 3 * 1024;

/** Before anything is read: the route has no session, so it never buffers what a stranger sends. */
export const clientErrorBodyLimit = bodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: (c) => c.body(null, 413),
});

/**
 * The handler of `POST /client-error`: 204 for anything well formed from the site itself (counted or not), 400 for
 * the rest, 403 from another origin, 413 from `clientErrorBodyLimit`. It never says whether the point was kept.
 */
export function clientErrorHandler(recorder: ClientErrorRecorder | undefined, now: () => number) {
  const take = errorBudget(MAX_A_MINUTE, now);
  return async (c: Context) => {
    c.header('Cache-Control', 'no-store');
    const origin = c.req.header('Origin');
    if (origin && origin !== new URL(c.req.url).origin) return c.body(null, 403);
    const report = ClientErrorBody.safeParse(await c.req.text().catch(() => ''));
    if (!report.success) {
      const code: ErrorCode = 'invalid_client_error';
      return c.json({ error: code, message: 'Ese informe no se puede guardar.' }, 400);
    }
    if (recorder && take()) recorder.record(report.data);
    return c.body(null, 204);
  };
}
