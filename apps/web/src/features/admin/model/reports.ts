// «Reportes» without React: how many reports of each category a group has, the oldest version they saw, and the
// version proposed as the one with the fix.
import type { ReportCategory } from '@qv/schema';
import type { ReportGroup } from '@qv/schema/user';

export function categoryCounts(group: ReportGroup): Map<ReportCategory, number> {
  const counts = new Map<ReportCategory, number>();
  for (const r of group.reports) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  return counts;
}

/** The oldest version the reports saw, if it is older than today's; null if there is nothing to say. */
export function changedSince(group: ReportGroup, current: number | null): number | null {
  const seen = group.reports.map((r) => r.version).filter((v): v is number => v !== null);
  if (!current || !seen.length) return null;
  const oldest = Math.min(...seen);
  return current <= oldest ? null : oldest;
}

/**
 * The version that has the fix: today's if it is newer than what they saw (already published); if not, the next one,
 * so whoever saw the error never reads «Corregido» with the version they saw.
 */
export function proposedVersion(group: ReportGroup, current: number | null): string {
  const seen = group.version;
  const v = current && (!seen || current > seen) ? current : seen ? seen + 1 : current;
  return group.kind === 'quiz_question' || !v ? '' : String(v);
}

export const fixedVersionOf = (typed: string) =>
  /^[0-9]{1,6}$/.test(typed.trim()) ? Number(typed.trim()) : null;
