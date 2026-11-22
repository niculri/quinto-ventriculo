// Error reports kept in the browser with the same limits as the database, for the demo and the tests.
import type { ReportsRepository } from './port';
import { REPORT_MESSAGES, ReportError } from './model';
import type { Reporter } from './model';
import { withReport, withResolution, withoutResolution } from './memoryActions';
import { mineOf, queueOf } from './memoryViews';
import type { Stored } from './memoryViews';
import { settle } from '../../../../shared/lib/settle';
import { storageKeys } from '../../../../shared/lib/storage';

export { placeOf } from './memoryPlace';

export function localReportsRepository(
  options: { storage?: Storage | null; admin?: boolean; email?: string; now?: () => Date } = {},
): ReportsRepository {
  const storage = options.storage ?? null;
  const KEY = storageKeys.demo.contentReports;
  const now = options.now ?? (() => new Date());
  let memory: Stored = { reports: [], resolutions: [], blocked: false };
  const read = (): Stored => {
    if (!storage) return memory;
    try {
      return { ...memory, ...(JSON.parse(storage.getItem(KEY) ?? 'null') as Stored | null) };
    } catch {
      return memory;
    }
  };
  const write = (s: Stored) => {
    memory = s;
    try {
      storage?.setItem(KEY, JSON.stringify(s));
    } catch {
      // storage blocked: memory only
    }
  };
  const onlyAdmin = () => {
    if (!(options.admin ?? false)) throw new ReportError(REPORT_MESSAGES.adminOnly);
  };
  const me: Reporter = {
    id: 'demo',
    name: 'Estudiante de prueba',
    email: options.email ?? 'demo@ug.uchile.cl',
    blocked: false,
  };
  return {
    send: (r) =>
      settle(() => {
        write(withReport(read(), r, now()));
      }),
    mine: () => settle(() => mineOf(read())),
    queue: () =>
      settle(() => {
        onlyAdmin();
        return queueOf(read(), me, now());
      }),
    resolve: (input) =>
      settle(() => {
        onlyAdmin();
        const { next, count } = withResolution(read(), input, now());
        write(next);
        return count;
      }),
    reopen: (resolutionId) =>
      settle(() => {
        onlyAdmin();
        write(withoutResolution(read(), resolutionId));
      }),
    // The demo's only person is the administrator, and admin_set_report_block() never blocks one.
    setBlocked: (_userId, blocked) =>
      settle(() => {
        onlyAdmin();
        if (blocked) throw new ReportError(REPORT_MESSAGES.adminStays);
        write({ ...read(), blocked });
      }),
  };
}
