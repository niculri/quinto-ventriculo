// The «Uso» report as the panel reads it: the database figures with the opens, the browsers' errors and the Worker's
// requests, kept a minute.
import type { UsageReport } from '@qv/schema';
import type { Dependencies } from '../dependencies';
import { usageGroups, usageReport } from './usageReport';

type UsageReading = { ok: true; report: UsageReport } | { ok: false };

export interface UsageReader {
  read(token: string): Promise<UsageReading>;
}

export function usageReader(deps: Dependencies): UsageReader {
  let kept: { until: number; report: UsageReport } | null = null;

  const readOpens = async () => {
    if (!deps.configured.usageOpens) return { status: 'not_configured' as const };
    try {
      return { status: 'ok' as const, counts: await deps.usageOpens.read() };
    } catch (e) {
      console.error(e);
      return { status: 'unavailable' as const };
    }
  };

  /** Null when the part is not there or its reading failed: the rest of the report does not wait on it. */
  const readOrNull = async <T>(configured: boolean, read: () => Promise<T>): Promise<T | null> => {
    if (!configured) return null;
    try {
      return await read();
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  return {
    async read(token) {
      const t = deps.now();
      if (kept && kept.until > t) return { ok: true, report: kept.report };
      const catalog = await deps.repository.catalog();
      const [stats, opens, clientErrors, workerRequests] = await Promise.all([
        deps.usageStats.stats(token, usageGroups(catalog)).then(
          (s) => ({ ok: true as const, s }),
          (e: unknown) => ({ ok: false as const, e }),
        ),
        readOpens(),
        readOrNull(deps.configured.clientErrorsReader, () => deps.clientErrorsReader.read()),
        readOrNull(deps.configured.workerRequests, () => deps.workerRequests.read()),
      ]);
      if (!stats.ok) {
        console.error(stats.e);
        return { ok: false };
      }
      const report = usageReport(stats.s, opens, { clientErrors, workerRequests });
      kept = { until: t + deps.usageTtl, report };
      return { ok: true, report };
    },
  };
}
