// The ids of what is published (notes, decks and tests) and the course each belongs to, kept five minutes.
import type { Catalog } from '@qv/schema';
import type { Dependencies } from '../dependencies';

export type PublishedIds = () => Promise<Map<string, string | null>>;

const KEPT_SECONDS = 300;

type Entry = [string, string | null];

function entriesOf(catalog: Catalog): Entry[] {
  const inCourses = catalog.semesters.flatMap((s) =>
    s.courses.flatMap((course) =>
      course.assessments.flatMap((a): Entry[] => [
        ...a.notes.map((n): Entry => [`note:${n.slug}`, course.id]),
        ...a.quizzes.map((q): Entry => [`quiz:${q.id}`, course.id]),
      ]),
    ),
  );
  return [...inCourses, ...catalog.anki.decks.map((d): Entry => [`deck:${d.id}`, d.courseId])];
}

/** Only published ids are counted, so no text sent by a student ever goes into a point. */
export function publishedIds(deps: Dependencies): PublishedIds {
  let kept: { until: number; ids: Map<string, string | null> } | null = null;
  return async () => {
    const t = deps.now();
    if (kept && kept.until > t) return kept.ids;
    const ids = new Map(entriesOf(await deps.repository.catalog()));
    kept = { until: t + KEPT_SECONDS, ids };
    return ids;
  };
}
