// What the in-memory reports repository does to what it keeps, with the same limits as the database.
import { REPORT_LIMITS } from '@qv/schema';
import { REPORT_MESSAGES, ReportError } from './model';
import type { NewReport, ResolveInput } from './model';
import { cleanLocation, placeOf, trimSpaces } from './memoryPlace';
import type { Stored } from './memoryViews';
import { blankToNull } from '../../../../shared/lib/blankToNull';

/** report_content() keeps the code trimmed, or none. */
const codeOf = (code: string | null) => (code === null ? null : blankToNull(trimSpaces(code)));

/** The reports with a new one first, if the person is not blocked and is within the limits. */
export function withReport(s: Stored, r: NewReport, now: Date): Stored {
  if (s.blocked) throw new ReportError(REPORT_MESSAGES.blocked);
  const day = now.getTime() - 86_400_000;
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
  return {
    ...s,
    reports: [
      {
        ...r,
        code: codeOf(r.code),
        location: cleanLocation(r.kind, r.location),
        comment: trimSpaces(r.comment),
        reportId: crypto.randomUUID(),
        createdAt: now.toISOString(),
        resolutionId: null,
      },
      ...s.reports,
    ],
  };
}

/** Everything open about a target resolved in one go, and how many reports that closed. */
export function withResolution(
  s: Stored,
  input: ResolveInput,
  now: Date,
): { next: Stored; count: number } {
  const note = input.note === null ? null : blankToNull(trimSpaces(input.note));
  if (note && Array.from(note).length > 500) throw new ReportError(REPORT_MESSAGES.offline);
  const open = s.reports.filter(
    (r) => !r.resolutionId && r.kind === input.kind && r.id === input.targetId,
  );
  if (!open.length) throw new ReportError(REPORT_MESSAGES.nothingOpen);
  const id = crypto.randomUUID();
  return {
    count: open.length,
    next: {
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
          resolvedAt: now.toISOString(),
        },
      ],
      reports: s.reports.map((r) => (open.includes(r) ? { ...r, resolutionId: id } : r)),
    },
  };
}

/** A resolution undone: its reports are open again. */
export function withoutResolution(s: Stored, resolutionId: string): Stored {
  if (!s.resolutions.some((x) => x.id === resolutionId)) {
    throw new ReportError(REPORT_MESSAGES.nothingOpen);
  }
  return {
    ...s,
    resolutions: s.resolutions.filter((x) => x.id !== resolutionId),
    reports: s.reports.map((r) =>
      r.resolutionId === resolutionId ? { ...r, resolutionId: null } : r,
    ),
  };
}
