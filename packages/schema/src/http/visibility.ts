// The courses the administrators can turn off: the catalog without them, and the panel's list of them.
import type { Catalog, CourseWithAssessments, SiteSemester } from './api';

/** The decks of the courses turned off, as ids; a deck belongs to a course through its own `courseId`. */
function hiddenDeckIds(catalog: Catalog, hidden: ReadonlySet<string>): Set<string> {
  return new Set(
    catalog.anki.decks.filter((d) => d.courseId && hidden.has(d.courseId)).map((d) => d.id),
  );
}

/**
 * The catalog without the courses turned off: their notes, tests and decks. The decks above them (the root and the
 * semesters', which belong to no course) lose their cards from the counts, so nothing shows how much was taken out.
 */
export function withoutCourses(catalog: Catalog, hidden: ReadonlySet<string>): Catalog {
  if (!hidden.size) return catalog;
  const gone = hiddenDeckIds(catalog, hidden);
  const byId = new Map(catalog.anki.decks.map((d) => [d.id, d]));
  const lost = new Map<string, { notes: number; cards: number }>();
  for (const id of gone) {
    const top = byId.get(id)!;
    if (top.parentId && gone.has(top.parentId)) continue;
    for (let up = top.parentId; up; up = byId.get(up)?.parentId ?? null) {
      const sum = lost.get(up) ?? { notes: 0, cards: 0 };
      lost.set(up, { notes: sum.notes + top.noteCount, cards: sum.cards + top.cardCount });
    }
  }
  return {
    ...catalog,
    semesters: catalog.semesters.map((s) => ({
      ...s,
      courses: s.courses.filter((c) => !hidden.has(c.id)),
    })),
    anki: {
      ...catalog.anki,
      decks: catalog.anki.decks
        .filter((d) => !gone.has(d.id))
        .map((d) => {
          const l = lost.get(d.id);
          return l
            ? {
                ...d,
                noteCount: Math.max(0, d.noteCount - l.notes),
                cardCount: Math.max(0, d.cardCount - l.cards),
              }
            : d;
        }),
    },
  };
}

const countOf = (course: CourseWithAssessments) =>
  course.assessments.reduce(
    (n, a) => ({
      notes: n.notes + a.notes.length,
      quizzes: n.quizzes + a.quizzes.length,
      cards: n.cards + a.cardCount,
    }),
    { notes: 0, quizzes: 0, cards: 0 },
  );

/** The panel's list: the courses with material (or already off), by semester, with what each one holds. */
export function siteSemesters(catalog: Catalog, hidden: ReadonlySet<string>): SiteSemester[] {
  return catalog.semesters
    .map((s) => ({
      number: s.number,
      name: s.name,
      courses: s.courses
        .map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, ...countOf(c) }))
        .filter((c) => hidden.has(c.id) || c.notes + c.quizzes + c.cards > 0),
    }))
    .filter((s) => s.courses.length > 0);
}
