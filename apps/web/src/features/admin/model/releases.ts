// «Publicaciones» without React: the review list's status, the lines of what changes in the site and in each
// assessment, the summary of the popup to publish and the line of a publication in the record.
import { lastName, onlyInCatalog } from '@qv/release-review';
import type { ReviewList } from '@qv/release-review';
import type {
  Catalog,
  ReleaseAssessment,
  ReleaseClass,
  ReleaseOverview,
  ReleaseRecord,
} from '@qv/schema';
import { plural } from '../../../shared/lib/plural';
import { releasesStrings } from './strings/releases.strings';

type Summary = ReleaseOverview['summary'];

/** A count with its word in singular and plural. */
export type CountLine = readonly [n: number, one: string, many: string];

/** Today in Santiago, YYYY-MM-DD. */
export const santiagoToday = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(now);

export const reviewStatus = (r: ReviewList) =>
  r.pending
    ? releasesStrings.review.pending
    : r.blocking
      ? releasesStrings.review.blocking(r.blocking)
      : r.manual.every((m) => m.checked)
        ? releasesStrings.review.nothing
        : releasesStrings.review.marksMissing;

export const classTone = (c: ReleaseClass | null) =>
  c === 'answer' || c === 'content' ? 'warn' : 'muted';

/** The assessments that have their own card: an empty one that only comes into the catalog is a line above. */
export const shownAssessments = (summary: Summary) =>
  summary.assessments.filter((a) => !onlyInCatalog(summary, a));

function deckLine(d: Summary['decks'][number]): string {
  if (d.op === 'added') return releasesStrings.site.deckNew(lastName(d.name));
  if (d.op === 'removed') return releasesStrings.site.deckGone(lastName(d.name));
  if (d.nameBefore && d.nameBefore !== d.name)
    return releasesStrings.site.deckRenamed(lastName(d.nameBefore), lastName(d.name));
  if (d.presetBefore !== d.presetAfter)
    return releasesStrings.site.deckPreset(lastName(d.name), d.presetBefore, d.presetAfter);
  return releasesStrings.site.deckMoved(lastName(d.name));
}

/** What changes above the assessments; an assessment goes with its course (many «Certamen 1» come at once). */
export function siteLines(summary: Summary): string[] {
  const courseOf = new Map(summary.assessments.map((a) => [a.id, a.courseName ?? a.courseId]));
  return [
    ...summary.catalog.map((c) => {
      const named = (c.after ?? c.before)?.name;
      const own = typeof named === 'string' ? named : c.id;
      const course = c.kind === 'assessment' ? courseOf.get(c.id) : null;
      const name = course ? releasesStrings.site.inCourse(course, own) : own;
      return releasesStrings.site.catalog(
        releasesStrings.site.kinds[c.kind],
        name,
        c.op,
        c.kind === 'assessment',
      );
    }),
    ...summary.noteTypes.map((t) => releasesStrings.site.noteType(t.name, t.op)),
    ...summary.presets.map((p) => releasesStrings.site.preset(p.name, p.op)),
    ...summary.decks.map(deckLine),
  ];
}

/** Each assessment's name with its course, as the catalog has them. */
export function assessmentNames(catalog: Catalog | undefined): Map<string, string> {
  const names = new Map<string, string>();
  for (const sem of catalog?.semesters ?? []) {
    for (const course of sem.courses) {
      for (const a of course.assessments)
        names.set(a.id, releasesStrings.assessment.name(course.name, a.name));
    }
  }
  return names;
}

export function indexLines(overview: ReleaseOverview, names: Map<string, string>): string[] {
  return overview.browseIndexes.map((x) => {
    const name = names.get(x.assessmentId) ?? x.assessmentId;
    return x.op === 'added'
      ? releasesStrings.site.indexAdded(name)
      : x.op === 'removed'
        ? releasesStrings.site.indexRemoved(name)
        : releasesStrings.site.indexChanged(name);
  });
}

export const assessmentTitle = (a: ReleaseAssessment) =>
  releasesStrings.assessment.name(a.courseName ?? a.courseId ?? '', a.name ?? a.id);

const words = (list: CountLine[]) =>
  list.filter(([n]) => n > 0).map(([n, one, many]) => plural(n, one, many));

function assessmentLine(a: ReleaseAssessment): string {
  // A course without a name or an id reads «null» here, as a template has always written it.
  const title = releasesStrings.assessment.name(String(a.courseName ?? a.courseId), a.name ?? a.id);
  return releasesStrings.publish.line(
    title,
    words([
      [a.articles.added, ...releasesStrings.publish.parts.articleAdded],
      [a.articles.content + a.articles.format, ...releasesStrings.publish.parts.articleChanged],
      [a.articles.removed, ...releasesStrings.publish.parts.articleRemoved],
      [a.cards.added, ...releasesStrings.publish.parts.cardAdded],
      [a.cards.answer, ...releasesStrings.publish.parts.cardAnswer],
      [a.cards.noAnswer + a.cards.format, ...releasesStrings.publish.parts.cardFixed],
      [a.cards.moved, ...releasesStrings.publish.parts.cardMoved],
      [a.cards.removed, ...releasesStrings.publish.parts.cardRemoved],
      [a.questions.added, ...releasesStrings.publish.parts.questionAdded],
      [a.questions.answer, ...releasesStrings.publish.parts.questionAnswer],
      [a.questions.noAnswer + a.questions.format, ...releasesStrings.publish.parts.questionFixed],
      [a.questions.removed, ...releasesStrings.publish.parts.questionRemoved],
    ]),
  );
}

/** What the popup to publish lists: each assessment's changes, the site's, and the card browser's. */
export function releaseLines(summary: Summary, indexes: string[]): string[] {
  const lines = shownAssessments(summary).map(assessmentLine);
  const site =
    summary.catalog.length +
    summary.noteTypes.length +
    summary.presets.length +
    summary.decks.length;
  if (site) lines.push(releasesStrings.publish.site(site));
  return [...lines, ...indexes];
}

const when = (iso: string) =>
  new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Santiago',
  }).format(new Date(iso));

export const releaseLine = (r: ReleaseRecord) =>
  r.status === 'reverted' && r.revertedAt
    ? releasesStrings.last.reverted(when(r.revertedAt), r.revertedBy)
    : releasesStrings.last.published(when(r.publishedAt), r.publishedBy);

export const failure = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

export const letter = (i: unknown) =>
  typeof i === 'number' ? `${String.fromCharCode(97 + i)})` : releasesStrings.items.noLetter;

export const textOf = (v: unknown) => (typeof v === 'string' ? v : null);
