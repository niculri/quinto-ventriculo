// Analytics Engine: the points of the opens, written by the binding and read back with its SQL API (the kind, the
// content path or the kind of page, the moment; never who nor what was searched).
import { USAGE_EVENT_KINDS } from '@qv/schema';
import type { UsageEventKind } from '@qv/schema';
import type { UsageEvent, UsageOpensReader, UsageRecorder } from '../../ports/usage';

export interface UsageDataset {
  writeDataPoint(point: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void;
}

/** blob1 the kind, blob2 the path, blob3 the kind of page of a search. */
export function usagePoint(event: UsageEvent) {
  return {
    indexes: [event.kind],
    blobs: [event.kind, event.path.slice(0, 200), event.context ?? ''],
    doubles: [1],
  };
}

export function analyticsEngineRecorder(dataset: UsageDataset): UsageRecorder {
  return {
    record(event) {
      try {
        dataset.writeDataPoint(usagePoint(event));
      } catch (e) {
        console.error(e);
      }
    },
  };
}

export interface AnalyticsReaderOptions {
  accountId: string;
  token: string;
  dataset?: string;
  fetch?: typeof fetch;
}

const USAGE_DATASET = 'qv_usage';

function aeRows(body: unknown): Record<string, unknown>[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) throw new Error('Analytics Engine: una respuesta sin filas');
  return data.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object');
}
export const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};
const isKind = (v: unknown): v is UsageEventKind =>
  typeof v === 'string' && (USAGE_EVENT_KINDS as readonly string[]).includes(v);

/** Analytics Engine's SQL API, and the dataset name checked to go into the SQL. */
export function analyticsEngineSql(op: AnalyticsReaderOptions) {
  const doFetch = op.fetch ?? fetch;
  const dataset = op.dataset ?? USAGE_DATASET;
  if (!/^[a-z0-9_]+$/.test(dataset)) throw new Error('dataset inválido');
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(op.accountId)}/analytics_engine/sql`;
  const query = async (sql: string) => {
    const r = await doFetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${op.token}`, 'Content-Type': 'text/plain' },
      body: sql,
    });
    if (!r.ok) throw new Error(`Analytics Engine: ${r.status}`);
    return aeRows(await r.json());
  };
  return { dataset, query };
}

/** With a sampled dataset, each row counts `_sample_interval`. */
export function analyticsEngineReader(op: AnalyticsReaderOptions): UsageOpensReader {
  const { dataset, query } = analyticsEngineSql(op);
  return {
    async read() {
      const [hourly, items, searches] = await Promise.all([
        query(
          `SELECT toStartOfInterval(timestamp, INTERVAL '1' HOUR) AS hour, blob1 AS kind, SUM(_sample_interval) AS n ` +
            `FROM ${dataset} WHERE timestamp > NOW() - INTERVAL '31' DAY GROUP BY hour, kind ORDER BY hour LIMIT 10000 FORMAT JSON`,
        ),
        query(
          `SELECT blob1 AS kind, blob2 AS path, SUM(_sample_interval) AS n FROM ${dataset} ` +
            `WHERE timestamp > NOW() - INTERVAL '30' DAY AND blob1 IN ('note', 'deck', 'quiz') ` +
            `GROUP BY kind, path ORDER BY n DESC LIMIT 200 FORMAT JSON`,
        ),
        query(
          `SELECT blob3 AS context, SUM(_sample_interval) AS n FROM ${dataset} ` +
            `WHERE timestamp > NOW() - INTERVAL '30' DAY AND blob1 = 'search' GROUP BY context ORDER BY n DESC LIMIT 20 FORMAT JSON`,
        ),
      ]);
      return {
        hourly: hourly.flatMap((r) =>
          isKind(r.kind) && typeof r.hour === 'string'
            ? [{ hour: aeTime(r.hour), kind: r.kind, count: num(r.n) }]
            : [],
        ),
        items: items.flatMap((r) =>
          (r.kind === 'note' || r.kind === 'deck' || r.kind === 'quiz') &&
          typeof r.path === 'string'
            ? [{ kind: r.kind, path: r.path, count: num(r.n) }]
            : [],
        ),
        searches: searches.map((r) => ({
          context: typeof r.context === 'string' ? r.context : '',
          count: num(r.n),
        })),
      };
    },
  };
}

/** «2026-11-09 13:00:00» (UTC) → ISO. */
export const aeTime = (t: string) =>
  /^\d{4}-\d{2}-\d{2} /.test(t) ? `${t.replace(' ', 'T')}Z` : t;
