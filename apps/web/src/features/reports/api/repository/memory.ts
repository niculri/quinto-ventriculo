// Error reports kept in the browser with the same limits as the database, for the demo and the tests.
import { REPORT_LIMITS } from '@qv/schema';
import type { ReportKind } from '@qv/schema';
import type { ReportsRepository } from './port';
import { REPORT_MESSAGES, ReportError } from './model';
import type { NewReport, Reporter, ReportGroup, Resolution } from './model';
import { cleanLocation, placeOf, trimSpaces } from './memory-place';
import { storageKeys } from '../../../../shared/lib/storage';

export { placeOf } from './memory-place';

/** report_content() keeps the code trimmed, or none. */
const codeOf = (code: string | null) => (code === null ? null : trimSpaces(code) || null);
/** The last report that has it, as admin_report_queue() takes a group's title and path. */
const lastWith = (list: NewReport[], key: 'title' | 'path') =>
  [...list].reverse().find((r) => r.location[key] !== undefined)?.location[key] ?? null;

interface StoredReport extends NewReport {
  reportId: string;
  createdAt: string;
  resolutionId: string | null;
}
interface StoredResolution extends Resolution {
  id: string;
  kind: ReportKind;
  targetId: string;
}
interface Stored {
  reports: StoredReport[];
  resolutions: StoredResolution[];
  blocked: boolean;
}

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
    async send(r) {
      const s = read();
      if (s.blocked) throw new ReportError(REPORT_MESSAGES.blocked);
      const day = now().getTime() - 86_400_000;
      if (s.reports.filter((x) => Date.parse(x.createdAt) > day).length >= REPORT_LIMITS.perDay) {
        throw new ReportError(REPORT_MESSAGES.dailyLimit);
      }
      const place = placeOf(r);
      const open = s.reports.filter(
        (x) => !x.resolutionId && x.kind === r.kind && x.id === r.id && placeOf(x) === place,
      );
      if (open.length >= REPORT_LIMITS.openPerPlace) {
        throw new ReportError(REPORT_MESSAGES.placeLimit);
      }
      write({
        ...s,
        reports: [
          {
            ...r,
            code: codeOf(r.code),
            location: cleanLocation(r.kind, r.location),
            comment: trimSpaces(r.comment),
            reportId: crypto.randomUUID(),
            createdAt: now().toISOString(),
            resolutionId: null,
          },
          ...s.reports,
        ],
      });
    },
    async mine() {
      const s = read();
      return s.reports.map((r) => {
        const x = s.resolutions.find((y) => y.id === r.resolutionId);
        return {
          id: r.reportId,
          kind: r.kind,
          targetId: r.id,
          code: r.code,
          version: r.version,
          category: r.category,
          comment: r.comment,
          location: r.location,
          createdAt: r.createdAt,
          resolution: x
            ? {
                status: x.status,
                note: x.note,
                fixedVersion: x.fixedVersion,
                resolvedAt: x.resolvedAt,
              }
            : null,
        };
      });
    },
    async queue() {
      onlyAdmin();
      const s = read();
      const reporter: Reporter = { ...me, blocked: s.blocked };
      const groups = new Map<string, StoredReport[]>();
      for (const r of [...s.reports].reverse()) {
        const key = `${r.resolutionId ?? ''}|${r.kind}|${r.id}`;
        groups.set(key, [...(groups.get(key) ?? []), r]);
      }
      const all: ReportGroup[] = [...groups.values()].map((list) => {
        const last = list[list.length - 1]!;
        const x = s.resolutions.find((y) => y.id === last.resolutionId);
        const versions = list.map((r) => r.version).filter((v): v is number => v !== null);
        return {
          kind: last.kind,
          targetId: last.id,
          code: [...list].reverse().find((r) => r.code)?.code ?? null,
          version: versions.length ? Math.max(...versions) : null,
          title: lastWith(list, 'title'),
          path: lastWith(list, 'path'),
          reporters: 1,
          firstAt: list[0]!.createdAt,
          lastAt: last.createdAt,
          resolution: x
            ? {
                id: x.id,
                status: x.status,
                note: x.note,
                fixedVersion: x.fixedVersion,
                resolvedAt: x.resolvedAt,
              }
            : null,
          reports: list.map((r) => ({
            id: r.reportId,
            category: r.category,
            comment: r.comment,
            location: r.location,
            version: r.version,
            createdAt: r.createdAt,
            reporter,
          })),
        };
      });
      return {
        open: all.filter((g) => !g.resolution),
        // As admin_report_queue(): the last 200.
        resolved: all
          .filter((g) => g.resolution)
          .sort((a, b) => b.resolution!.resolvedAt.localeCompare(a.resolution!.resolvedAt))
          .slice(0, 200),
        blocked: s.blocked
          ? [{ id: me.id, name: me.name, email: me.email, blockedAt: now().toISOString() }]
          : [],
      };
    },
    async resolve(input) {
      onlyAdmin();
      const note = input.note === null ? null : trimSpaces(input.note) || null;
      if (note && [...note].length > 500) throw new ReportError(REPORT_MESSAGES.offline);
      const s = read();
      const open = s.reports.filter(
        (r) => !r.resolutionId && r.kind === input.kind && r.id === input.targetId,
      );
      if (!open.length) throw new ReportError(REPORT_MESSAGES.nothingOpen);
      const id = crypto.randomUUID();
      write({
        ...s,
        resolutions: [
          ...s.resolutions,
          {
            id,
            kind: input.kind,
            targetId: input.targetId,
            status: input.status,
            note,
            fixedVersion: input.status === 'fixed' ? input.fixedVersion : null,
            resolvedAt: now().toISOString(),
          },
        ],
        reports: s.reports.map((r) => (open.includes(r) ? { ...r, resolutionId: id } : r)),
      });
      return open.length;
    },
    async reopen(resolutionId) {
      onlyAdmin();
      const s = read();
      if (!s.resolutions.some((x) => x.id === resolutionId)) {
        throw new ReportError(REPORT_MESSAGES.nothingOpen);
      }
      write({
        ...s,
        resolutions: s.resolutions.filter((x) => x.id !== resolutionId),
        reports: s.reports.map((r) =>
          r.resolutionId === resolutionId ? { ...r, resolutionId: null } : r,
        ),
      });
    },
    // The demo's only person is the administrator, and admin_set_report_block() never blocks one.
    async setBlocked(_userId, blocked) {
      onlyAdmin();
      if (blocked) throw new ReportError(REPORT_MESSAGES.adminStays);
      write({ ...read(), blocked });
    },
  };
}
