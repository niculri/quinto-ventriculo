// What the in-memory reports repository shows of what it keeps: the person's own reports and the administrator's queue.
import type { ReportKind } from '@qv/schema';
import type { MyReport, NewReport, Reporter, ReportGroup, Resolution } from './model';

/** The last report that has it, as admin_report_queue() takes a group's title and path. */
const lastWith = (list: NewReport[], key: 'title' | 'path') =>
  [...list].reverse().find((r) => r.location[key] !== undefined)?.location[key] ?? null;

export interface StoredReport extends NewReport {
  reportId: string;
  createdAt: string;
  resolutionId: string | null;
}
export interface StoredResolution extends Resolution {
  id: string;
  kind: ReportKind;
  targetId: string;
}
export interface Stored {
  reports: StoredReport[];
  resolutions: StoredResolution[];
  blocked: boolean;
}

/** The person's reports, newest first, each with how it was resolved. */
export function mineOf(s: Stored): MyReport[] {
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
}

function groupOf(list: StoredReport[], s: Stored, reporter: Reporter): ReportGroup {
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
}

/** The reports grouped by what they point at and how it was resolved, as admin_report_queue() gives them. */
export function queueOf(s: Stored, me: Reporter, now: Date) {
  const reporter: Reporter = { ...me, blocked: s.blocked };
  const groups = new Map<string, StoredReport[]>();
  for (const r of [...s.reports].reverse()) {
    const key = `${r.resolutionId ?? ''}|${r.kind}|${r.id}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const all = [...groups.values()].map((list) => groupOf(list, s, reporter));
  return {
    open: all.filter((g) => !g.resolution),
    // As admin_report_queue(): the last 200.
    resolved: all
      .filter((g) => g.resolution)
      .sort((a, b) => b.resolution!.resolvedAt.localeCompare(a.resolution!.resolvedAt))
      .slice(0, 200),
    blocked: s.blocked
      ? [{ id: me.id, name: me.name, email: me.email, blockedAt: now.toISOString() }]
      : [],
  };
}
