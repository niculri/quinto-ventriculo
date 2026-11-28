// Analytics Engine: the browsers' errors as points (what, where, which deploy, the system and browser, and the account
// of a valid session), and read back grouped by error.
import { ERRORS_SHOWN, ERROR_ACCOUNTS_SHOWN, ClientErrorGroup } from '@qv/schema';
import type {
  ClientErrorPoint,
  ClientErrorRecorder,
  ClientErrorsReader,
} from '../../ports/clientErrors';
import { scrubErrorMessage, scrubStack } from '../../services/clientErrors';
import { aeTime, analyticsEngineSql, num } from './analyticsEngine';
import type { AnalyticsReaderOptions, UsageDataset } from './analyticsEngine';

/**
 * blob1 `error`, blob2 the path, blob3 the kind, blob4 the message, blob5 the version, blob6 the system, blob7 the
 * browser, blob8 the window, blob9 `1` on a phone (`0` if not, empty if not known), blob10 the stack, blob11 the
 * account (empty without a session). At most 2.3 kB of the 16 kB a point takes.
 */
export function clientErrorPoint(point: ClientErrorPoint) {
  return {
    indexes: ['error'],
    blobs: [
      'error',
      point.page,
      point.kind,
      scrubErrorMessage(point.message),
      point.version,
      point.os,
      point.browser,
      point.viewport,
      point.phone === null ? '' : point.phone ? '1' : '0',
      scrubStack(point.stack),
      point.account ?? '',
    ],
    doubles: [1],
  };
}

export function analyticsEngineErrorRecorder(dataset: UsageDataset): ClientErrorRecorder {
  return {
    record(point) {
      try {
        dataset.writeDataPoint(clientErrorPoint(point));
      } catch (e) {
        console.error(e);
      }
    },
  };
}

const strings = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : [];
const text = (v: unknown) => (typeof v === 'string' ? v : '');

/** One query: the last time's details with `argMax`, the most frequent systems, browsers and accounts with `topK`. */
const errorsSql = (dataset: string, days: number) =>
  `SELECT blob3 AS kind, blob2 AS page, blob4 AS message, blob5 AS version, SUM(_sample_interval) AS n, ` +
  `MIN(timestamp) AS first, MAX(timestamp) AS latest, argMax(blob6, timestamp) AS os, ` +
  `argMax(blob7, timestamp) AS browser, argMax(blob8, timestamp) AS viewport, argMax(blob9, timestamp) AS phone, ` +
  `argMax(blob10, timestamp) AS stack, topK(5)(blob6) AS systems, topK(5)(blob7) AS browsers, ` +
  `countIf(blob11 = '') AS anonymous, count(DISTINCT blob11) AS accountsAndEmpty, ` +
  `topK(${String(ERROR_ACCOUNTS_SHOWN + 1)})(blob11) AS accounts FROM ${dataset} ` +
  `WHERE timestamp > NOW() - INTERVAL '${String(days)}' DAY AND blob1 = 'error' ` +
  `GROUP BY kind, page, message, version ORDER BY latest DESC LIMIT ${String(ERRORS_SHOWN + 1)} FORMAT JSON`;

export function analyticsEngineErrorsReader(op: AnalyticsReaderOptions): ClientErrorsReader {
  const { dataset, query } = analyticsEngineSql(op);
  return {
    async read(days) {
      const rows = await query(errorsSql(dataset, days));
      return rows.flatMap((r) => {
        const anonymous = num(r.anonymous);
        const g = ClientErrorGroup.safeParse({
          kind: r.kind,
          page: r.page,
          message: r.message,
          version: r.version,
          count: num(r.n),
          firstSeen: aeTime(text(r.first)),
          lastSeen: aeTime(text(r.latest)),
          os: text(r.os),
          browser: text(r.browser),
          viewport: text(r.viewport),
          phone: r.phone === '1' ? true : r.phone === '0' ? false : null,
          stack: text(r.stack),
          systems: strings(r.systems),
          browsers: strings(r.browsers),
          anonymous,
          people: Math.max(0, num(r.accountsAndEmpty) - (anonymous > 0 ? 1 : 0)),
          accounts: strings(r.accounts).slice(0, ERROR_ACCOUNTS_SHOWN),
        });
        return g.success ? [g.data] : [];
      });
    },
  };
}
