// «Uso» without React: how a figure is written, the rows and periods of the summary, the
// points of the chart, and the name and link of a deck, a test or a note.
import { FEW } from '@qv/schema';
import type { Catalog, UsageCount, UsageFigures, UsageOpenFigures, UsageReport } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import type { buildAnkiTree } from '../../catalog/model/tree';
import { hasPage } from '../../catalog/model/tree';
import { locateNote } from '../../catalog/model/catalog';
import { usageStrings as s } from './strings/usage.strings';

export const NUMBER = new Intl.NumberFormat('es-CL');
const SHORT_DAY = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
export const shortDay = (day: string) => SHORT_DAY.format(new Date(`${day}T12:00:00Z`));

/**
 * Every figure is exact; a «<5» or a null comes only from an older admin_usage() (`FEW`): «menos de 5» for students,
 * «—» for the rest.
 */
export function figure(v: UsageCount | null, students = false): string {
  if (v === null) return s.none;
  if (v === FEW) return students ? s.few : s.none;
  return NUMBER.format(v);
}

export type FigureKey = keyof UsageFigures;
export type OpenKey = keyof UsageOpenFigures;
export type Metric = FigureKey | OpenKey;
export type Period = 'day' | 'week';

export const ROWS: { key: FigureKey; label: string; students?: boolean }[] = [
  { key: 'activeStudents', label: s.rows.activeStudents, students: true },
  { key: 'newStudents', label: s.rows.newStudents, students: true },
  { key: 'ankiAnswers', label: s.rows.ankiAnswers },
  { key: 'newCards', label: s.rows.newCards },
  { key: 'roundsStarted', label: s.rows.roundsStarted },
  { key: 'roundsFinished', label: s.rows.roundsFinished },
];
export const OPEN_ROWS: { key: OpenKey; label: string }[] = [
  { key: 'notes', label: s.openRows.notes },
  { key: 'decks', label: s.openRows.decks },
  { key: 'quizzes', label: s.openRows.quizzes },
  { key: 'searches', label: s.openRows.searches },
];
export const PERIODS = [
  { key: 'today', label: s.periods.today },
  { key: 'last7', label: s.periods.last7 },
  { key: 'last30', label: s.periods.last30 },
] as const;

export const isOpenKey = (m: Metric): m is OpenKey => OPEN_ROWS.some((r) => r.key === m);

/** The chart's points; the opens are kept by day only. */
export function chartPoints(
  report: UsageReport | null,
  metric: Metric,
  byWeek: boolean,
): { label: string; value: UsageCount }[] {
  if (!report) return [];
  if (isOpenKey(metric))
    return (report.opens?.days ?? []).map((d) => ({ label: d.day, value: d[metric] }));
  return byWeek
    ? report.weeks.map((w) => ({ label: w.week, value: w[metric] }))
    : report.days.map((d) => ({ label: d.day, value: d[metric] }));
}

export const barHeight = (value: UsageCount, max: number) =>
  value === FEW ? '4%' : `${value === 0 ? 0 : Math.max(2, (100 * value) / max)}%`;

export interface Named {
  name: string;
  detail: string | null;
  to: string | null;
}

export function deckNamed(tree: ReturnType<typeof buildAnkiTree>, id: string): Named {
  const node = tree.byId.get(id);
  if (!node) return { name: s.details.deck(id), detail: null, to: null };
  let withPage = node;
  while (!hasPage(withPage) && withPage.parent) withPage = withPage.parent;
  return {
    name: node.label,
    detail: node.course?.name ?? null,
    to: hasPage(withPage) ? paths.deck(withPage.ref) : null,
  };
}

export function quizNamed(catalog: Catalog, id: string): Named {
  for (const sem of catalog.semesters) {
    for (const course of sem.courses) {
      for (const a of course.assessments) {
        const q = a.quizzes.find((x) => x.id === id);
        if (q) return { name: q.title, detail: course.name, to: paths.quiz(course, q) };
      }
    }
  }
  return { name: id, detail: null, to: null };
}

export function noteNamed(catalog: Catalog, slug: string): Named {
  const found = locateNote(catalog, 'slug', slug);
  return found
    ? {
        name: found.note.title,
        detail: found.course.name,
        to: paths.note(found.course, found.note.slug),
      }
    : { name: slug, detail: null, to: null };
}
