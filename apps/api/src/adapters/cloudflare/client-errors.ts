// Analytics Engine: the browsers' errors as anonymous points (what, where, which deploy; never who), and read back.
import { CLIENT_ERROR_DAYS, ClientErrorGroup } from '@qv/schema';
import type { ClientErrorReport } from '@qv/schema';
import { ERRORS_SHOWN } from '../../ports/client-errors';
import type { ClientErrorRecorder, ClientErrorsReader } from '../../ports/client-errors';
import { scrubErrorMessage } from '../../services/client-errors';
import { aeTime, analyticsEngineSql, num } from './analytics-engine';
import type { AnalyticsReaderOptions, UsageDataset } from './analytics-engine';

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
          kind: r.kind,
          page: r.page,
          message: r.message,
          version: r.version,
          count: num(r.n),
          lastSeen: typeof r.latest === 'string' ? aeTime(r.latest) : '',
        });
        return g.success ? [g.data] : [];
      });
    },
  };
}
