// Groups the errors like the SQL of the Analytics Engine reader, for the local demo and the tests.
import { ERRORS_SHOWN, ERROR_ACCOUNTS_SHOWN } from '@qv/schema';
import type { ClientErrorGroup } from '@qv/schema';
import type {
  ClientErrorPoint,
  ClientErrorRecorder,
  ClientErrorsReader,
} from '../../ports/clientErrors';
import { scrubErrorMessage, scrubStack } from '../../services/clientErrors';
import { resolved } from './resolved';

type Kept = ClientErrorPoint & { at: number };

/** The `n` most frequent values that are not empty, like `topK(n)`. */
function top(values: string[], n: number): string[] {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([v]) => v);
}

function group(points: Kept[]): ClientErrorGroup & { at: number } {
  const last = points.reduce((a, b) => (b.at > a.at ? b : a));
  const first = Math.min(...points.map((p) => p.at));
  const accounts = points.flatMap((p) => (p.account ? [p.account] : []));
  return {
    kind: last.kind,
    page: last.page,
    message: last.message,
    version: last.version,
    count: points.length,
    firstSeen: new Date(first).toISOString(),
    lastSeen: new Date(last.at).toISOString(),
    os: last.os,
    browser: last.browser,
    viewport: last.viewport,
    phone: last.phone,
    stack: last.stack,
    systems: top(
      points.map((p) => p.os),
      5,
    ),
    browsers: top(
      points.map((p) => p.browser),
      5,
    ),
    anonymous: points.length - accounts.length,
    people: new Set(accounts).size,
    accounts: top(accounts, ERROR_ACCOUNTS_SHOWN),
    at: last.at,
  };
}

export function memoryClientErrors(
  op: { now?: () => number; start?: Kept[] } = {},
): ClientErrorRecorder & ClientErrorsReader & { points: Kept[] } {
  const now = op.now ?? Date.now;
  const points: Kept[] = [...(op.start ?? [])];
  return {
    points,
    record(point) {
      points.push({
        ...point,
        message: scrubErrorMessage(point.message),
        stack: scrubStack(point.stack),
        at: now(),
      });
    },
    read: (days) =>
      resolved(() => {
        const since = now() - days * 86_400_000;
        const groups = new Map<string, Kept[]>();
        for (const p of points) {
          if (p.at <= since) continue;
          const key = [p.kind, p.page, p.message, p.version].join('\u0000');
          groups.set(key, [...(groups.get(key) ?? []), p]);
        }
        return [...groups.values()]
          .map(group)
          .sort((a, b) => b.at - a.at)
          .slice(0, ERRORS_SHOWN + 1)
          .map(({ at: _at, ...g }) => g);
      }),
  };
}
