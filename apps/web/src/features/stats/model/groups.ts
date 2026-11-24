// How a day's answers and questions of tests are grouped in the heatmap's box: by course (home page) or by assessment
// (a course's page), and which page of cards each group and the whole course take to.

import type { Catalog, CourseWithAssessments } from '@qv/schema';
import { buildAnkiTree, courseDeck, hasPage } from '../../catalog/model/tree';
import type { AnkiTree, CourseDeckNode, DeckNode } from '../../catalog/model/tree';
import { groupsStrings as s } from './strings/groups.strings';

export type GroupBy = 'course' | 'assessment';

export interface HeatmapGroups {
  groupOf: (deckId: string) => string;
  groupOfQuiz: (quizId: string) => string;
  placeOf: (label: string) => CourseDeckNode | null;
  whole: CourseDeckNode | null;
}

/** On a course's page, an assessment's deck (depth 3) takes to its own cards; on the home page, its course's. */
function placeOf(
  tree: AnkiTree,
  deckId: string,
  courseId: string,
  groupBy: GroupBy,
): DeckNode | null {
  let place: DeckNode | null = courseDeck(tree, courseId);
  if (groupBy === 'assessment') {
    for (let n: DeckNode | null | undefined = tree.byId.get(deckId); n; n = n.parent) {
      if (n.depth === 3) place = n;
    }
  }
  return place;
}

/** Each test's group: its course on the home page, its assessment on a course's page. */
function quizLabels(courses: CourseWithAssessments[], groupBy: GroupBy): Map<string, string> {
  return new Map(
    courses.flatMap((course) =>
      course.assessments.flatMap((a) =>
        a.quizzes.map(
          (q) =>
            [q.id, groupBy === 'course' ? s.course(course.emoji, course.name) : a.name] as const,
        ),
      ),
    ),
  );
}

export function heatmapGroups(
  catalog: Catalog,
  groupBy: GroupBy,
  courseId?: string,
): HeatmapGroups {
  const tree = buildAnkiTree(catalog);
  const courses = new Map(
    catalog.semesters.flatMap((sem) => sem.courses.map((c) => [c.id, c] as const)),
  );
  const assessments = new Map(
    [...courses.values()].flatMap((c) => c.assessments.map((a) => [a.id, a.name] as const)),
  );
  const byDeck = new Map<string, string>();
  const places = new Map<string, CourseDeckNode>();
  for (const d of catalog.anki.decks) {
    const course = d.courseId ? courses.get(d.courseId) : undefined;
    if (!course) continue;
    const label =
      groupBy === 'course'
        ? s.course(course.emoji, course.name)
        : ((d.assessmentId && assessments.get(d.assessmentId)) ?? course.name);
    byDeck.set(d.id, label);
    if (places.has(label)) continue;
    const place = placeOf(tree, d.id, course.id, groupBy);
    if (place && hasPage(place)) places.set(label, place);
  }
  const byQuiz = quizLabels([...courses.values()], groupBy);
  const own = courseId ? courseDeck(tree, courseId) : null;
  return {
    groupOf: (deckId: string) => byDeck.get(deckId) ?? s.otherDecks,
    groupOfQuiz: (quizId: string) => byQuiz.get(quizId) ?? s.otherTests,
    placeOf: (label: string) => places.get(label) ?? null,
    whole: own,
  };
}
