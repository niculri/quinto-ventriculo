// Counts the points like the SQL API, for the local demo and the tests.
import type { UsageEventKind } from '@qv/schema';
import type { OpenCounts, UsageEvent, UsageOpensReader, UsageRecorder } from '../../ports/usage';
import { resolved } from './resolved';

export function memoryUsageEvents(
  op: { now?: () => number; seed?: (UsageEvent & { at: number })[] } = {},
): UsageRecorder & UsageOpensReader & { points: (UsageEvent & { at: number })[] } {
  const now = op.now ?? Date.now;
  const points = [...(op.seed ?? [])];
  return {
    points,
    record(event) {
      points.push({ ...event, at: now() });
    },
    read: () => resolved(() => countOpens(points, now())),
  };
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function countOpens(points: (UsageEvent & { at: number })[], t: number): OpenCounts {
  const hourly = new Map<string, { hour: string; kind: UsageEventKind; count: number }>();
  const items = new Map<string, { kind: 'note' | 'deck' | 'quiz'; path: string; count: number }>();
  const searches = new Map<string, number>();
  for (const p of points) {
    if (p.at <= t - 31 * DAY_MS || p.at > t) continue;
    const hour = new Date(Math.floor(p.at / HOUR_MS) * HOUR_MS).toISOString();
    const h = hourly.get(`${hour}|${p.kind}`) ?? { hour, kind: p.kind, count: 0 };
    h.count += 1;
    hourly.set(`${hour}|${p.kind}`, h);
    if (p.at <= t - 30 * DAY_MS) continue;
    if (p.kind === 'search') {
      searches.set(p.context ?? '', (searches.get(p.context ?? '') ?? 0) + 1);
    } else {
      const i = items.get(`${p.kind}|${p.path}`) ?? { kind: p.kind, path: p.path, count: 0 };
      i.count += 1;
      items.set(`${p.kind}|${p.path}`, i);
    }
  }
  return {
    hourly: [...hourly.values()],
    items: [...items.values()].sort((a, b) => b.count - a.count).slice(0, 200),
    searches: [...searches].map(([context, count]) => ({ context, count })),
  };
}
