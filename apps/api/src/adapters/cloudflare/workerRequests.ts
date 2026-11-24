// The Worker's requests by UTC day, from Cloudflare's GraphQL Analytics API with the same «Account Analytics: Read»
// token as the opens: the whole account, because the free plan's 100,000 a day are counted over all its Workers.
import { WORKER_REQUEST_DAYS, WorkerRequestDay } from '@qv/schema';
import type { WorkerRequestsReader } from '../../ports/usage';
import { num } from './analyticsEngine';
import type { AnalyticsReaderOptions } from './analyticsEngine';

const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';
const DAY_MS = 86_400_000;

const QUERY = `query WorkerRequests($account: string!, $from: Date!, $to: Date!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      workersInvocationsAdaptive(limit: 10000, filter: { date_geq: $from, date_leq: $to }) {
        sum { requests }
        dimensions { date }
      }
    }
  }
}`;

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const field = (v: unknown, key: string): unknown => (isRecord(v) ? v[key] : undefined);

/** The rows of the answer, or why there are none: GraphQL answers 200 with `errors` when the query is refused. */
function answerRows(body: unknown): unknown[] {
  const errors = field(body, 'errors');
  if (Array.isArray(errors) && errors.length) {
    throw new Error(`GraphQL Analytics: ${String(field(errors[0], 'message'))}`);
  }
  const accounts = field(field(field(body, 'data'), 'viewer'), 'accounts');
  const rows = Array.isArray(accounts) ? field(accounts[0], 'workersInvocationsAdaptive') : null;
  if (!Array.isArray(rows)) throw new Error('GraphQL Analytics: an answer without rows');
  return rows;
}

/** Each day of the window once, oldest first: a day without requests is a zero, not a gap. */
export function requestDays(body: unknown, today: number): WorkerRequestDay[] {
  const byDay = new Map<string, number>();
  for (const row of answerRows(body)) {
    const day = field(field(row, 'dimensions'), 'date');
    if (typeof day !== 'string') continue;
    byDay.set(day, (byDay.get(day) ?? 0) + num(field(field(row, 'sum'), 'requests')));
  }
  return Array.from({ length: WORKER_REQUEST_DAYS }, (_, i) => {
    const day = utcDay(today - (WORKER_REQUEST_DAYS - 1 - i) * DAY_MS);
    return WorkerRequestDay.parse({ day, requests: byDay.get(day) ?? 0 });
  });
}

export function workerRequestsReader(
  op: AnalyticsReaderOptions & { now?: () => number },
): WorkerRequestsReader {
  const doFetch = op.fetch ?? fetch;
  const now = op.now ?? Date.now;
  return {
    async read() {
      const today = now();
      const r = await doFetch(GRAPHQL_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${op.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: QUERY,
          variables: {
            account: op.accountId,
            from: utcDay(today - (WORKER_REQUEST_DAYS - 1) * DAY_MS),
            to: utcDay(today),
          },
        }),
      });
      if (!r.ok) throw new Error(`GraphQL Analytics: ${r.status}`);
      return requestDays(await r.json(), today);
    },
  };
}
