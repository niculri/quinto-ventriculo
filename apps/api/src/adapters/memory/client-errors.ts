// Groups the errors like the SQL of the Analytics Engine reader, for the local demo and the tests.
import { CLIENT_ERROR_DAYS } from '@qv/schema';
import type { ClientErrorGroup, ClientErrorReport } from '@qv/schema';
import { ERRORS_SHOWN } from '../../ports/client-errors';
import type { ClientErrorRecorder, ClientErrorsReader } from '../../ports/client-errors';
import { scrubErrorMessage } from '../../services/client-errors';
import { resolved } from './resolved';

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
    read: () =>
      resolved(() => {
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
      }),
  };
}
